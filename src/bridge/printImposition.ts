// Print Imposition Utilities
// Algorithms for 2-up, booklet, and n-up page layouts for book printing

import type {
  ImpositionOptions,
  ImpositionResult,
  ImposedPage,
  PaperSize,
} from './types';

const SIZES: Record<Exclude<PaperSize, 'custom'>, { width: number; height: number }> = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
  a3: { width: 842, height: 1191 },
  legal: { width: 612, height: 1008 },
};

/** Get paper dimensions */
function getPaperSize(options: ImpositionOptions): { width: number; height: number } {
  if (options.paperSize === 'custom') {
    return { width: options.customWidth || 595, height: options.customHeight || 842 };
  }
  const size = SIZES[options.paperSize];
  return options.landscape ? { width: size.height, height: size.width } : size;
}

/** Calculate slot dimensions with margins */
function getSlotArea(paper: { width: number; height: number }, margins: ImpositionOptions['margins'], cols: number, rows: number) {
  const m = margins || { top: 36, right: 36, bottom: 36, left: 36 };
  const usableW = paper.width - m.left - m.right;
  const usableH = paper.height - m.top - m.bottom;
  return {
    slotW: usableW / cols,
    slotH: usableH / rows,
    startX: m.left,
    startY: m.top,
  };
}

/**
 * 2-up imposition: 2 pages side-by-side per sheet
 */
export function impose2Up(totalPages: number, options: ImpositionOptions): ImpositionResult {
  const paper = getPaperSize(options);
  const { slotW, slotH, startX, startY } = getSlotArea(paper, options.margins, 2, 1);
  const sheets: ImposedPage[] = [];
  
  for (let i = 0; i < totalPages; i += 2) {
    sheets.push({
      sheetIndex: Math.floor(i / 2),
      side: 'front',
      slots: [
        { sourcePageIndex: i, x: startX, y: startY, width: slotW, height: slotH, rotation: 0 },
        { sourcePageIndex: i + 1 < totalPages ? i + 1 : null, x: startX + slotW, y: startY, width: slotW, height: slotH, rotation: 0 },
      ],
    });
  }
  
  return { sheets, totalSheets: sheets.length, paperSize: paper, duplex: false };
}

/**
 * Booklet imposition: Saddle-stitch signature folding
 * Pages arranged for folding in half and stapling at spine
 */
export function imposeBooklet(totalPages: number, options: ImpositionOptions): ImpositionResult {
  const paper = getPaperSize(options);
  const { slotW, slotH, startX, startY } = getSlotArea(paper, options.margins, 2, 1);
  
  // Round up to multiple of 4 for booklet
  const paddedPages = Math.ceil(totalPages / 4) * 4;
  const sheets: ImposedPage[] = [];
  const creep = options.creepAdjustment || 0;
  
  // Generate booklet page order
  // For a booklet: sheet 1 front = [last, 1], back = [2, last-1], etc.
  for (let sheet = 0; sheet < paddedPages / 4; sheet++) {
    const creepOffset = sheet * creep;
    
    // Front side: [paddedPages - sheet*2, sheet*2 + 1]
    const frontLeft = paddedPages - 1 - sheet * 2;
    const frontRight = sheet * 2;
    
    sheets.push({
      sheetIndex: sheet,
      side: 'front',
      slots: [
        { 
          sourcePageIndex: frontLeft < totalPages ? frontLeft : null, 
          x: startX - creepOffset, y: startY, width: slotW, height: slotH, rotation: 0 
        },
        { 
          sourcePageIndex: frontRight < totalPages ? frontRight : null, 
          x: startX + slotW + creepOffset, y: startY, width: slotW, height: slotH, rotation: 0 
        },
      ],
    });
    
    // Back side: [sheet*2 + 2, paddedPages - sheet*2 - 1]
    const backLeft = sheet * 2 + 1;
    const backRight = paddedPages - 2 - sheet * 2;
    
    sheets.push({
      sheetIndex: sheet,
      side: 'back',
      slots: [
        { 
          sourcePageIndex: backLeft < totalPages ? backLeft : null, 
          x: startX + creepOffset, y: startY, width: slotW, height: slotH, rotation: 0 
        },
        { 
          sourcePageIndex: backRight < totalPages ? backRight : null, 
          x: startX + slotW - creepOffset, y: startY, width: slotW, height: slotH, rotation: 0 
        },
      ],
    });
  }
  
  return { sheets, totalSheets: paddedPages / 4, paperSize: paper, duplex: true };
}

