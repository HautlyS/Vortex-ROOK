// Type definitions for the bridge layer
// Mirrors Rust models for TypeScript

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface PathCommand {
  type: 'moveTo' | 'lineTo' | 'curveTo' | 'closePath';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface PathData {
  commands: PathCommand[];
  fillRule?: 'nonZero' | 'evenOdd';
}

export interface ImageMetadata {
  width: number;
  height: number;
  colorSpace: string;
  dpi: number;
}

export interface LayerObject {
  id: string;
  type: 'text' | 'image' | 'vector' | 'shape' | 'watermark';
  bounds: Bounds;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  opacity: number;
  // Text fields
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  lineHeight?: number;
  letterSpacing?: number;
  backgroundColor?: string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  // Image fields
  imageUrl?: string;
  imagePath?: string;
  imageData?: ImageMetadata;
  // Shape/Vector fields
  shapeType?: string;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  pathData?: PathData;
  // Watermark fields
  blendMode?: string;
  watermarkPosition?: string;
  watermarkScale?: number;
  watermarkRotation?: number;
  watermarkTileSpacing?: number;
  // Transform
  transform?: TransformMatrix;
  // Metadata
  sourceType: 'extracted' | 'manual' | 'imported';
  role: 'background' | 'content' | 'header' | 'footer' | 'annotation';
  // Hierarchical text data (Paragraph → Line → Word)
  metadata?: {
    lines?: Array<{
      text: string;
      y: number;
      words: string[];
    }>;
    [key: string]: unknown;
  };
}

export interface PageData {
  pageIndex: number;
  width: number;
  height: number;
  dpi?: number;
  layers: LayerObject[];
  metadata?: {
    originalPageIndex?: number;
    rotation?: number;
    mediaBox?: [number, number, number, number];
  };
}

export interface DocumentData {
  pageWidth: number;
  pageHeight: number;
  pages: PageData[];
}

export interface DocumentMetadata {
  title: string;
  author: string;
  created: string;
  modified: string;
  description?: string;
}

export interface DocumentResponse {
  success: boolean;
  message: string;
  data?: DocumentData;
}

export interface ExportResult {
  success: boolean;
  message: string;
  outputPath?: string;
  data?: Uint8Array;
}

export interface BookProjectData {
  format: string;
  version: string;
  metadata: DocumentMetadata;
  document: DocumentData;
  settings: {
    defaultFont?: string;
    defaultFontSize?: number;
    exportQuality?: string;
  };
}

export interface LayerUpdates {
  bounds?: Bounds;
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  opacity?: number;
  content?: string;
  imagePath?: string;
  imageUrl?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  lineHeight?: number;
  letterSpacing?: number;
  backgroundColor?: string;
  color?: string;
  textAlign?: string;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  pathData?: PathData;
  transform?: TransformMatrix;
  blendMode?: string;
  watermarkPosition?: string;
  watermarkScale?: number;
  watermarkRotation?: number;
  watermarkTileSpacing?: number;
}

export interface ExportOptions {
  format: 'pdf' | 'docx' | 'bookproj' | 'png';
  filename?: string;
  pageRange?: [number, number];
  imageQuality?: number;       // 0.0 - 1.0 for JPEG/PNG compression
  compressText?: boolean;
  createLayers?: boolean;
  // PNG-specific
  pngScale?: number;           // Render scale (1.0 = 72dpi, 2.0 = 144dpi)
  zipMultiple?: boolean;       // ZIP multiple pages into single file
}

export type ExportFormat = ExportOptions['format'];

// PDF Content Analysis Types

/** PDF content type classification */
export type PdfContentType = 
  | 'image-only'    // Scanned document - only images, no extractable text
  | 'text-based'    // Native text PDF - primarily text with optional images
  | 'mixed'         // Mixed content - significant text and images
  | 'vector-heavy'  // Vector graphics heavy - diagrams, charts
  | 'empty';        // Empty or unreadable

/** Reconstruction recommendation */
export type ReconstructionRecommendation =
  | 'none'              // No reconstruction needed
  | 'ocr-required'      // Run OCR on image-only pages
  | 'ocr-verification'  // Enhance text extraction with OCR verification
  | 'vector-conversion'; // Vector to editable conversion available

/** Content statistics for a single page */
export interface PageContentStats {
  pageIndex: number;
  textObjects: number;
  imageObjects: number;
  pathObjects: number;
  textCharCount: number;
  imageCoverage: number;  // 0.0 - 1.0
  textCoverage: number;   // 0.0 - 1.0
}

/** Complete PDF analysis result */
export interface PdfAnalysis {
  contentType: PdfContentType;
  totalPages: number;
  totalTextObjects: number;
  totalImageObjects: number;
  totalPathObjects: number;
  totalCharCount: number;
  avgImageCoverage: number;
  avgTextCoverage: number;
  pageStats: PageContentStats[];
  confidence: number;  // 0.0 - 1.0
  recommendation: ReconstructionRecommendation;
}

/** Extended document response with analysis */
export interface DocumentResponseWithAnalysis extends DocumentResponse {
  analysis?: PdfAnalysis;
  imposition?: ImpositionResult;
}

/** OCR reconstruction options */
export interface OcrOptions {
  language?: string;
  renderDpi?: number;
  minConfidence?: number;
}

/** Reconstruction result */
export interface ReconstructionResult {
  success: boolean;
  message: string;
  pagesProcessed: number;
  textLayersAdded: number;
  confidence: number;
}

/** OCR word with bounding box */
export interface OcrWord {
  text: string;
  confidence: number;
  bounds: Bounds;
}

/** OCR recognition result */
export interface OcrResult {
  text: string;
  confidence: number;
  words: OcrWord[];
}

// ============================================================================
// Import Options Types
// ============================================================================

/** Import mode determines how the document is processed */
export type ImportMode = 
  | 'preserve'  // Embed as-is, no editing (fastest, smallest) - good for print
  | 'layers'    // Extract layers for editing (default)
  | 'ocr'       // Run OCR for text recognition
  | 'print'     // Print/booklet mode with imposition
  | 'combined'; // Combine multiple options (layers + ocr, layers + print, etc.)

/** Print imposition layout */
export type ImpositionLayout = 
  | '2-up'      // 2 pages per sheet side-by-side
  | 'booklet'   // Saddle-stitch booklet (signature folding)
  | '4-up'      // 4 pages per sheet (2x2 grid)
  | 'n-up';     // Custom N pages per sheet

/** Paper size for print imposition */
export type PaperSize = 'a4' | 'letter' | 'a3' | 'legal' | 'custom';

/** Paper dimensions in points (72 dpi) */
export const PAPER_SIZES: Record<Exclude<PaperSize, 'custom'>, { width: number; height: number }> = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
  a3: { width: 842, height: 1191 },
  legal: { width: 612, height: 1008 },
};

/** Print imposition options */
export interface ImpositionOptions {
  layout: ImpositionLayout;
  paperSize: PaperSize;
  customWidth?: number;
  customHeight?: number;
  landscape?: boolean;
  margins?: { top: number; right: number; bottom: number; left: number };
  nUpColumns?: number;  // For n-up layout
  nUpRows?: number;     // For n-up layout
  creepAdjustment?: number;  // Booklet creep compensation (mm)
  bleed?: number;       // Bleed area (points)
}

/** Import options for document import */
export interface ImportOptions {
  mode: ImportMode;
  // OCR options (when mode === 'ocr')
  ocrLanguage?: string;
  ocrDpi?: number;
  // Print options (when mode === 'print')
  imposition?: ImpositionOptions;
  // General options
  preserveAnnotations?: boolean;
  extractImages?: boolean;
}

/** Imposed page result */
export interface ImposedPage {
  sheetIndex: number;
  side: 'front' | 'back';
  slots: Array<{
    sourcePageIndex: number | null;  // null = blank
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }>;
}

/** Imposition result */
export interface ImpositionResult {
  sheets: ImposedPage[];
  totalSheets: number;
  paperSize: { width: number; height: number };
  duplex: boolean;
}
