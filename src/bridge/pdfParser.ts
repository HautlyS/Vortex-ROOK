// PDF.js integration for web PDF parsing
// Comprehensive extraction: text with fonts, images, proper coordinates
import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem, TextContent } from 'pdfjs-dist/types/src/display/api';
import type { PageData, LayerObject, Bounds } from './types';
import { findMatchingFont } from './fontService';
import {
  enhanceTextItems,
  groupIntoLines,
  splitLineIntoColumns,
  type EnhancedTextItem,
} from './pdfTextUtils';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// Image cache for web (blob URLs)
const imageCache = new Map<string, string>();
// Font match cache to avoid repeated lookups
const fontMatchCache = new Map<string, string>();
// PDF document cache for multi-page operations
let cachedPdfDoc: PDFDocument | null = null;

type PDFDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
type PDFPage = Awaited<ReturnType<PDFDocument['getPage']>>;

/** Yield to event loop for UI updates - uses rAF for reliable rendering */
const yieldToUI = () => new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 16)));

/**
 * Parse PDF file - extracts text layers and images with progress
 */
export async function parsePdf(
  data: Uint8Array,
  onProgress?: (current: number, total: number) => void | Promise<void>
): Promise<PageData[]> {
  const dataCopy = new Uint8Array(data);
  
  console.log('[PDF] Starting parse...');
  await onProgress?.(0, 1);
  await yieldToUI();
  
  console.log('[PDF] Loading document...');
  const pdf = await pdfjsLib.getDocument({ data: dataCopy }).promise;
  cachedPdfDoc = pdf;
  
  const pages: PageData[] = [];
  const totalPages = pdf.numPages;
  
  console.log(`[PDF] Document loaded: ${totalPages} pages`);
  await onProgress?.(0, totalPages);
  await yieldToUI();

  for (let i = 0; i < totalPages; i++) {
    console.log(`[PDF] Processing page ${i + 1}/${totalPages}`);
    await onProgress?.(i, totalPages);
    await yieldToUI();
    
    const page = await processPage(pdf, i + 1);
    pages.push(page);
    
    await onProgress?.(i + 1, totalPages);
    await yieldToUI();
  }

  console.log('[PDF] Parse complete');
  return pages;
}

/**
 * Process a single page
 */
async function processPage(
  pdf: PDFDocument,
  pageNum: number
): Promise<PageData> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const pageIndex = pageNum - 1;
  
  // Extract text with styles
  const textContent = await page.getTextContent({ includeMarkedContent: false });
  const textLayers = await extractTextLayers(textContent, pageIndex, viewport.height);
  
  // Extract images with text context for proper z-index
  let imageLayers = await extractImageLayers(page, pageIndex, viewport, textLayers);
  
  console.log(`Page ${pageNum}: ${textLayers.length} text, ${imageLayers.length} images`);
  
  // Fallback: If no text found, render entire page as image
  // This handles scanned docs, inline images, XObject forms, etc.
  if (textLayers.length === 0) {
    console.log(`Page ${pageNum}: No text, rendering as full-page image`);
    const fallbackImage = await renderPageAsImage(page, pageIndex, viewport);
    if (fallbackImage) {
      console.log(`Page ${pageNum}: Fallback image created, URL:`, fallbackImage.imageUrl?.substring(0, 50));
      imageLayers = [fallbackImage];
    } else {
      console.warn(`Page ${pageNum}: Failed to create fallback image`);
    }
  }
  
  // Combine and sort by Y position (top to bottom), then by z-index
  const layers = [...textLayers, ...imageLayers].sort((a, b) => {
    // Primary sort by Y position (top to bottom)
    const yDiff = a.bounds.y - b.bounds.y;
    if (Math.abs(yDiff) > 5) return yDiff;
    // Secondary sort by z-index for overlapping elements
    return a.zIndex - b.zIndex;
  });
  
  // Reassign z-indices based on sorted order
  layers.forEach((layer, idx) => {
    layer.zIndex = idx;
  });

  return {
    pageIndex,
    width: viewport.width,
    height: viewport.height,
    dpi: 72,
    layers,
  };
}

