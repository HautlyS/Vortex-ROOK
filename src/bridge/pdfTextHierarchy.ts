// PDF Text Hierarchy - Paragraph → Line → Word → Character structure
// Provides structured text extraction with proper paragraph detection

import type { EnhancedTextItem } from './pdfTextUtils';
import { shouldInsertSpace } from './pdfTextUtils';

/**
 * Character-level element
 */
export interface TextCharacter {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

/**
 * Word-level element
 */
export interface TextWord {
  text: string;
  characters: TextCharacter[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

/**
 * Line-level element
 */
export interface TextLine {
  text: string;
  words: TextWord[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  items: EnhancedTextItem[]; // Original items for this line
}

/**
 * Paragraph-level element
 */
export interface TextParagraph {
  text: string;
  lines: TextLine[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

/**
 * Build hierarchical text structure from enhanced items
 */
export function buildTextHierarchy(
  lineGroups: EnhancedTextItem[][],
  pageHeight: number
): TextParagraph[] {
  const lines = lineGroups.map(items => buildLine(items, pageHeight));
  const paragraphs = groupLinesIntoParagraphs(lines);
  return paragraphs;
}

/**
 * Build a TextLine from enhanced items
 */
function buildLine(items: EnhancedTextItem[], pageHeight: number): TextLine {
  if (items.length === 0) {
    return {
      text: '',
      words: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fontSize: 12,
      items: [],
    };
  }

  // Sort items by X position
  const sorted = [...items].sort((a, b) => a.x - b.x);
  
  // Build words from items
  const words = buildWords(sorted, pageHeight);
  const text = words.map(w => w.text).join(' ');
  
  // Calculate line bounds from ALL items (not just words)
  const minX = Math.min(...sorted.map(i => i.x));
  const maxX = Math.max(...sorted.map(i => i.endX));
  const avgY = sorted.reduce((sum, i) => sum + i.y, 0) / sorted.length;
  const maxFontSize = Math.max(...sorted.map(i => i.fontSize));
  
  // Use ascent (80% of font size) for proper baseline-to-top conversion
  const ascent = maxFontSize * 0.8;
  
  return {
    text,
    words,
    x: minX,
    y: pageHeight - avgY - ascent,
    width: maxX - minX,
    height: maxFontSize * 1.2,
    fontSize: maxFontSize,
    items: sorted,
  };
}

/**
 * Build words from text items, preserving all characters
 */
function buildWords(items: EnhancedTextItem[], pageHeight: number): TextWord[] {
  const words: TextWord[] = [];
  let currentWordItems: EnhancedTextItem[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (i === 0) {
      currentWordItems.push(item);
      continue;
    }
    
    const prev = items[i - 1];
    const needsSpace = shouldInsertSpace(prev, item);
    
    if (needsSpace && currentWordItems.length > 0) {
      // End current word
      words.push(createWord(currentWordItems, pageHeight));
      currentWordItems = [item];
    } else {
      currentWordItems.push(item);
    }
  }
  
  // Don't forget the last word!
  if (currentWordItems.length > 0) {
    words.push(createWord(currentWordItems, pageHeight));
  }
  
  return words;
}

/**
 * Create a word from items
 */
function createWord(items: EnhancedTextItem[], pageHeight: number): TextWord {
  const text = items.map(i => i.str).join('');
  const characters = buildCharacters(items, pageHeight);
  
  const minX = Math.min(...items.map(i => i.x));
  const maxX = Math.max(...items.map(i => i.endX));
  const avgY = items.reduce((sum, i) => sum + i.y, 0) / items.length;
  const maxFontSize = Math.max(...items.map(i => i.fontSize));
  
  // Use ascent (80% of font size) for proper baseline-to-top conversion
  const ascent = maxFontSize * 0.8;
  
  return {
    text,
    characters,
    x: minX,
    y: pageHeight - avgY - ascent,
    width: maxX - minX,
    height: maxFontSize * 1.2,
    fontSize: maxFontSize,
  };
}

/**
 * Build character array from items
 */
function buildCharacters(items: EnhancedTextItem[], pageHeight: number): TextCharacter[] {
  const chars: TextCharacter[] = [];
  
  for (const item of items) {
    const str = item.str;
    const charWidth = item.width / Math.max(str.length, 1);
    // Use ascent (80% of font size) for proper baseline-to-top conversion
    const ascent = item.fontSize * 0.8;
    
    for (let i = 0; i < str.length; i++) {
      chars.push({
        char: str[i],
        x: item.x + i * charWidth,
        y: pageHeight - item.y - ascent,
        width: charWidth,
        height: item.fontSize * 1.2,
        fontSize: item.fontSize,
      });
    }
  }
  
  return chars;
}

/**
 * Group lines into paragraphs based on vertical spacing and indentation
 */
function groupLinesIntoParagraphs(lines: TextLine[]): TextParagraph[] {
  if (lines.length === 0) return [];
  
  // Sort lines by Y position (top to bottom)
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  
  const paragraphs: TextParagraph[] = [];
  let currentParagraphLines: TextLine[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prevLine = sorted[i - 1];
    const currLine = sorted[i];
    
    // Check if this is a new paragraph
    if (isNewParagraph(prevLine, currLine)) {
      paragraphs.push(createParagraph(currentParagraphLines));
      currentParagraphLines = [currLine];
    } else {
      currentParagraphLines.push(currLine);
    }
  }
  
  // Don't forget the last paragraph!
  if (currentParagraphLines.length > 0) {
    paragraphs.push(createParagraph(currentParagraphLines));
  }
  
  return paragraphs;
}

/**
 * Determine if a line starts a new paragraph
 */
function isNewParagraph(prevLine: TextLine, currLine: TextLine): boolean {
  // Calculate vertical gap between lines
  const prevBottom = prevLine.y + prevLine.height;
  const gap = currLine.y - prevBottom;
  const avgLineHeight = (prevLine.height + currLine.height) / 2;
  
  // New paragraph if:
  // 1. Large vertical gap (> 1.5x line height)
  if (gap > avgLineHeight * 1.5) {
    return true;
  }
  
  // 2. Significant indentation change (new paragraph often indented)
  const indentDiff = currLine.x - prevLine.x;
  if (indentDiff > avgLineHeight * 2) {
    return true;
  }
  
  // 3. Previous line is much shorter (likely end of paragraph)
  // Only if current line starts near left margin
  if (prevLine.width < currLine.width * 0.6 && currLine.x < prevLine.x + 10) {
    return true;
  }
  
  return false;
}

/**
 * Create a paragraph from lines
 */
function createParagraph(lines: TextLine[]): TextParagraph {
  const text = lines.map(l => l.text).join(' ');
  
  const minX = Math.min(...lines.map(l => l.x));
  const maxX = Math.max(...lines.map(l => l.x + l.width));
  const minY = Math.min(...lines.map(l => l.y));
  const maxY = Math.max(...lines.map(l => l.y + l.height));
  const avgFontSize = lines.reduce((sum, l) => sum + l.fontSize, 0) / lines.length;
  
  return {
    text,
    lines,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    fontSize: avgFontSize,
  };
}

/**
 * Flatten paragraphs back to simple text content for layer creation
 */
export function flattenParagraphsToText(paragraphs: TextParagraph[]): string {
  return paragraphs.map(p => p.text).join('\n\n');
}
