/**
 * Layer Data Models
 *
 * Core data structures for layers, pages, and documents.
 */

/** Layer type enumeration */
export type LayerType = 'text' | 'image' | 'vector' | 'shape' | 'watermark'

/** Blend mode enumeration */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'dissolve'

/** Text alignment options */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/** Shape type enumeration */
export type ShapeType = 'rectangle' | 'circle' | 'line' | 'polygon'

/** Source type indicating how the layer was created */
export type SourceType = 'extracted' | 'manual' | 'imported'

/** Layer role in the document */
export type LayerRole = 'background' | 'content' | 'header' | 'footer' | 'annotation'

/** Fill rule for paths */
export type FillRule = 'nonZero' | 'evenOdd'

/** Bounding box coordinates in PDF points (1/72 inch) */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** 2D Transformation matrix */
export interface TransformMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

/** Path command for vector graphics */
export type PathCommand =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'curveTo'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'closePath' }

/** Path data for vector layers */
export interface PathData {
  commands: PathCommand[]
  fillRule?: FillRule
}

/** Image metadata */
export interface ImageMetadata {
  width: number
  height: number
  colorSpace: 'RGB' | 'RGBA' | 'Grayscale'
  dpi: number
}

/** Watermark position enumeration */
export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile'

/** A discrete visual element on a page */
export interface LayerObject {
  id: string
  type: LayerType
  bounds: Bounds
  visible: boolean
  locked: boolean
  zIndex: number
  opacity: number

  // Text-specific fields
  content?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  lineHeight?: number
  letterSpacing?: number
  color?: string
  backgroundColor?: string
  textAlign?: TextAlign

  // Image-specific fields
  imageUrl?: string
  imagePath?: string
  imageData?: ImageMetadata

  // Shape/Vector-specific fields
  shapeType?: ShapeType
  strokeColor?: string
  strokeWidth?: number
  fillColor?: string
  pathData?: PathData

  // Watermark-specific fields
  blendMode?: BlendMode
  watermarkPosition?: WatermarkPosition
  watermarkScale?: number
  watermarkRotation?: number
  watermarkTileSpacing?: number

  // Transform for exact positioning
  transform?: TransformMatrix

  // Metadata
  sourceType: SourceType
  role: LayerRole
}

/** Page metadata */
export interface PageMetadata {
  originalPageIndex?: number
  rotation?: 0 | 90 | 180 | 270
  mediaBox?: [number, number, number, number]
}

/** A single page containing multiple layers */
export interface PageData {
  pageIndex: number
  width: number
  height: number
  dpi?: number
  layers: LayerObject[]
  metadata?: PageMetadata
}

/** Document metadata */
export interface DocumentMetadata {
  title: string
  author: string
  created: string
  modified: string
  description?: string
}

/** Document data containing all pages */
export interface DocumentData {
  pageWidth: number
  pageHeight: number
  pages: PageData[]
}

/** Project settings */
export interface ProjectSettings {
  defaultFont?: string
  defaultFontSize?: number
  exportQuality?: 'draft' | 'standard' | 'high'
}

/** Complete book project data */
export interface BookProjectData {
  format: 'bookproj'
  version: string
  metadata: DocumentMetadata
  document: DocumentData
  settings: ProjectSettings
  history?: HistoryData
}

/** History entry types */
export type HistoryEntryType =
  | 'layer_update'
  | 'layer_add'
  | 'layer_delete'
  | 'page_add'
  | 'page_delete'
  | 'page_reorder'

/** History entry for undo/redo */
export interface HistoryEntry {
  type: HistoryEntryType
  timestamp: string
  pageIndex?: number
  layerId?: string
  previousState: unknown
  newState: unknown
}

/** History data for project persistence */
export interface HistoryData {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
}

/** Response from document import operations */
export interface DocumentResponse {
  success: boolean
  message: string
  data?: DocumentData
}

/** Result from export operations */
export interface ExportResult {
  success: boolean
  message: string
  outputPath?: string
}

/** Layer update request */
export interface LayerUpdates {
  type?: LayerType
  bounds?: Bounds
  visible?: boolean
  locked?: boolean
  zIndex?: number
  opacity?: number
  content?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  lineHeight?: number
  letterSpacing?: number
  color?: string
  backgroundColor?: string
  textAlign?: TextAlign
  role?: LayerRole
  imagePath?: string
  imageUrl?: string
  shapeType?: ShapeType
  strokeColor?: string
  strokeWidth?: number
  fillColor?: string
  blendMode?: BlendMode
  watermarkPosition?: WatermarkPosition
  watermarkScale?: number
  watermarkRotation?: number
  watermarkTileSpacing?: number
}

/** Source file information */
export interface SourceInfo {
  path: string
  type: 'pdf' | 'docx'
  name: string
}

/**
 * Create a new bounds object
 */
export function createBounds(x: number, y: number, width: number, height: number): Bounds {
  return { x, y, width, height }
}

/**
 * Create default document metadata
 */
export function createDefaultMetadata(): DocumentMetadata {
  const now = new Date().toISOString()
  return {
    title: '',
    author: '',
    created: now,
    modified: now
  }
}

/**
 * Create default project settings
 */
export function createDefaultSettings(): ProjectSettings {
  return {
    defaultFont: 'Arial',
    defaultFontSize: 12,
    exportQuality: 'standard'
  }
}

/**
 * Create a new empty book project
 */
export function createEmptyProject(): BookProjectData {
  return {
    format: 'bookproj',
    version: '1.0.0',
    metadata: createDefaultMetadata(),
    document: {
      pageWidth: 612, // US Letter width in points
      pageHeight: 792, // US Letter height in points
      pages: []
    },
    settings: createDefaultSettings()
  }
}