/**
 * Extract text layers - one layer per line for accurate positioning
 */
async function extractTextLayers(
  textContent: TextContent,
  pageIndex: number,
  pageHeight: number
): Promise<LayerObject[]> {
  const layers: LayerObject[] = [];
  const styles = textContent.styles as Record<string, { fontFamily: string }>;
  
  // Enhance items with computed metrics
  const enhanced = enhanceTextItems(textContent.items as TextItem[]);
  
  if (enhanced.length === 0) return layers;
  
  // Group into lines
  const lines = groupIntoLines(enhanced);
  
  let idx = 0;
  for (const lineItems of lines) {
    if (lineItems.length === 0) continue;
    
    // Split line into columns if needed (for multi-column layouts)
    const columns = splitLineIntoColumns(lineItems);
    
    for (const columnItems of columns) {
      if (columnItems.length === 0) continue;
      
      // Sort by X and build text with spacing
      const sorted = [...columnItems].sort((a, b) => a.x - b.x);
      const text = buildLineText(sorted);
      if (!text.trim()) continue;
      
      // Calculate bounds from items
      const minX = Math.min(...sorted.map(i => i.x));
      const maxX = Math.max(...sorted.map(i => i.endX));
      const avgY = sorted.reduce((sum, i) => sum + i.y, 0) / sorted.length;
      const maxFontSize = Math.max(...sorted.map(i => i.fontSize));
      
      // Width based on text length as fallback (more reliable)
      const calculatedWidth = maxX - minX;
      const textBasedWidth = text.length * maxFontSize * 0.55;
      const width = Math.max(calculatedWidth, textBasedWidth);
      
      // PDF.js returns ty as baseline position in PDF coords (origin at bottom-left)
      // Convert to screen coords (origin at top-left):
      // - avgY is the baseline position from bottom
      // - ascent (~80% of font size) is the distance from baseline to top of text
      // - screen_y = pageHeight - avgY - ascent
      const ascent = maxFontSize * 0.8;
      const y = pageHeight - avgY - ascent;
      const height = maxFontSize * 1.2;
      
      // Get font info
      const firstItem = sorted[0];
      let fontFamily = 'Arial';
      let fontWeight = 400;
      
      const style = styles[firstItem.fontName];
      if (style?.fontFamily) {
        const isBold = style.fontFamily.toLowerCase().includes('bold');
        const isItalic = style.fontFamily.toLowerCase().includes('italic');
        fontFamily = await matchFont(style.fontFamily, isBold, isItalic);
        fontWeight = isBold ? 700 : 400;
      }
      
      layers.push({
        id: `text-${pageIndex}-${idx}`,
        type: 'text',
        bounds: { x: minX, y, width, height } as Bounds,
        visible: true,
        locked: false,
        zIndex: idx,
        opacity: 1.0,
        content: text,
        fontFamily,
        fontSize: maxFontSize,
        fontWeight,
        color: '#000000',
        textAlign: 'left',
        sourceType: 'extracted',
        role: 'content',
      });
      
      idx++;
    }
  }
  
  return layers;
}

/**
 * Build text from line items with proper spacing
 */
function buildLineText(items: EnhancedTextItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].str;
  
  let result = items[0].str;
  
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    
    // Skip if already has space
    if (prev.str.endsWith(' ') || curr.str.startsWith(' ')) {
      result += curr.str;
      continue;
    }
    
    // Calculate gap
    const gap = curr.x - prev.endX;
    const spaceWidth = (prev.spaceWidth + curr.spaceWidth) / 2;
    
    // Add space if gap is significant (> 25% of space width)
    if (gap > spaceWidth * 0.25) {
      result += ' ';
    }
    
    result += curr.str;
  }
  
  return result;
}

/**
 * Match PDF font to available font with caching
 */
