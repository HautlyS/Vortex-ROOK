// Font Service Bridge
// Routes font operations between Tauri and Web/WASM with Google Fonts CDN fallback

import { isTauri } from './environment';

// Types
export interface FontInfo {
  name: string;
  family: string;
  style: string;
  weight: number;
  path?: string;
  source: 'system' | 'embedded' | 'google' | 'custom';
  isVariable: boolean;
}

export interface GoogleFont {
  family: string;
  variants: string[];
  subsets: string[];
  category: string;
}

export interface FontMatch {
  matchedFont: string;
  source: 'system' | 'embedded' | 'google' | 'custom';
  confidence: number;
  cssFamily: string;
  googleUrl?: string;
}

export interface AllFonts {
  system: FontInfo[];
  embedded: string[];
  google: GoogleFont[];
}

// Tauri invoke
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
let invoke: InvokeFn | null = null;

// Cache
let fontCache: AllFonts | null = null;
let loadedGoogleFonts = new Set<string>();

// Popular Google Fonts for web fallback
const POPULAR_GOOGLE_FONTS: GoogleFont[] = [
  { family: 'Roboto', variants: ['100', '300', '400', '500', '700', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Open Sans', variants: ['300', '400', '600', '700', '800'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Lato', variants: ['100', '300', '400', '700', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Montserrat', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Poppins', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Inter', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Oswald', variants: ['200', '300', '400', '500', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Raleway', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Nunito', variants: ['200', '300', '400', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Ubuntu', variants: ['300', '400', '500', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Playfair Display', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'serif' },
  { family: 'Merriweather', variants: ['300', '400', '700', '900'], subsets: ['latin'], category: 'serif' },
  { family: 'Lora', variants: ['400', '500', '600', '700'], subsets: ['latin'], category: 'serif' },
  { family: 'PT Serif', variants: ['400', '700'], subsets: ['latin'], category: 'serif' },
  { family: 'Noto Serif', variants: ['400', '700'], subsets: ['latin'], category: 'serif' },
  { family: 'Source Code Pro', variants: ['200', '300', '400', '500', '600', '700', '900'], subsets: ['latin'], category: 'monospace' },
  { family: 'Fira Code', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], category: 'monospace' },
  { family: 'JetBrains Mono', variants: ['100', '200', '300', '400', '500', '600', '700', '800'], subsets: ['latin'], category: 'monospace' },
  { family: 'IBM Plex Mono', variants: ['100', '200', '300', '400', '500', '600', '700'], subsets: ['latin'], category: 'monospace' },
  { family: 'Roboto Mono', variants: ['100', '200', '300', '400', '500', '600', '700'], subsets: ['latin'], category: 'monospace' },
  { family: 'Dancing Script', variants: ['400', '500', '600', '700'], subsets: ['latin'], category: 'handwriting' },
  { family: 'Pacifico', variants: ['400'], subsets: ['latin'], category: 'handwriting' },
  { family: 'Caveat', variants: ['400', '500', '600', '700'], subsets: ['latin'], category: 'handwriting' },
  { family: 'Bebas Neue', variants: ['400'], subsets: ['latin'], category: 'display' },
  { family: 'Abril Fatface', variants: ['400'], subsets: ['latin'], category: 'display' },
  { family: 'Quicksand', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Work Sans', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Rubik', variants: ['300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Noto Sans', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Barlow', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'], category: 'sans-serif' },
];

// Web fallback fonts
const WEB_SAFE_FONTS: FontInfo[] = [
  { name: 'Arial', family: 'Arial', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Helvetica', family: 'Helvetica', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Times New Roman', family: 'Times New Roman', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Georgia', family: 'Georgia', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Verdana', family: 'Verdana', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Courier New', family: 'Courier New', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Trebuchet MS', family: 'Trebuchet MS', style: 'normal', weight: 400, source: 'system', isVariable: false },
  { name: 'Impact', family: 'Impact', style: 'normal', weight: 400, source: 'system', isVariable: false },
];

/**
 * Initialize font service
 */
export async function initFontService(): Promise<void> {
  if (isTauri()) {
    const tauri = await import('@tauri-apps/api/core');
    invoke = tauri.invoke;
  }
}

/**
 * Get all available fonts
 */
export async function getAllFonts(): Promise<AllFonts> {
  if (fontCache) return fontCache;

  if (isTauri() && invoke) {
    fontCache = await invoke('get_all_fonts') as AllFonts;
    return fontCache;
  }

  // Web fallback: web-safe fonts + Google Fonts
  fontCache = {
    system: WEB_SAFE_FONTS,
    embedded: [],
    google: POPULAR_GOOGLE_FONTS,
  };
  return fontCache;
}

/**
 * Get system fonts only
 */
export async function getSystemFonts(): Promise<FontInfo[]> {
  if (isTauri() && invoke) {
    return invoke('get_system_fonts') as Promise<FontInfo[]>;
  }
  return WEB_SAFE_FONTS;
}

/**
 * Search Google Fonts
 */
export async function searchGoogleFonts(query: string): Promise<GoogleFont[]> {
  if (isTauri() && invoke) {
    return invoke('search_google_fonts', { query }) as Promise<GoogleFont[]>;
  }

  // Web fallback: filter local list
  const lower = query.toLowerCase();
  return POPULAR_GOOGLE_FONTS.filter(f => 
    f.family.toLowerCase().includes(lower)
  ).slice(0, 50);
}

/**
 * Get Google Font CSS URL
 */
export function getGoogleFontUrl(family: string, weights: string[] = ['400']): string {
  const weightsStr = weights.join(';');
  const familyEncoded = family.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${familyEncoded}:wght@${weightsStr}&display=swap`;
}

/**
 * Load a Google Font dynamically
 */
export async function loadGoogleFont(family: string, weights: string[] = ['400']): Promise<void> {
  const key = `${family}-${weights.join(',')}`;
  if (loadedGoogleFonts.has(key)) return;

  const url = getGoogleFontUrl(family, weights);
  
  // Check if already loaded
  const existing = document.querySelector(`link[href="${url}"]`);
  if (existing) {
    loadedGoogleFonts.add(key);
    return;
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => {
      loadedGoogleFonts.add(key);
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load font: ${family}`));
    document.head.appendChild(link);
  });
}

