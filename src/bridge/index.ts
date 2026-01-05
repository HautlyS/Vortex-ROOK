// Main Bridge - Routes calls between Tauri and Web/WASM

import { isTauri } from './environment';
import { initWasm, getWasm } from './wasm';
import { pickFile, downloadFile, getMimeType, getExtension, createZipFromBlobs } from './fileHandlers';
import { parsePdf, clearImageCache } from './pdfParser';
import { analyzePdfContent as analyzeWebPdf } from './pdfAnalyzer';
import { exportPagesToPng, renderPageToPng } from './pngExporter';
import type {
  DocumentResponse,
  DocumentMetadata,
  PageData,
  BookProjectData,
  ExportResult,
  ExportOptions,
  LayerObject,
  LayerUpdates,
  PdfAnalysis,
  DocumentResponseWithAnalysis,
  OcrOptions,
  ReconstructionResult,
  ImportOptions,
} from './types';
import { calculateImposition } from './printImposition';

// Tauri imports (only used in Tauri environment)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DialogModule = { open: (options?: any) => Promise<any>; save: (options?: any) => Promise<any> };

let invoke: InvokeFn | null = null;
let tauriDialog: DialogModule | null = null;

/**
 * Initialize the bridge (call on app startup)
 */
export async function initBridge(): Promise<void> {
  if (isTauri()) {
    const tauri = await import('@tauri-apps/api/core');
    invoke = tauri.invoke;
    const dialog = await import('@tauri-apps/plugin-dialog');
    tauriDialog = dialog;
  } else {
    await initWasm();
  }
}

/**
 * Import document from file
 */
export async function importDocument(
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponse> {
  if (isTauri()) {
    // Tauri: Use native file dialog
    const filePath = await tauriDialog?.open({
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx'] }],
    });
    
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, message: 'No file selected', data: undefined };
    }

    const fileType = filePath.endsWith('.pdf') ? 'pdf' : 'docx';
    return invoke?.('import_document', { filePath, fileType }) as Promise<DocumentResponse>;
  }

  // Web: Use browser file picker
  const file = await pickFile({ accept: ['.pdf', '.docx'] });
  if (!file) {
    return { success: false, message: 'No file selected', data: undefined };
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    clearImageCache();
    
    onProgress?.(0, 1, 'Loading PDF...');
    const pages = await parsePdf(file.data, (current, total) => {
      const status = current === 0 
        ? 'Initializing...' 
        : `Extracting page ${current}/${total}`;
      onProgress?.(current, total, status);
    });
    
    onProgress?.(pages.length, pages.length, 'Complete!');
    
    return {
      success: true,
      message: 'Document imported successfully',
      data: { 
        pageWidth: pages[0]?.width || 612, 
        pageHeight: pages[0]?.height || 792, 
        pages 
      },
    };
  }

  onProgress?.(0, 1, 'Parsing DOCX...');
  const wasm = getWasm();
  return wasm.parse_docx(file.data);
}

/**
 * Import document with user-selected options
 * Supports: preserve (as-is), layers (editable), ocr, print (imposition)
 */