async function matchFont(pdfFontName: string, isBold: boolean, isItalic: boolean): Promise<string> {
  const cacheKey = `${pdfFontName}-${isBold}-${isItalic}`;
  
  if (fontMatchCache.has(cacheKey)) {
    return fontMatchCache.get(cacheKey)!;
  }
  
  try {
    const match = await findMatchingFont(pdfFontName, isBold, isItalic);
    fontMatchCache.set(cacheKey, match.cssFamily);
    return match.cssFamily;
  } catch {
    const fallback = normalizeFontFamily(pdfFontName);
    fontMatchCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Extract images from PDF page - images go BEHIND text
 */
async function extractImageLayers(
  page: PDFPage,
  pageIndex: number,
  viewport: { width: number; height: number },
  _textLayers: LayerObject[] = []
): Promise<LayerObject[]> {
  const layers: LayerObject[] = [];
  
  try {
    const operatorList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    
    let imageIdx = 0;
    const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]];
    let currentCTM = [1, 0, 0, 1, 0, 0];
    
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];
      
      // Track transformation matrix
      if (fn === OPS.save) {
        ctmStack.push([...currentCTM]);
      } else if (fn === OPS.restore) {
        currentCTM = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        currentCTM = multiplyMatrices(currentCTM, args as number[]);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintXObject) {
        const imgName = args[0] as string;
        
        try {
          const imgData = await getImageFromPage(page, imgName);
          
          if (imgData) {
            const [a, b, c, d, e, f] = currentCTM;
            
            // Calculate actual rendered dimensions from CTM
            // CTM: [a, b, c, d, e, f] where:
            // - a, d are scale factors (can be negative for flips)
            // - b, c are rotation/skew
            // - e, f are translation
            // For images, CTM typically scales from unit square to page coords
            let width = Math.sqrt(a * a + b * b);  // Horizontal scale
            let height = Math.sqrt(c * c + d * d); // Vertical scale
            
            // Fallback to image dimensions if CTM gives invalid size
            if (width < 1) width = imgData.width;
            if (height < 1) height = imgData.height;
            
            // Position calculation - handle flipped images (negative scale)
            let x = e;
            let y = viewport.height - f;
            
            // Adjust for negative scales (flipped images)
            if (d < 0) {
              y = viewport.height - f - height;
            } else {
              y = viewport.height - f - height;
            }
            
            // Clamp to viewport bounds for sanity
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            
            const imageUrl = await createImageBlobUrl(imgData.data, imgData.width, imgData.height);
            const layerId = `image-${pageIndex}-${imageIdx}`;
            
            imageCache.set(layerId, imageUrl);
            
            // Images always go behind text (negative z-index)
            const zIndex = -1000 + imageIdx;
            
            layers.push({
              id: layerId,
              type: 'image',
              bounds: { x, y, width, height } as Bounds,
              visible: true,
              locked: false,
              zIndex,
              opacity: 1.0,
              imageUrl,
              imageData: {
                width: imgData.width,
                height: imgData.height,
                colorSpace: 'RGBA',
                dpi: 72,
              },
              sourceType: 'extracted',
              role: 'content',
            });
            
            imageIdx++;
          }
        } catch (e) {
          console.warn(`Failed to extract image ${imgName}:`, e);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to extract images via operator list:', e);
  }
  
  return layers;
}

/**
 * Get image data from PDF page, converting to RGBA
 */
async function getImageFromPage(
  page: PDFPage,
  imgName: string
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    const objs = (page as unknown as { objs: { get: (name: string, callback: (obj: any) => void) => void } }).objs;
    if (!objs) return null;

    const imgObj = await new Promise<any>((resolve) => {
      objs.get(imgName, resolve);
    });

    if (!imgObj) return null;

    const width = imgObj.width;
    const height = imgObj.height;
    if (!width || !height) return null;
    
    // Handle ImageBitmap (newer pdf.js versions, most efficient)
    if (imgObj.bitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(imgObj.bitmap, 0, 0);
      return ctx.getImageData(0, 0, width, height);
    }

    // Handle raw image data with different kinds
    const kind = imgObj.kind;
    let data = imgObj.data as Uint8ClampedArray;

    if (!data) return null;

    // pdf.js ImageKind enum: 1: GRAYSCALE_8BPP, 2: RGB_24BPP, 3: RGBA_32BPP
    if (kind === 1) { // Grayscale
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0, j = 0; i < data.length; i++, j += 4) {
        rgba[j] = data[i];
        rgba[j + 1] = data[i];
        rgba[j + 2] = data[i];
        rgba[j + 3] = 255;
      }
      data = rgba;
    } else if (kind === 2) { // RGB
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        rgba[j] = data[i];
        rgba[j + 1] = data[i + 1];
        rgba[j + 2] = data[i + 2];
        rgba[j + 3] = 255;
      }
      data = rgba;
    }
    
    // Assume RGBA if kind is 3 or undefined but length is correct
    if (data.length === width * height * 4) {
      return { data, width, height };
    }

    return null;
  } catch (e) {
    console.error(`Error getting image ${imgName}:`, e);
    return null;
  }
}