/**
 * Find matching font for PDF reconstruction
 */
export async function findMatchingFont(
  fontName: string,
  isBold: boolean = false,
  isItalic: boolean = false
): Promise<FontMatch> {
  if (isTauri() && invoke) {
    const match = await invoke('find_matching_font', { fontName, isBold, isItalic }) as FontMatch;
    
    // Load Google Font if needed
    if (match.source === 'google' && match.googleUrl) {
      await loadGoogleFont(match.matchedFont);
    }
    
    return match;
  }

  // Web fallback: try to match with Google Fonts
  const cleanName = cleanFontName(fontName);
  
  // Search Google Fonts
  const results = await searchGoogleFonts(cleanName);
  if (results.length > 0) {
    const font = results[0];
    const weight = isBold ? '700' : '400';
    await loadGoogleFont(font.family, [weight]);
    
    return {
      matchedFont: font.family,
      source: 'google',
      confidence: 0.8,
      cssFamily: `'${font.family}'`,
      googleUrl: getGoogleFontUrl(font.family, [weight]),
    };
  }

  // Fallback to web-safe
  return {
    matchedFont: getFallbackFont(cleanName),
    source: 'system',
    confidence: 0.3,
    cssFamily: getFallbackCss(cleanName),
  };
}

/**
 * Get CSS font-family string for a font
 */
export function getCssFontFamily(fontFamily: string, source: FontMatch['source']): string {
  if (source === 'google' || source === 'custom') {
    return `'${fontFamily}', sans-serif`;
  }
  return fontFamily;
}

/**
 * Preload fonts for a document
 */
export async function preloadDocumentFonts(fontFamilies: string[]): Promise<void> {
  const unique = [...new Set(fontFamilies)];
  
  for (const family of unique) {
    const match = await findMatchingFont(family);
    if (match.source === 'google' && match.googleUrl) {
      await loadGoogleFont(match.matchedFont);
    }
  }
}

/**
 * Clear font cache (call when fonts change)
 */
export function clearFontCache(): void {
  fontCache = null;
}

/**
 * Fetch full Google Fonts list from API
 */
