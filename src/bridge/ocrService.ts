// OCR Service - Tesseract.js WASM bridge for web
import { createWorker, type Worker, type RecognizeResult } from 'tesseract.js';
import type { LayerObject, Bounds, OcrResult, OcrWord } from './types';

let worker: Worker | null = null;
let initPromise: Promise<Worker> | null = null;

/** OCR progress callback */
export type OcrProgressCallback = (progress: number, status: string) => void;

/** Initialize OCR worker (lazy, reusable) */
export async function initOcr(lang = 'eng'): Promise<Worker> {
  if (worker) return worker;
  if (initPromise) return initPromise;

  initPromise = createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        // Progress available via m.progress (0-1)
      }
    },
  });

  worker = await initPromise;
  return worker;
}

/** Terminate OCR worker */
export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    initPromise = null;
  }
}

/** Check if OCR is initialized */
export function isOcrReady(): boolean {
  return worker !== null;
}

/** Recognize text from image/canvas, returns full result */
export async function recognizeImage(
  image: HTMLCanvasElement | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<OcrResult> {
  const w = await initOcr();

  const result = await w.recognize(image, {}, { blocks: true });

  const words = extractWords(result);
  const confidence = result.data.confidence / 100;

  onProgress?.(1, 'OCR complete');

  return {
    text: result.data.text,
    confidence,
    words,
  };
}

/** Recognize specific region of an image */
export async function recognizeRegion(
  image: HTMLCanvasElement | Blob | string,
  bounds: Bounds
): Promise<OcrResult> {
  const w = await initOcr();

  const result = await w.recognize(image, {
    rectangle: {
      left: Math.round(bounds.x),
      top: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    },
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence / 100,
    words: extractWords(result),
  };
}

/** OCR a page image and return LayerObjects */
export async function ocrPageToLayers(
  image: HTMLCanvasElement | Blob,
  pageIndex: number,
  _pageHeight: number,
  onProgress?: OcrProgressCallback
): Promise<LayerObject[]> {
  onProgress?.(0, 'Starting OCR...');

  const result = await recognizeImage(image, onProgress);
  const layers: LayerObject[] = [];

  // Group words into lines
  const lines = groupWordsIntoLines(result.words);
  let idx = 0;

  for (const line of lines) {
    if (line.length === 0) continue;

    const text = line.map((w) => w.text).join(' ');
    if (!text.trim()) continue;

    // Calculate line bounds
    const minX = Math.min(...line.map((w) => w.bounds.x));
    const minY = Math.min(...line.map((w) => w.bounds.y));
    const maxX = Math.max(...line.map((w) => w.bounds.x + w.bounds.width));
    const maxY = Math.max(...line.map((w) => w.bounds.y + w.bounds.height));
    const avgConf = line.reduce((s, w) => s + w.confidence, 0) / line.length;

    // Skip low confidence lines
    if (avgConf < 0.3) continue;

    const height = maxY - minY;
    const fontSize = Math.max(8, Math.min(72, height * 0.9));

    layers.push({
      id: `ocr-${pageIndex}-${idx}`,
      type: 'text',
      bounds: { x: minX, y: minY, width: maxX - minX, height },
      visible: true,
      locked: false,
      zIndex: idx,
      opacity: 1.0,
      content: text,
      fontFamily: 'Arial',
      fontSize,
      fontWeight: 400,
      color: '#000000',
      textAlign: 'left',
      sourceType: 'extracted',
      role: 'content',
    });

    idx++;
  }

  onProgress?.(1, `OCR complete: ${layers.length} text regions`);
  return layers;
}

/** Extract words with bounds from Tesseract result */
function extractWords(result: RecognizeResult): OcrWord[] {
  const words: OcrWord[] = [];

  for (const block of result.data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          if (word.text.trim()) {
            words.push({
              text: word.text,
              confidence: word.confidence / 100,
              bounds: {
                x: word.bbox.x0,
                y: word.bbox.y0,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0,
              },
            });
          }
        }
      }
    }
  }

  return words;
}

/** Group words into lines based on Y position */
function groupWordsIntoLines(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];

  // Sort by Y then X
  const sorted = [...words].sort((a, b) => {
    const yDiff = a.bounds.y - b.bounds.y;
    return Math.abs(yDiff) < 5 ? a.bounds.x - b.bounds.x : yDiff;
  });

  const lines: OcrWord[][] = [];
  let currentLine: OcrWord[] = [sorted[0]];
  let lastY = sorted[0].bounds.y;

  for (let i = 1; i < sorted.length; i++) {
    const word = sorted[i];
    const avgHeight =
      currentLine.reduce((s, w) => s + w.bounds.height, 0) / currentLine.length;

    // New line if Y difference > half average height
    if (Math.abs(word.bounds.y - lastY) > avgHeight * 0.5) {
      lines.push(currentLine);
      currentLine = [word];
      lastY = word.bounds.y;
    } else {
      currentLine.push(word);
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/** Render PDF page to canvas for OCR */
export async function renderPageToCanvas(
  pdfPage: unknown,
  scale = 2.0
): Promise<HTMLCanvasElement> {
  const page = pdfPage as {
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: unknown;
    }) => { promise: Promise<void> };
  };

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
