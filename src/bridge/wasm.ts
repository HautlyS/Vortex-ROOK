// Enhanced WASM module loader with lazy loading, web workers, and error handling
import type {
  DocumentResponse,
  PageData,
  DocumentMetadata,
  BookProjectData,
  LayerObject,
  LayerUpdates,
} from './types';

// WASM module interface
interface WasmModule {
  parse_docx(data: Uint8Array): DocumentResponse;
  process_pdf_page(pageData: PageData): PageData;
  create_document_from_pages(pages: PageData[], width: number, height: number): DocumentResponse;
  export_bookproj(pages: PageData[], metadata: DocumentMetadata): Uint8Array;
  export_docx(pages: PageData[], metadata: DocumentMetadata): Uint8Array;
  load_project(data: Uint8Array): BookProjectData;
  save_project(project: BookProjectData): Uint8Array;
  cache_image(id: string, data: Uint8Array): void;
  get_image(id: string): Uint8Array | undefined;
  clear_image_cache(): void;
  update_layer(layer: LayerObject, updates: LayerUpdates): LayerObject;
  // Typography functions
  get_system_fonts(): string[];
  search_fonts(query: string): { family: string; variants: string[]; category: string }[];
  apply_text_formatting(layer: LayerObject, formatting: Record<string, unknown>): LayerObject;
  default(input?: string | URL): Promise<void>;
}

// Module state
let wasmModule: WasmModule | null = null;
let wasmLoadPromise: Promise<WasmModule> | null = null;
let loadError: Error | null = null;
let worker: Worker | null = null;

// Configuration
const WASM_LOAD_TIMEOUT = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * WASM loading state
 */
export type WasmState = 'unloaded' | 'loading' | 'loaded' | 'error';

/**
 * Get current WASM loading state
 */
export function getWasmState(): WasmState {
  if (loadError) return 'error';
  if (wasmModule) return 'loaded';
  if (wasmLoadPromise) return 'loading';
  return 'unloaded';
}

/**
 * Get WASM load error if any
 */
export function getWasmError(): Error | null {
  return loadError;
}

/**
 * Initialize and load WASM module with retry logic
 */
export async function initWasm(): Promise<WasmModule> {
  // Return cached module
  if (wasmModule) return wasmModule;
  
  // Return existing promise if loading
  if (wasmLoadPromise) return wasmLoadPromise;

  // Clear previous error
  loadError = null;

  wasmLoadPromise = loadWasmWithRetry();
  
  try {
    wasmModule = await wasmLoadPromise;
    return wasmModule;
  } catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error));
    wasmLoadPromise = null;
    throw loadError;
  }
}

/**
 * Load WASM with retry logic
 */
async function loadWasmWithRetry(attempt = 1): Promise<WasmModule> {
  try {
    return await loadWasmWithTimeout();
  } catch (error) {
    if (attempt < MAX_RETRY_ATTEMPTS) {
      console.warn(`WASM load attempt ${attempt} failed, retrying...`, error);
      await delay(RETRY_DELAY * attempt);
      return loadWasmWithRetry(attempt + 1);
    }
    throw error;
  }
}

/**
 * Load WASM with timeout
 */
async function loadWasmWithTimeout(): Promise<WasmModule> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('WASM load timeout')), WASM_LOAD_TIMEOUT);
  });

  const loadPromise = loadWasmModule();
  
  return Promise.race([loadPromise, timeoutPromise]);
}

/**
 * Core WASM loading logic
 */
async function loadWasmModule(): Promise<WasmModule> {
  try {
    // Dynamic import of wasm-pack generated module
    const wasm = await import('book-creation-wasm');
    
    // For production builds, the .wasm file is at the root
    // For dev, it's served from src-wasm/pkg via Vite's fs.allow
    const wasmPath = import.meta.env.DEV
      ? '/src-wasm/pkg/book_creation_wasm_bg.wasm'
      : './book_creation_wasm_bg.wasm';
    
    await wasm.default({ module_or_path: wasmPath });
    
    return wasm as unknown as WasmModule;
  } catch (error) {
    console.error('Failed to load WASM module:', error);
    throw new Error(
      `WASM module failed to load. ${
        error instanceof Error ? error.message : 'Unknown error'
      }. Run: pnpm wasm:build`
    );
  }
}

/**
 * Get loaded WASM module (throws if not initialized)
 */
export function getWasm(): WasmModule {
  if (!wasmModule) {
    throw new Error('WASM not initialized. Call initWasm() first.');
  }
  return wasmModule;
}

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
  return wasmModule !== null;
}

/**
 * Lazy load WASM only when needed
 */
export async function ensureWasm(): Promise<WasmModule> {
  if (wasmModule) return wasmModule;
  return initWasm();
}

/**
 * Reset WASM state (useful for testing or recovery)
 */
export function resetWasm(): void {
  wasmModule = null;
  wasmLoadPromise = null;
  loadError = null;
  terminateWorker();
}

// ============================================================================
// Web Worker Support for Heavy Operations
// ============================================================================