export async function fetchGoogleFontsApi(): Promise<GoogleFont[]> {
  if (isTauri() && invoke) {
    const fonts = await invoke('fetch_google_fonts_api') as GoogleFont[];
    if (fontCache) fontCache.google = fonts;
    return fonts;
  }
  
  // Web fallback: fetch directly
  try {
    const res = await fetch('https://fonts.google.com/metadata/fonts');
    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'\n/, ''));
    
    const fonts: GoogleFont[] = json.familyMetadataList.map((m: any) => ({
      family: m.family,
      variants: Object.keys(m.fonts || {}),
      subsets: m.subsets || [],
      category: m.category || 'sans-serif',
    }));
    
    if (fontCache) fontCache.google = fonts;
    return fonts;
  } catch (e) {
    console.error('Failed to fetch Google Fonts:', e);
    return POPULAR_GOOGLE_FONTS;
  }
}

/**
 * Install custom font file
 */
export async function installCustomFont(filePath: string): Promise<string> {
  if (isTauri() && invoke) {
    const family = await invoke('install_custom_font', { fontPath: filePath }) as string;
    clearFontCache();
    return family;
  }
  throw new Error('Custom font installation requires desktop app');
}

/**
 * Listen for font changes (Tauri only)
 */
export async function onFontsChanged(callback: () => void): Promise<() => void> {
  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen('fonts_changed', () => {
      clearFontCache();
      callback();
    });
    return unlisten;
  }
  return () => {};
}

// Helper functions
function cleanFontName(name: string): string {
  let clean = name.toLowerCase();
  
  // Remove subset prefix
  const plusIndex = clean.indexOf('+');
  if (plusIndex !== -1) {
    clean = clean.substring(plusIndex + 1);
  }
  
  // Remove style suffixes
  return clean
    .replace(/-bold/g, '')
    .replace(/-italic/g, '')
    .replace(/-regular/g, '')
    .replace(/bold/g, '')
    .replace(/italic/g, '')
    .replace(/regular/g, '')
    .trim();
}

function getFallbackFont(name: string): string {
  const lower = name.toLowerCase();
  
  if (lower.includes('serif') && !lower.includes('sans')) {
    return 'Georgia';
  } else if (lower.includes('mono') || lower.includes('courier') || lower.includes('code')) {
    return 'Courier New';
  }
  return 'Arial';
}

function getFallbackCss(name: string): string {
  const lower = name.toLowerCase();
  
  if (lower.includes('serif') && !lower.includes('sans')) {
    return "Georgia, 'Times New Roman', serif";
  } else if (lower.includes('mono') || lower.includes('courier') || lower.includes('code')) {
    return "'Courier New', Courier, monospace";
  }
  return 'Arial, Helvetica, sans-serif';
}

/**
 * Load a font by family name (loads from Google Fonts if not system)
 */
export async function loadFont(family: string, weight: number = 400): Promise<boolean> {
  // Check if it's a system font
  const systemFonts = await getSystemFonts();
  if (systemFonts.some(f => f.family.toLowerCase() === family.toLowerCase())) {
    return true;
  }
  
  // Try to load from Google Fonts
  try {
    await loadGoogleFont(family, [String(weight)]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a font is available (system or loaded)
 */
export async function isFontAvailable(family: string): Promise<boolean> {
  // Check system fonts
  const systemFonts = await getSystemFonts();
  if (systemFonts.some(f => f.family.toLowerCase() === family.toLowerCase())) {
    return true;
  }
  
  // Check loaded Google fonts
  const key = `${family}-400`;
  if (loadedGoogleFonts.has(key)) {
    return true;
  }
  
  // Check Google Fonts list
  const googleFonts = await searchGoogleFonts(family);
  return googleFonts.some(f => f.family.toLowerCase() === family.toLowerCase());
}

/**
 * Normalize font family name (clean up and standardize)
 */
export function normalizeFontFamily(family: string): string {
  // Remove quotes
  let normalized = family.replace(/["']/g, '');
  
  // Trim whitespace
  normalized = normalized.trim();
  
  // Handle common variations
  const variations: Record<string, string> = {
    'arial': 'Arial',
    'helvetica': 'Helvetica',
    'times': 'Times New Roman',
    'times new roman': 'Times New Roman',
    'georgia': 'Georgia',
    'verdana': 'Verdana',
    'courier': 'Courier New',
    'courier new': 'Courier New',
  };
  
  const lower = normalized.toLowerCase();
  if (variations[lower]) {
    return variations[lower];
  }
  
  // Capitalize first letter of each word
  return normalized.replace(/\b\w/g, c => c.toUpperCase());
}