/**
 * Create blob URL from RGBA image data
 */
function createImageBlobUrl(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas context not available'));

  const imageData = new ImageData(Uint8ClampedArray.from(data), width, height);
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/png');
  });
}

/**
 * Render entire page as image (fallback for complex/inline images)
 */
async function renderPageAsImage(
  page: PDFPage,
  pageIndex: number,
  viewport: { width: number; height: number }
): Promise<LayerObject | null> {
  try {
    const scale = 2.0;
    const scaledViewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      background: 'white', // PDF.js uses this as fallback if no background
    } as Parameters<typeof page.render>[0]).promise;
    
    const imageUrl = await new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(new Error('Failed to create blob'));
      }, 'image/png');
    });
    
    const layerId = `image-${pageIndex}-0`;
    imageCache.set(layerId, imageUrl);
    
    return {
      id: layerId,
      type: 'image',
      bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height } as Bounds,
      visible: true,
      locked: false,
      zIndex: 0,
      opacity: 1.0,
      imageUrl,
      imageData: {
        width: scaledViewport.width,
        height: scaledViewport.height,
        colorSpace: 'RGBA',
        dpi: Math.round(72 * scale),
      },
      sourceType: 'extracted',
      role: 'content',
    };
  } catch (e) {
    console.warn('Failed to render page as image:', e);
    return null;
  }
}

/**
 * Multiply two transformation matrices
 */
