// PDF Content Analyzer for Web
// Uses PDF.js to detect content type (image-only, text-based, mixed, vector-heavy)

import * as pdfjsLib from 'pdfjs-dist';
import type {
  PdfContentType,
  PdfAnalysis,
  PageContentStats,
  ReconstructionRecommendation,
} from './types';

// Ensure worker is set (may already be set by pdfParser.ts)
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

type PDFDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
type PDFPage = Awaited<ReturnType<PDFDocument['getPage']>>;

/**
 * Analyze PDF content type from Uint8Array data
 */
export async function analyzePdfContent(data: Uint8Array): Promise<PdfAnalysis> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const totalPages = pdf.numPages;

  if (totalPages === 0) {
    return createEmptyAnalysis();
  }

  const pageStats: PageContentStats[] = [];
  let totalText = 0;
  let totalImages = 0;
  let totalPaths = 0;
  let totalChars = 0;
  let totalImageCoverage = 0;
  let totalTextCoverage = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const stats = await analyzePageContent(page, pageNum - 1);

    totalText += stats.textObjects;
    totalImages += stats.imageObjects;
    totalPaths += stats.pathObjects;
    totalChars += stats.textCharCount;
    totalImageCoverage += stats.imageCoverage;
    totalTextCoverage += stats.textCoverage;

    pageStats.push(stats);
  }

  const avgImageCoverage = totalImageCoverage / totalPages;
  const avgTextCoverage = totalTextCoverage / totalPages;

  const { contentType, confidence } = classifyContent(
    totalText,
    totalImages,
    totalPaths,
    totalChars,
    avgImageCoverage,
    avgTextCoverage
  );

  const recommendation = determineRecommendation(contentType, avgImageCoverage);

  return {
    contentType,
    totalPages,
    totalTextObjects: totalText,
    totalImageObjects: totalImages,
    totalPathObjects: totalPaths,
    totalCharCount: totalChars,
    avgImageCoverage,
    avgTextCoverage,
    pageStats,
    confidence,
    recommendation,
  };
}

/**
 * Analyze a single page's content
 */
async function analyzePageContent(page: PDFPage, pageIndex: number): Promise<PageContentStats> {
  const viewport = page.getViewport({ scale: 1.0 });
  const pageArea = viewport.width * viewport.height;

  let textObjects = 0;
  let imageObjects = 0;
  let pathObjects = 0;
  let textCharCount = 0;
  let imageArea = 0;
  let textArea = 0;

  // Analyze text content
  try {
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if ('str' in item && item.str) {
        textObjects++;
        textCharCount += item.str.length;
        // Estimate text area from transform
        const [scaleX, , , scaleY] = item.transform;
        const fontSize = Math.abs(scaleY) || Math.abs(scaleX) || 12;
        textArea += item.width * fontSize * 1.2;
      }
    }
  } catch (e) {
    console.warn('Failed to get text content:', e);
  }

  // Analyze operator list for images and paths
  try {
    const operatorList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]];
    let currentCTM = [1, 0, 0, 1, 0, 0];

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      if (fn === OPS.save) {
        ctmStack.push([...currentCTM]);
      } else if (fn === OPS.restore) {
        currentCTM = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        currentCTM = multiplyMatrices(currentCTM, args as number[]);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintXObject) {
        imageObjects++;
        // Estimate image area from CTM
        const [a, , , d] = currentCTM;
        imageArea += Math.abs(a * d);
      } else if (
        fn === OPS.moveTo ||
        fn === OPS.lineTo ||
        fn === OPS.curveTo ||
        fn === OPS.rectangle ||
        fn === OPS.stroke ||
        fn === OPS.fill
      ) {
        pathObjects++;
      }
    }
  } catch (e) {
    console.warn('Failed to analyze operator list:', e);
  }

  return {
    pageIndex,
    textObjects,
    imageObjects,
    pathObjects,
    textCharCount,
    imageCoverage: Math.min(imageArea / pageArea, 1.0),
    textCoverage: Math.min(textArea / pageArea, 1.0),
  };
}

/**
 * Classify PDF content type based on statistics
 */
function classifyContent(
  textObjects: number,
  imageObjects: number,
  pathObjects: number,
  charCount: number,
  avgImageCoverage: number,
  _avgTextCoverage: number
): { contentType: PdfContentType; confidence: number } {
  // Image-only: high image coverage, minimal text
  if (avgImageCoverage > 0.7 && charCount < 50 && textObjects < 5) {
    return { contentType: 'image-only', confidence: 0.95 };
  }

  // Text-based: significant text, low image coverage
  if (charCount > 100 && avgImageCoverage < 0.2 && textObjects > imageObjects * 2) {
    return { contentType: 'text-based', confidence: 0.9 };
  }

  // Vector-heavy: many path objects, low text/image
  if (pathObjects > (textObjects + imageObjects) * 2 && pathObjects > 50) {
    return { contentType: 'vector-heavy', confidence: 0.85 };
  }

  // Mixed: significant both text and images
  if (charCount > 50 && imageObjects > 0 && avgImageCoverage > 0.1) {
    return { contentType: 'mixed', confidence: 0.8 };
  }

  // Default to text-based if there's any text
  if (charCount > 0 || textObjects > 0) {
    return { contentType: 'text-based', confidence: 0.7 };
  }

  return { contentType: 'empty', confidence: 0.5 };
}

/**
 * Determine reconstruction recommendation
 */
function determineRecommendation(
  contentType: PdfContentType,
  avgImageCoverage: number
): ReconstructionRecommendation {
  switch (contentType) {
    case 'image-only':
      return 'ocr-required';
    case 'mixed':
      return avgImageCoverage > 0.5 ? 'ocr-verification' : 'none';
    case 'vector-heavy':
      return 'vector-conversion';
    default:
      return 'none';
  }
}

/**
 * Create empty analysis result
 */
function createEmptyAnalysis(): PdfAnalysis {
  return {
    contentType: 'empty',
    totalPages: 0,
    totalTextObjects: 0,
    totalImageObjects: 0,
    totalPathObjects: 0,
    totalCharCount: 0,
    avgImageCoverage: 0,
    avgTextCoverage: 0,
    pageStats: [],
    confidence: 1.0,
    recommendation: 'none',
  };
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
 * Get human-readable description of content type
 */
export function getContentTypeDescription(contentType: PdfContentType): string {
  switch (contentType) {
    case 'image-only':
      return 'Scanned Document (Image-Only)';
    case 'text-based':
      return 'Native Text PDF';
    case 'mixed':
      return 'Mixed Content (Text + Images)';
    case 'vector-heavy':
      return 'Vector Graphics Heavy';
    case 'empty':
      return 'Empty Document';
  }
}

/**
 * Get human-readable recommendation text
 */
export function getRecommendationText(recommendation: ReconstructionRecommendation): string {
  switch (recommendation) {
    case 'ocr-required':
      return 'OCR recommended to extract text from images';
    case 'ocr-verification':
      return 'OCR verification available to improve accuracy';
    case 'vector-conversion':
      return 'Vector elements can be converted to editable shapes';
    case 'none':
      return 'No reconstruction needed';
  }
}
