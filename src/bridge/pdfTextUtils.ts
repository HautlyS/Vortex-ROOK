// PDF Text Extraction Utilities
// Modular functions for accurate text reconstruction from PDF

import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * Text item with computed metrics for spacing analysis
 */
export interface EnhancedTextItem extends TextItem {
  x: number;
  y: number;
  endX: number;
  fontSize: number;
  spaceWidth: number;
  charWidth: number;
}

/**
 * Enhance text items with computed positioning metrics
 * Preserves ALL items including empty strings (they may have positioning info)
 */
export function enhanceTextItems(items: TextItem[]): EnhancedTextItem[] {
  return items
    .filter(item => item.str !== undefined && item.str.length > 0)
    .map(item => {
      const [scaleX, , , scaleY, tx, ty] = item.transform;
      const fontSize = Math.abs(scaleY) || Math.abs(scaleX) || 12;
      const strLen = item.str.length;
      
      // Estimate character width - use item.width if available, otherwise estimate
      // Average character width is ~0.5-0.6 of font size for most fonts
      const estimatedWidth = strLen * fontSize * 0.55;
      const itemWidth = (item.width && item.width > 0) ? item.width : estimatedWidth;
      const charWidth = itemWidth / strLen;
      
      // endX = start + width (add 10% buffer for safety)
      const endX = tx + itemWidth * 1.1;
      
      return {
        ...item,
        x: tx,
        y: ty,
        endX,
        fontSize,
        spaceWidth: fontSize * 0.25,
        charWidth,
      };
    });
}

/**
 * Determine if a space should be inserted between two text items
 */
export function shouldInsertSpace(prev: EnhancedTextItem, curr: EnhancedTextItem): boolean {
  // If previous item ends with space or current starts with space, no need
  if (prev.str.endsWith(' ') || curr.str.startsWith(' ')) {
    return false;
  }
  
  // Calculate gap between items
  const gap = curr.x - prev.endX;
  
  // Use the average space width of both items
  const avgSpaceWidth = (prev.spaceWidth + curr.spaceWidth) / 2;
  
  // Threshold: if gap is more than 30% of space width, insert space
  // This accounts for kerning (negative gaps) and tight spacing
  const threshold = avgSpaceWidth * 0.3;
  
  // Also check for large gaps that indicate intentional spacing
  // (like in tables of contents with dots)
  if (gap > avgSpaceWidth * 3) {
    return true;
  }
  
  return gap > threshold;
}

/**
 * Build text string from items with proper spacing
 */
export function buildTextFromItems(items: EnhancedTextItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].str;
  
  // Sort by X position
  const sorted = [...items].sort((a, b) => a.x - b.x);
  
  let result = sorted[0].str;
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    if (shouldInsertSpace(prev, curr)) {
      result += ' ';
    }
    
    result += curr.str;
  }
  
  return result;
}

/**
 * Group text items into lines based on Y position
 */
export function groupIntoLines(
  items: EnhancedTextItem[],
  yTolerance: number = 3
): EnhancedTextItem[][] {
  if (items.length === 0) return [];
  
  // Sort by Y (descending - PDF coordinates have Y increasing upward)
  const sorted = [...items].sort((a, b) => b.y - a.y);
  
  const lines: EnhancedTextItem[][] = [];
  let currentLine: EnhancedTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    
    // Check if item is on the same line (within tolerance)
    // Also consider font size - larger fonts need more tolerance
    const effectiveTolerance = Math.max(yTolerance, item.fontSize * 0.3);
    
    if (Math.abs(item.y - currentY) <= effectiveTolerance) {
      currentLine.push(item);
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Split a line into columns based on large horizontal gaps
 */
export function splitLineIntoColumns(
  items: EnhancedTextItem[],
  columnGapMultiplier: number = 4
): EnhancedTextItem[][] {
  if (items.length <= 1) return [items];
  
  // Sort by X position
  const sorted = [...items].sort((a, b) => a.x - b.x);
  
  const columns: EnhancedTextItem[][] = [];
  let currentColumn: EnhancedTextItem[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    const gap = curr.x - prev.endX;
    const avgSpaceWidth = (prev.spaceWidth + curr.spaceWidth) / 2;
    
    // If gap is much larger than a normal space, it's a new column
    if (gap > avgSpaceWidth * columnGapMultiplier) {
      columns.push(currentColumn);
      currentColumn = [curr];
    } else {
      currentColumn.push(curr);
    }
  }
  
  if (currentColumn.length > 0) {
    columns.push(currentColumn);
  }
  
  return columns;
}

/**
 * Calculate the bounding box for a group of text items
 */
export function calculateBounds(items: EnhancedTextItem[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (items.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxFontSize = 0;
  
  for (const item of items) {
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.endX);
    minY = Math.min(minY, item.y);
    maxY = Math.max(maxY, item.y);
    maxFontSize = Math.max(maxFontSize, item.fontSize);
  }
  
  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxFontSize * 1.2, 1),
  };
}

/**
 * Detect if text items form a table of contents pattern
 * (text ... dots ... page number)
 */
export function isTocLine(items: EnhancedTextItem[]): boolean {
  const text = buildTextFromItems(items);
  // Check for patterns like "Chapter 1 .......... 5" or "Introduction ... 10"
  return /[.…]{3,}/.test(text) && /\d+\s*$/.test(text);
}

/**
 * Get the dominant font size in a group of items
 */
export function getDominantFontSize(items: EnhancedTextItem[]): number {
  if (items.length === 0) return 12;
  
  const sizes = new Map<number, number>();
  for (const item of items) {
    const rounded = Math.round(item.fontSize);
    sizes.set(rounded, (sizes.get(rounded) || 0) + item.str.length);
  }
  
  let maxCount = 0;
  let dominantSize = 12;
  for (const [size, count] of sizes) {
    if (count > maxCount) {
      maxCount = count;
      dominantSize = size;
    }
  }
  
  return dominantSize;
}