interface WorkerMessage {
  id: string;
  type: 'parse_docx' | 'export_docx' | 'export_bookproj' | 'process_page';
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();

/**
 * Initialize web worker for heavy operations
 */
export function initWorker(): Worker | null {
  if (worker) return worker;
  
  // Check for worker support
  if (typeof Worker === 'undefined') {
    console.warn('Web Workers not supported');
    return null;
  }

  try {
    // Create inline worker
    const workerCode = `
      let wasm = null;
      
      self.onmessage = async (e) => {
        const { id, type, payload } = e.data;
        
        try {
          if (!wasm) {
            const module = await import('book-creation-wasm');
            await module.default();
            wasm = module;
          }
          
          let result;
          switch (type) {
            case 'parse_docx':
              result = wasm.parse_docx(payload.data);
              break;
            case 'export_docx':
              result = wasm.export_docx(payload.pages, payload.metadata);
              break;
            case 'export_bookproj':
              result = wasm.export_bookproj(payload.pages, payload.metadata);
              break;
            case 'process_page':
              result = wasm.process_pdf_page(payload.pageData);
              break;
            default:
              throw new Error('Unknown operation: ' + type);
          }
          
          self.postMessage({ id, success: true, result });
        } catch (error) {
          self.postMessage({ 
            id, 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, success, result, error } = e.data;
      const pending = pendingRequests.get(id);
      
      if (pending) {
        pendingRequests.delete(id);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker operation failed'));
        }
      }
    };

    worker.onerror = (e) => {
      console.error('Worker error:', e);
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error('Worker error'));
        pendingRequests.delete(id);
      }
    };

    return worker;
  } catch (error) {
    console.warn('Failed to create worker:', error);
    return null;
  }
}

/**
 * Terminate web worker
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pendingRequests.clear();
}

/**
 * Execute operation in worker
 */
async function executeInWorker<T>(
  type: WorkerMessage['type'],
  payload: unknown
): Promise<T> {
  const w = initWorker();
  
  if (!w) {
    // Fallback to main thread
    return executeOnMainThread(type, payload);
  }

  const id = generateId();
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { 
      resolve: resolve as (value: unknown) => void, 
      reject 
    });
    
    w.postMessage({ id, type, payload });
    
    // Timeout for worker operations
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Worker operation timeout'));
      }
    }, 60000); // 60 second timeout
  });
}

/**
 * Fallback execution on main thread
 */
async function executeOnMainThread<T>(
  type: WorkerMessage['type'],
  payload: unknown
): Promise<T> {
  const wasm = await ensureWasm();
  const p = payload as Record<string, unknown>;
  
  switch (type) {
    case 'parse_docx':
      return wasm.parse_docx(p.data as Uint8Array) as T;
    case 'export_docx':
      return wasm.export_docx(p.pages as PageData[], p.metadata as DocumentMetadata) as T;
    case 'export_bookproj':
      return wasm.export_bookproj(p.pages as PageData[], p.metadata as DocumentMetadata) as T;
    case 'process_page':
      return wasm.process_pdf_page(p.pageData as PageData) as T;
    default:
      throw new Error(`Unknown operation: ${type}`);
  }
}

// ============================================================================
// High-Level API with Worker Support
// ============================================================================

/**
 * Parse DOCX file (uses worker if available)
 */
export async function parseDocx(data: Uint8Array): Promise<DocumentResponse> {
  return executeInWorker<DocumentResponse>('parse_docx', { data });
}

/**
 * Export to DOCX (uses worker if available)
 */
export async function exportDocx(
  pages: PageData[],
  metadata: DocumentMetadata
): Promise<Uint8Array> {
  return executeInWorker<Uint8Array>('export_docx', { pages, metadata });
}

/**
 * Export to bookproj (uses worker if available)
 */
export async function exportBookproj(
  pages: PageData[],
  metadata: DocumentMetadata
): Promise<Uint8Array> {
  return executeInWorker<Uint8Array>('export_bookproj', { pages, metadata });
}

/**
 * Process PDF page (uses worker if available)
 */
export async function processPdfPage(pageData: PageData): Promise<PageData> {
  return executeInWorker<PageData>('process_page', { pageData });
}

// ============================================================================
// Memory Management
// ============================================================================

/**
 * Clear WASM memory caches
 */
export function clearWasmCaches(): void {
  if (wasmModule) {
    try {
      wasmModule.clear_image_cache();
    } catch (e) {
      console.warn('Failed to clear WASM cache:', e);
    }
  }
}

/**
 * Get approximate WASM memory usage
 */
export function getWasmMemoryUsage(): { used: number; total: number } | null {
  try {
    // Access WebAssembly memory if available
    const memory = (wasmModule as unknown as { memory?: WebAssembly.Memory })?.memory;
    if (memory) {
      const buffer = memory.buffer;
      return {
        used: buffer.byteLength,
        total: memory.buffer.byteLength,
      };
    }
  } catch {
    // Memory access not available
  }
  return null;
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Re-export types
export type { WasmModule };