/**
 * Validate a layer object has required fields
 */
export function isValidLayer(layer: unknown): layer is LayerObject {
  if (typeof layer !== 'object' || layer === null) return false

  const obj = layer as Record<string, unknown>

  return (
    typeof obj.id === 'string' &&
    ['text', 'image', 'vector', 'shape'].includes(obj.type as string) &&
    typeof obj.bounds === 'object' &&
    obj.bounds !== null &&
    typeof (obj.bounds as Bounds).x === 'number' &&
    typeof (obj.bounds as Bounds).y === 'number' &&
    typeof (obj.bounds as Bounds).width === 'number' &&
    typeof (obj.bounds as Bounds).height === 'number' &&
    typeof obj.visible === 'boolean' &&
    typeof obj.locked === 'boolean' &&
    typeof obj.zIndex === 'number' &&
    typeof obj.opacity === 'number' &&
    ['extracted', 'manual', 'imported'].includes(obj.sourceType as string) &&
    ['background', 'content', 'header', 'footer', 'annotation'].includes(obj.role as string)
  )
}

/**
 * Validate a text layer has required text-specific fields
 */
export function isValidTextLayer(layer: LayerObject): boolean {
  if (layer.type !== 'text') return false
  return (
    layer.content !== undefined || layer.fontFamily !== undefined || layer.fontSize !== undefined
  )
}

/**
 * Validate an image layer has required image-specific fields
 */
export function isValidImageLayer(layer: LayerObject): boolean {
  if (layer.type !== 'image') return false
  return (
    layer.imageUrl !== undefined || layer.imagePath !== undefined || layer.imageData !== undefined
  )
}

/**
 * Validate a shape layer has required shape-specific fields
 */
export function isValidShapeLayer(layer: LayerObject): boolean {
  if (layer.type !== 'shape') return false
  return layer.shapeType !== undefined
}

/**
 * Validate bounds have positive dimensions
 */
export function isValidBounds(bounds: Bounds): boolean {
  return (
    typeof bounds.x === 'number' &&
    typeof bounds.y === 'number' &&
    typeof bounds.width === 'number' &&
    typeof bounds.height === 'number' &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    !isNaN(bounds.x) &&
    !isNaN(bounds.y) &&
    !isNaN(bounds.width) &&
    !isNaN(bounds.height)
  )
}

/**
 * Validate page data
 */
export function isValidPageData(page: unknown): page is PageData {
  if (typeof page !== 'object' || page === null) return false

  const obj = page as Record<string, unknown>

  return (
    typeof obj.pageIndex === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number' &&
    Array.isArray(obj.layers)
  )
}

/**
 * Serialize a layer object to JSON string
 */
export function serializeLayer(layer: LayerObject): string {
  return JSON.stringify(layer)
}

/**
 * Deserialize a JSON string to layer object
 */
export function deserializeLayer(json: string): LayerObject | null {
  try {
    const parsed = JSON.parse(json)
    if (isValidLayer(parsed)) {
      return parsed as LayerObject
    }
    return null
  } catch {
    return null
  }
}

/**
 * Serialize a book project to JSON string
 */
export function serializeProject(project: BookProjectData): string {
  return JSON.stringify(project, null, 2)
}

/**
 * Deserialize a JSON string to book project
 */
export function deserializeProject(json: string): BookProjectData | null {
  try {
    const parsed = JSON.parse(json)
    if (
      parsed &&
      parsed.format === 'bookproj' &&
      parsed.version &&
      parsed.metadata &&
      parsed.document &&
      parsed.settings
    ) {
      return parsed as BookProjectData
    }
    return null
  } catch {
    return null
  }
}

// Security utilities
function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url
  const lower = url.toLowerCase().trim()
  if (lower.startsWith('javascript:')) return undefined
  if (lower.startsWith('data:') && !lower.startsWith('data:image/')) return undefined
  return url
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Create a sanitized layer with validated inputs
 */
export function createSanitizedLayer(input: Partial<LayerObject> & { id: string; type: LayerType }): LayerObject {
  return {
    id: input.id,
    type: input.type,
    bounds: {
      x: input.bounds?.x ?? 0,
      y: input.bounds?.y ?? 0,
      width: Math.max(0, input.bounds?.width ?? 100),
      height: Math.max(0, input.bounds?.height ?? 100),
    },
    visible: input.visible ?? true,
    locked: input.locked ?? false,
    zIndex: Math.round(input.zIndex ?? 0),
    opacity: clamp(input.opacity ?? 1, 0, 1),
    content: input.content,
    fontFamily: input.fontFamily?.replace(/["'\\]/g, ''),
    fontSize: input.fontSize ? Math.max(1, input.fontSize) : undefined,
    fontWeight: input.fontWeight,
    fontStyle: input.fontStyle,
    textDecoration: input.textDecoration,
    textTransform: input.textTransform,
    lineHeight: input.lineHeight,
    letterSpacing: input.letterSpacing,
    color: input.color,
    backgroundColor: input.backgroundColor,
    textAlign: input.textAlign,
    imageUrl: sanitizeUrl(input.imageUrl),
    imagePath: input.imagePath,
    imageData: input.imageData,
    shapeType: input.shapeType,
    strokeColor: input.strokeColor,
    strokeWidth: input.strokeWidth,
    fillColor: input.fillColor,
    pathData: input.pathData,
    blendMode: input.blendMode,
    watermarkPosition: input.watermarkPosition,
    watermarkScale: input.watermarkScale,
    watermarkRotation: input.watermarkRotation,
    watermarkTileSpacing: input.watermarkTileSpacing,
    transform: input.transform,
    sourceType: input.sourceType ?? 'manual',
    role: input.role ?? 'content',
  }
}