export async function importDocumentWithOptions(
  options: ImportOptions,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponseWithAnalysis> {
  // Pick file first
  const file = await pickFile({ accept: ['.pdf', '.docx'] });
  if (!file) {
    return { success: false, message: 'No file selected', data: undefined };
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  
  if (!isPdf) {
    // DOCX always uses layers mode
    onProgress?.(0, 1, 'Parsing DOCX...');
    const wasm = getWasm();
    return wasm.parse_docx(file.data);
  }

  clearImageCache();
  
  switch (options.mode) {
    case 'preserve':
      return importPreserveMode(file.data, onProgress);
    
    case 'layers':
      return importLayersMode(file.data, onProgress);
    
    case 'ocr':
      return importOcrMode(file.data, options, onProgress);
    
    case 'print':
      return importPrintMode(file.data, options, onProgress);
    
    default:
      return importLayersMode(file.data, onProgress);
  }
}

/** Preserve mode: Render PDF as images, no editing */
async function importPreserveMode(
  data: Uint8Array,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponseWithAnalysis> {
  onProgress?.(0, 1, 'Loading PDF (preserve mode)...');
  
  const { renderPdfPagesToImages } = await import('./pdfParser');
  const pages = await renderPdfPagesToImages(data, (current, total) => {
    onProgress?.(current, total, `Rendering page ${current}/${total}`);
  });
  
  return {
    success: true,
    message: 'Document imported (preserved)',
    data: { pageWidth: pages[0]?.width || 612, pageHeight: pages[0]?.height || 792, pages },
  };
}

/** Layers mode: Extract text/images as editable layers (default) */
async function importLayersMode(
  data: Uint8Array,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponseWithAnalysis> {
  onProgress?.(0, 1, 'Loading PDF...');
  
  const pages = await parsePdf(data, (current, total) => {
    onProgress?.(current, total, `Extracting page ${current}/${total}`);
  });
  
  const analysis = await analyzeWebPdf(data);
  
  return {
    success: true,
    message: 'Document imported with layers',
    data: { pageWidth: pages[0]?.width || 612, pageHeight: pages[0]?.height || 792, pages },
    analysis,
  };
}

/** OCR mode: Run text recognition on scanned pages */
async function importOcrMode(
  data: Uint8Array,
  _options: ImportOptions,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponseWithAnalysis> {
  onProgress?.(0, 1, 'Loading PDF for OCR...');
  
  // First render pages as images
  const { renderPdfPagesToImages } = await import('./pdfParser');
  const pages = await renderPdfPagesToImages(data, (current, total) => {
    onProgress?.(current, total, `Rendering page ${current}/${total}`);
  });
  
  // Then run OCR on each page
  const { ocrPageToLayers, renderPageToCanvas } = await import('./ocrService');
  const { getCachedPage } = await import('./pdfParser');
  
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i, pages.length, `OCR page ${i + 1}/${pages.length}`);
    
    const page = await getCachedPage(i + 1);
    if (page) {
      const canvas = await renderPageToCanvas(page, 2.0);
      const ocrLayers = await ocrPageToLayers(canvas, i, pages[i].height);
      pages[i].layers = [...pages[i].layers, ...ocrLayers];
    }
  }
  
  return {
    success: true,
    message: 'Document imported with OCR',
    data: { pageWidth: pages[0]?.width || 612, pageHeight: pages[0]?.height || 792, pages },
  };
}

/** Print mode: Apply imposition for book printing */
async function importPrintMode(
  data: Uint8Array,
  options: ImportOptions,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponseWithAnalysis> {
  onProgress?.(0, 1, 'Loading PDF for print layout...');
  
  // First extract pages normally
  const pages = await parsePdf(data, (current, total) => {
    onProgress?.(current, total, `Extracting page ${current}/${total}`);
  });
  
  if (!options.imposition) {
    return {
      success: true,
      message: 'Document imported',
      data: { pageWidth: pages[0]?.width || 612, pageHeight: pages[0]?.height || 792, pages },
    };
  }
  
  onProgress?.(pages.length, pages.length, 'Calculating imposition...');
  
  // Calculate imposition
  const imposition = calculateImposition(pages.length, options.imposition);
  
  // Create imposed pages
  const imposedPages: PageData[] = imposition.sheets.map((sheet, idx) => ({
    pageIndex: idx,
    width: imposition.paperSize.width,
    height: imposition.paperSize.height,
    dpi: 72,
    layers: sheet.slots.map((slot, slotIdx) => {
      if (slot.sourcePageIndex === null) {
        // Blank slot
        return {
          id: `imposed-${idx}-${slotIdx}`,
          type: 'shape' as const,
          bounds: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
          visible: true,
          locked: false,
          zIndex: slotIdx,
          opacity: 1,
          sourceType: 'manual' as const,
          role: 'content' as const,
        };
      }
      
      // Copy layers from source page, scaled to fit slot
      const sourcePage = pages[slot.sourcePageIndex];
      const scaleX = slot.width / sourcePage.width;
      const scaleY = slot.height / sourcePage.height;
      const scale = Math.min(scaleX, scaleY);
      
      return {
        id: `imposed-${idx}-${slotIdx}`,
        type: 'image' as const,
        bounds: { x: slot.x, y: slot.y, width: sourcePage.width * scale, height: sourcePage.height * scale },
        visible: true,
        locked: false,
        zIndex: slotIdx,
        opacity: 1,
        sourceType: 'imported' as const,
        role: 'content' as const,
        metadata: { sourcePageIndex: slot.sourcePageIndex, rotation: slot.rotation },
      };
    }),
  }));
  
  return {
    success: true,
    message: `Imposed: ${imposition.totalSheets} sheets`,
    data: { 
      pageWidth: imposition.paperSize.width, 
      pageHeight: imposition.paperSize.height, 
      pages: imposedPages 
    },
  };
}

/**
 * Export document to file
 */
export async function exportDocument(
  pages: PageData[],
  metadata: DocumentMetadata,
  options: ExportOptions,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<ExportResult> {
  const filename = options.filename || metadata.title || 'document';
  const pagesToExport = options.pageRange 
    ? pages.slice(options.pageRange[0], options.pageRange[1] + 1)
    : pages;

  // PNG Export (works on both Tauri and Web)
  if (options.format === 'png') {
    return exportPng(pagesToExport, filename, options, onProgress);
  }

  const format = options.format; // Now narrowed to 'pdf' | 'docx' | 'bookproj'

  if (isTauri()) {
    const outputPath = await tauriDialog?.save({
      defaultPath: `${filename}${getExtension(format)}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    
    if (!outputPath) {
      return { success: false, message: 'Export cancelled' };
    }

    return invoke?.('export_document', {
      format,
      pages: pagesToExport,
      outputPath,
      metadata,
      options: { ...options, outputPath },
    }) as Promise<ExportResult>;
  }

  // Web: Generate file and download
  const wasm = getWasm();
  let data: Uint8Array;
  
  try {
    if (format === 'bookproj') {
      data = wasm.export_bookproj(pagesToExport, metadata);
    } else if (format === 'docx') {
      data = wasm.export_docx(pagesToExport, metadata);
    } else {
      return { success: false, message: 'PDF export requires desktop app' };
    }

    downloadFile(data, `${filename}${getExtension(format)}`, getMimeType(`${filename}${getExtension(format)}`));
    
    return { success: true, message: 'Export completed', data };
  } catch (error) {
    return { success: false, message: `Export failed: ${error}` };
  }
}

/**
 * Export pages as PNG (single or ZIP)
 */
async function exportPng(
  pages: PageData[],
  filename: string,
  options: ExportOptions,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<ExportResult> {
  const scale = options.pngScale || 2.0;
  const quality = options.imageQuality || 0.92;
  
  try {
    if (pages.length === 1 && !options.zipMultiple) {
      // Single PNG
      onProgress?.(1, 1, 'Rendering page...');
      const blob = await renderPageToPng(pages[0], scale, quality);
      downloadFile(new Uint8Array(await blob.arrayBuffer()), `${filename}.png`, 'image/png');
      return { success: true, message: 'PNG exported' };
    }
    
    // Multiple pages → ZIP
    onProgress?.(0, pages.length, 'Preparing export...');
    const blobs = await exportPagesToPng(pages, scale, quality, (current, total) => {
      onProgress?.(current, total, `Rendering page ${current} of ${total}`);
    });
    
    onProgress?.(pages.length, pages.length, 'Creating ZIP...');
    const files = blobs.map((blob, i) => ({
      name: `${filename}_page_${String(i + 1).padStart(3, '0')}.png`,
      data: blob
    }));
    
    const compressionLevel = options.imageQuality ? Math.round((1 - options.imageQuality) * 9) : 6;
    const zipBlob = await createZipFromBlobs(files, compressionLevel);
    
    downloadFile(new Uint8Array(await zipBlob.arrayBuffer()), `${filename}.zip`, 'application/zip');
    return { success: true, message: `Exported ${pages.length} pages as ZIP` };
  } catch (error) {
    return { success: false, message: `PNG export failed: ${error}` };
  }
}

/**
 * Save project
 */
export async function saveProject(project: BookProjectData): Promise<ExportResult> {
  if (isTauri()) {
    const outputPath = await tauriDialog?.save({
      filters: [{ name: 'Book Project', extensions: ['bookproj'] }],
    });
    
    if (!outputPath) {
      return { success: false, message: 'Save cancelled' };
    }

    return invoke?.('save_project', { project, outputPath }) as Promise<ExportResult>;
  }

  // Web: Download as file
  const wasm = getWasm();
  const data = wasm.save_project(project);
  const filename = `${project.metadata.title || 'project'}.bookproj`;
  downloadFile(data, filename, 'application/json');
  
  return { success: true, message: 'Project saved' };
}

/**
 * Load project
 */
export async function loadProject(): Promise<BookProjectData | null> {
  if (isTauri()) {
    const filePath = await tauriDialog?.open({
      filters: [{ name: 'Book Project', extensions: ['bookproj'] }],
    });
    
    if (!filePath || typeof filePath !== 'string') return null;
    
    return invoke?.('load_project', { filePath }) as Promise<BookProjectData>;
  }

  // Web: Use file picker
  const file = await pickFile({ accept: ['.bookproj'] });
  if (!file) return null;

  const wasm = getWasm();
  return wasm.load_project(file.data);
}

/**
 * Update layer
 */
export async function updateLayer(
  pageIndex: number,
  layerId: string,
  updates: LayerUpdates,
  currentLayer?: LayerObject
): Promise<LayerObject | null> {
  if (isTauri()) {
    return invoke?.('update_layer', { pageIndex, layerId, updates }) as Promise<LayerObject>;
  }

  // Web: Use WASM
  if (!currentLayer) return null;
  const wasm = getWasm();
  return wasm.update_layer(currentLayer, updates);
}

/**
 * Delete layer (handled in frontend for web)
 */
export async function deleteLayer(pageIndex: number, layerId: string): Promise<boolean> {
  if (isTauri()) {
    await invoke?.('delete_layer', { pageIndex, layerId });
    return true;
  }
  // Web: Handled by frontend store
  return true;
}

/**
 * Reorder layers (handled in frontend for web)
 */
export async function reorderLayers(pageIndex: number, layerIds: string[]): Promise<boolean> {
  if (isTauri()) {
    await invoke?.('reorder_layers', { pageIndex, layerIds });
    return true;
  }
  // Web: Handled by frontend store
  return true;
}

/**
 * Get image data
 */
export async function getImage(imageId: string): Promise<Uint8Array | null> {
  if (isTauri()) {
    return invoke?.('get_image', { imageId }) as Promise<Uint8Array>;
  }

  const wasm = getWasm();
  return wasm.get_image(imageId) || null;
}

/**
 * Cache image
 */
export function cacheImage(imageId: string, data: Uint8Array): void {
  if (!isTauri()) {
    const wasm = getWasm();
    wasm.cache_image(imageId, data);
  }
}

// Re-export types and utilities
export * from './types';
export * from './environment';
export { pickFile, pickFiles, downloadFile } from './fileHandlers';
export { clearImageCache, isScannedPage, getCachedPage, renderPdfPagesToImages } from './pdfParser';
export * from './fontService';
export { 
  getTypographyBridge,
  initTypographyBridge,
  getAvailableFonts,
  searchFonts,
  applyTextFormatting,
  validateFontSupport,
  preloadCommonFonts,
  getFontFallbackChain,
  calculateTextMetrics,
  type TypographyBridge,
  type TextMetrics,
} from './typographyBridge';
export { 
  analyzePdfContent, 
  getContentTypeDescription, 
  getRecommendationText 
} from './pdfAnalyzer';
export {
  initOcr,
  terminateOcr,
  isOcrReady,
  recognizeImage,
  recognizeRegion,
  ocrPageToLayers,
  renderPageToCanvas,
  type OcrProgressCallback,
} from './ocrService';
export {
  calculateImposition,
  impose2Up,
  imposeBooklet,
  impose4Up,
  imposeNUp,
  getImpositionDescription,
} from './printImposition';

/**
 * Analyze PDF content type (image-only, text-based, mixed, vector-heavy)
 * Works in both Tauri and Web environments
 */
export async function analyzePdf(filePathOrData: string | Uint8Array): Promise<PdfAnalysis> {
  if (isTauri() && typeof filePathOrData === 'string') {
    return invoke?.('analyze_pdf_content', { filePath: filePathOrData }) as Promise<PdfAnalysis>;
  }
  
  // Web: analyze from Uint8Array
  if (filePathOrData instanceof Uint8Array) {
    return analyzeWebPdf(filePathOrData);
  }
  
  throw new Error('Invalid input: Tauri requires file path, Web requires Uint8Array');
}

/**
 * Reconstruct PDF with OCR (Tauri only - requires native OCR)
 * For web, use ocrPageToLayers from ocrService
 */
export async function reconstructPdfWithOcr(
  filePath: string,
  options?: OcrOptions,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<ReconstructionResult> {
  if (!isTauri()) {
    return {
      success: false,
      message: 'Use ocrPageToLayers() for web OCR reconstruction',
      pagesProcessed: 0,
      textLayersAdded: 0,
      confidence: 0,
    };
  }

  // Listen for progress events
  if (onProgress) {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<{ currentPage: number; totalPages: number; status: string }>(
      'ocr_progress',
      (event) => {
        onProgress(event.payload.currentPage, event.payload.totalPages, event.payload.status);
      }
    );
    
    try {
      const result = await invoke?.('reconstruct_pdf_with_ocr', { filePath, options }) as ReconstructionResult;
      unlisten();
      return result;
    } catch (e) {
      unlisten();
      throw e;
    }
  }

  return invoke?.('reconstruct_pdf_with_ocr', { filePath, options }) as Promise<ReconstructionResult>;
}

/**
 * OCR a scanned page in web mode
 * Renders page to canvas and runs Tesseract.js OCR
 */
export async function ocrScannedPage(
  pageIndex: number,
  onProgress?: (progress: number, status: string) => void
): Promise<LayerObject[]> {
  if (isTauri()) {
    throw new Error('Use reconstructPdfWithOcr for Tauri OCR');
  }

  const { getCachedPage } = await import('./pdfParser');
  const { ocrPageToLayers, renderPageToCanvas } = await import('./ocrService');

  const page = await getCachedPage(pageIndex + 1);
  if (!page) throw new Error('Page not cached');

  onProgress?.(0.1, 'Rendering page...');
  const canvas = await renderPageToCanvas(page, 2.0); // 2x scale for better OCR

  onProgress?.(0.3, 'Running OCR...');
  const viewport = (page as { getViewport: (o: { scale: number }) => { height: number } }).getViewport({ scale: 1.0 });
  
  return ocrPageToLayers(canvas, pageIndex, viewport.height, (p, s) => {
    onProgress?.(0.3 + p * 0.7, s);
  });
}

/**
 * Check if document needs OCR reconstruction
 */
export function needsOcrReconstruction(analysis: PdfAnalysis): boolean {
  return analysis.recommendation === 'ocr-required' || analysis.recommendation === 'ocr-verification';
}

/**
 * Import document with analysis
 * Returns document data along with content analysis for PDFs
 */
export async function importDocumentWithAnalysis(
  onProgress?: (current: number, total: number, status: string) => void
): Promise<DocumentResponseWithAnalysis> {
  if (isTauri()) {
    const filePath = await tauriDialog?.open({
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx'] }],
    });
    
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, message: 'No file selected', data: undefined };
    }

    const fileType = filePath.endsWith('.pdf') ? 'pdf' : 'docx';
    const response = await invoke?.('import_document', { filePath, fileType }) as DocumentResponse;
    
    // Add analysis for PDFs
    if (response.success && fileType === 'pdf') {
      try {
        const analysis = await invoke?.('analyze_pdf_content', { filePath }) as PdfAnalysis;
        return { ...response, analysis };
      } catch (e) {
        console.warn('PDF analysis failed:', e);
        return response;
      }
    }
    
    return response;
  }

  // Web: Use browser file picker
  const file = await pickFile({ accept: ['.pdf', '.docx'] });
  if (!file) {
    return { success: false, message: 'No file selected', data: undefined };
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    clearImageCache();
    await onProgress?.(0, 1, 'Loading PDF...');
    
    const pages = await parsePdf(file.data, async (current, total) => {
      const status = current === 0 
        ? 'Initializing parser...' 
        : `Extracting page ${current} of ${total}`;
      await onProgress?.(current, total, status);
    });
    
    await onProgress?.(pages.length, pages.length, 'Analyzing content...');
    const analysis = await analyzeWebPdf(file.data);
    
    await onProgress?.(pages.length, pages.length, 'Complete!');
    
    return {
      success: true,
      message: 'Document imported successfully',
      data: { 
        pageWidth: pages[0]?.width || 612, 
        pageHeight: pages[0]?.height || 792, 
        pages 
      },
      analysis,
    };
  }

  await onProgress?.(0, 1, 'Parsing DOCX...');
  const wasm = getWasm();
  return wasm.parse_docx(file.data);
}