/**
 * 4-up imposition: 4 pages per sheet (2x2 grid)
 */
export function impose4Up(totalPages: number, options: ImpositionOptions): ImpositionResult {
  const paper = getPaperSize(options);
  const { slotW, slotH, startX, startY } = getSlotArea(paper, options.margins, 2, 2);
  const sheets: ImposedPage[] = [];
  
  for (let i = 0; i < totalPages; i += 4) {
    sheets.push({
      sheetIndex: Math.floor(i / 4),
      side: 'front',
      slots: [
        { sourcePageIndex: i, x: startX, y: startY, width: slotW, height: slotH, rotation: 0 },
        { sourcePageIndex: i + 1 < totalPages ? i + 1 : null, x: startX + slotW, y: startY, width: slotW, height: slotH, rotation: 0 },
        { sourcePageIndex: i + 2 < totalPages ? i + 2 : null, x: startX, y: startY + slotH, width: slotW, height: slotH, rotation: 0 },
        { sourcePageIndex: i + 3 < totalPages ? i + 3 : null, x: startX + slotW, y: startY + slotH, width: slotW, height: slotH, rotation: 0 },
      ],
    });
  }
  
  return { sheets, totalSheets: sheets.length, paperSize: paper, duplex: false };
}

/**
 * N-up imposition: Custom grid layout
 */
export function imposeNUp(totalPages: number, options: ImpositionOptions): ImpositionResult {
  const cols = options.nUpColumns || 2;
  const rows = options.nUpRows || 2;
  const perSheet = cols * rows;
  
  const paper = getPaperSize(options);
  const { slotW, slotH, startX, startY } = getSlotArea(paper, options.margins, cols, rows);
  const sheets: ImposedPage[] = [];
  
  for (let i = 0; i < totalPages; i += perSheet) {
    const slots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pageIdx = i + r * cols + c;
        slots.push({
          sourcePageIndex: pageIdx < totalPages ? pageIdx : null,
          x: startX + c * slotW,
          y: startY + r * slotH,
          width: slotW,
          height: slotH,
          rotation: 0,
        });
      }
    }
    sheets.push({ sheetIndex: Math.floor(i / perSheet), side: 'front', slots });
  }
  
  return { sheets, totalSheets: sheets.length, paperSize: paper, duplex: false };
}

/**
 * Main imposition function - routes to appropriate algorithm
 */
export function calculateImposition(totalPages: number, options: ImpositionOptions): ImpositionResult {
  switch (options.layout) {
    case '2-up': return impose2Up(totalPages, options);
    case 'booklet': return imposeBooklet(totalPages, options);
    case '4-up': return impose4Up(totalPages, options);
    case 'n-up': return imposeNUp(totalPages, options);
    default: return impose2Up(totalPages, options);
  }
}

/**
 * Get human-readable description of imposition
 */
export function getImpositionDescription(result: ImpositionResult, _layout: string): string {
  const { totalSheets, duplex, paperSize } = result;
  const sizeStr = `${Math.round(paperSize.width)}×${Math.round(paperSize.height)}pt`;
  const duplexStr = duplex ? ' (duplex)' : '';
  return `${totalSheets} sheet${totalSheets !== 1 ? 's' : ''} @ ${sizeStr}${duplexStr}`;
}