function multiplyMatrices(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Normalize font family name from PDF internal name
 */
function normalizeFontFamily(pdfFontName: string): string {
  const name = pdfFontName.toLowerCase();
  
  if (name.includes('arial') || name.includes('helvetica')) return 'Arial, Helvetica, sans-serif';
  if (name.includes('times')) return 'Times New Roman, Times, serif';
  if (name.includes('courier')) return 'Courier New, Courier, monospace';
  if (name.includes('georgia')) return 'Georgia, serif';
  if (name.includes('verdana')) return 'Verdana, sans-serif';
  if (name.includes('tahoma')) return 'Tahoma, sans-serif';
  if (name.includes('trebuchet')) return 'Trebuchet MS, sans-serif';
  if (name.includes('palatino')) return 'Palatino Linotype, Palatino, serif';
  if (name.includes('garamond')) return 'Garamond, serif';
  
  return 'Arial, sans-serif';
}

/**
 * Render PDF page to canvas for preview/thumbnail
 */
export async function renderPdfPageToCanvas(
  data: Uint8Array,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.0
): Promise<void> {
  // Copy data to avoid detached buffer error
  const dataCopy = new Uint8Array(data);
  
  const pdf = await pdfjsLib.getDocument({ data: dataCopy }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  await page.render({ 
    canvasContext: ctx, 
    viewport 
  } as Parameters<typeof page.render>[0]).promise;
}

/**
 * Get cached image URL
 */
export function getCachedImageUrl(layerId: string): string | undefined {
  return imageCache.get(layerId);
}

/**
 * Clear image cache (call when document is closed)
 */
export function clearImageCache(): void {
  for (const url of imageCache.values()) {
    URL.revokeObjectURL(url);
  }
  imageCache.clear();
  fontMatchCache.clear();
  cachedPdfDoc = null;
}

/**
 * Get page count from cached PDF
 */
export function getCachedPageCount(): number {
  return cachedPdfDoc?.numPages ?? 0;
}

/**
 * Check if a page is likely scanned (image-only, no text)
 */
export function isScannedPage(page: PageData): boolean {
  const textLayers = page.layers.filter((l) => l.type === 'text');
  const imageLayers = page.layers.filter((l) => l.type === 'image');

  // Scanned if: has images but no/minimal text
  if (imageLayers.length > 0 && textLayers.length === 0) return true;

  // Check if images cover most of the page
  const pageArea = page.width * page.height;
  const imageCoverage = imageLayers.reduce(
    (sum, l) => sum + l.bounds.width * l.bounds.height,
    0
  );

  // If images cover >80% and text is minimal, likely scanned
  return imageCoverage / pageArea > 0.8 && textLayers.length < 3;
}

/**
 * Get cached PDF page for OCR rendering
 */
export async function getCachedPage(pageNum: number): Promise<PDFPage | null> {
  if (!cachedPdfDoc) return null;
  return cachedPdfDoc.getPage(pageNum);
}

/**
 * Re-render a specific page (useful for zoom changes)
 */
export async function rerenderPage(
  pageNum: number,
  scale: number = 1.0
): Promise<PageData | null> {
  if (!cachedPdfDoc) return null;
  
  const page = await cachedPdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const pageIndex = pageNum - 1;
  
  const textContent = await page.getTextContent({ includeMarkedContent: false });
  const textLayers = await extractTextLayers(textContent, pageIndex, viewport.height);
  const imageLayers = await extractImageLayers(page, pageIndex, viewport, textLayers);
  
  // Sort and reassign z-indices
  const layers = [...textLayers, ...imageLayers].sort((a, b) => {
    const yDiff = a.bounds.y - b.bounds.y;
    if (Math.abs(yDiff) > 5) return yDiff;
    return a.zIndex - b.zIndex;
  });
  
  layers.forEach((layer, idx) => {
    layer.zIndex = idx;
  });
  
  return {
    pageIndex,
    width: viewport.width,
    height: viewport.height,
    dpi: Math.round(72 * scale),
    layers,
  };
}


/**
 * Render PDF pages as images (preserve mode - no text extraction)
 * Each page becomes a single image layer
 */
export async function renderPdfPagesToImages(
  data: Uint8Array,
  onProgress?: (current: number, total: number) => void | Promise<void>
): Promise<PageData[]> {
  const dataCopy = new Uint8Array(data);
  const pdf = await pdfjsLib.getDocument({ data: dataCopy }).promise;
  cachedPdfDoc = pdf;
  
  const pages: PageData[] = [];
  const totalPages = pdf.numPages;
  
  for (let i = 0; i < totalPages; i++) {
    await onProgress?.(i, totalPages);
    await yieldToUI();
    
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for quality
    
    // Render to canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    
    // Convert to blob URL
    const blob = await new Promise<Blob>((resolve) => 
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const imageUrl = URL.createObjectURL(blob);
    const layerId = `preserve-page-${i}`;
    imageCache.set(layerId, imageUrl);
    
    // Original dimensions (not scaled)
    const origViewport = page.getViewport({ scale: 1.0 });
    
    pages.push({
      pageIndex: i,
      width: origViewport.width,
      height: origViewport.height,
      dpi: 72,
      layers: [{
        id: layerId,
        type: 'image',
        bounds: { x: 0, y: 0, width: origViewport.width, height: origViewport.height },
        visible: true,
        locked: true, // Locked in preserve mode
        zIndex: 0,
        opacity: 1,
        imageUrl,
        sourceType: 'imported',
        role: 'background',
      }],
    });
  }
  
  await onProgress?.(totalPages, totalPages);
  return pages;
}
