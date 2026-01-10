// Print Imposition Utilities
// Algorithms for 2-up, booklet, and n-up page layouts for book printing

import type {
  ImpositionOptions,
  ImpositionResult,
  ImposedPage,
  ImpositionLayout,
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
 * 
 * For an 8-page booklet (pages 1-8, 0-indexed as 0-7):
 * - Sheet 0 Front: [8, 1] → indices [7, 0]
 * - Sheet 0 Back:  [2, 7] → indices [1, 6]
 * - Sheet 1 Front: [6, 3] → indices [5, 2]
 * - Sheet 1 Back:  [4, 5] → indices [3, 4]
 * 
 * Formula (0-indexed, N pages, sheet s):
 * - Front: [N-1-2s, 2s]
 * - Back:  [2s+1, N-2-2s]
 * 
 * Creep: Inner sheets need slight inward shift to compensate for paper thickness
 */
export function imposeBooklet(totalPages: number, options: ImpositionOptions): ImpositionResult {
  const paper = getPaperSize(options);
  const { slotW, slotH, startX, startY } = getSlotArea(paper, options.margins, 2, 1);
  
  // Round up to multiple of 4 for booklet (each sheet = 4 pages)
  const paddedPages = Math.ceil(totalPages / 4) * 4;
  const numSheets = paddedPages / 4;
  const sheets: ImposedPage[] = [];
  
  // Creep: mm per sheet, converted to points (1mm ≈ 2.83pt)
  const creepPerSheet = (options.creepAdjustment || 0) * 2.83;
  
  for (let sheet = 0; sheet < numSheets; sheet++) {
    // Creep increases for inner sheets (sheet 0 = outermost)
    const creepOffset = sheet * creepPerSheet;
    
    // Front side: [last - 2*sheet, 2*sheet] (0-indexed)
    const frontLeft = paddedPages - 1 - sheet * 2;
    const frontRight = sheet * 2;
    
    sheets.push({
      sheetIndex: sheet,
      side: 'front',
      slots: [
        { 
          sourcePageIndex: frontLeft < totalPages ? frontLeft : null, 
          x: startX, 
          y: startY, 
          width: slotW - creepOffset, 
          height: slotH, 
          rotation: 0 
        },
        { 
          sourcePageIndex: frontRight < totalPages ? frontRight : null, 
          x: startX + slotW + creepOffset, 
          y: startY, 
          width: slotW - creepOffset, 
          height: slotH, 
          rotation: 0 
        },
      ],
    });
    
    // Back side: [2*sheet + 1, last - 1 - 2*sheet] (0-indexed)
    const backLeft = sheet * 2 + 1;
    const backRight = paddedPages - 2 - sheet * 2;
    
    sheets.push({
      sheetIndex: sheet,
      side: 'back',
      slots: [
        { 
          sourcePageIndex: backLeft < totalPages ? backLeft : null, 
          x: startX + creepOffset, 
          y: startY, 
          width: slotW - creepOffset, 
          height: slotH, 
          rotation: 0 
        },
        { 
          sourcePageIndex: backRight < totalPages ? backRight : null, 
          x: startX + slotW, 
          y: startY, 
          width: slotW - creepOffset, 
          height: slotH, 
          rotation: 0 
        },
      ],
    });
  }
  
  return { sheets, totalSheets: numSheets, paperSize: paper, duplex: true };
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
  const duplexStr = duplex ? ' (duplex/frente-verso)' : '';
  return `${totalSheets} folha${totalSheets !== 1 ? 's' : ''} @ ${sizeStr}${duplexStr}`;
}

/**
 * Get detailed booklet page order for preview
 * Returns array of sheet descriptions showing which pages go where
 */
export function getBookletPageOrder(totalPages: number): string[] {
  const paddedPages = Math.ceil(totalPages / 4) * 4;
  const numSheets = paddedPages / 4;
  const order: string[] = [];
  
  for (let sheet = 0; sheet < numSheets; sheet++) {
    const frontLeft = paddedPages - sheet * 2;  // 1-indexed
    const frontRight = sheet * 2 + 1;           // 1-indexed
    const backLeft = sheet * 2 + 2;             // 1-indexed
    const backRight = paddedPages - 1 - sheet * 2; // 1-indexed
    
    const fl = frontLeft <= totalPages ? frontLeft.toString() : '—';
    const fr = frontRight <= totalPages ? frontRight.toString() : '—';
    const bl = backLeft <= totalPages ? backLeft.toString() : '—';
    const br = backRight <= totalPages ? backRight.toString() : '—';
    
    order.push(`Folha ${sheet + 1}: Frente [${fl} | ${fr}], Verso [${bl} | ${br}]`);
  }
  
  return order;
}

/**
 * Get folding instructions for the user
 */
export function getFoldingInstructions(layout: ImpositionLayout, totalSheets: number): string[] {
  switch (layout) {
    case 'booklet':
      return [
        '1. Imprima todas as folhas em frente e verso (duplex)',
        '2. Empilhe as folhas na ordem (folha 1 em cima)',
        '3. Dobre todas as folhas juntas ao meio',
        '4. Grampeie na dobra (lombada) com 2 grampos',
        `Total: ${totalSheets} folha${totalSheets > 1 ? 's' : ''} de papel`,
      ];
    case '2-up':
      return [
        '1. Imprima as folhas',
        '2. Corte ao meio verticalmente',
        '3. Empilhe na ordem',
      ];
    case '4-up':
      return [
        '1. Imprima as folhas',
        '2. Corte em 4 partes (2×2)',
        '3. Empilhe na ordem',
      ];
    default:
      return ['Imprima e corte conforme necessário'];
  }
}
