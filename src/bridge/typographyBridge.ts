// Cross-platform typography bridge
// Ensures all typography features work on both Tauri and Web/WASM

import { isTauri } from './environment'
import { getWasm } from './wasm'
import { 
  getAllFonts, 
  getSystemFonts, 
  searchGoogleFonts, 
  loadGoogleFont,
  initFontService,
  type FontInfo,
  type GoogleFont 
} from './fontService'
import type { LayerObject, LayerUpdates } from './types'

export interface TypographyBridge {
  initTypography(): Promise<void>
  getAvailableFonts(): Promise<{ system: FontInfo[]; google: GoogleFont[] }>
  searchFonts(query: string): Promise<GoogleFont[]>
  loadFont(family: string, weights?: string[]): Promise<void>
  applyTextFormatting(layer: LayerObject, updates: LayerUpdates): Promise<LayerObject | null>
  validateFontSupport(fontFamily: string): Promise<boolean>
}

class TauriTypographyBridge implements TypographyBridge {
  private invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

  async initTypography(): Promise<void> {
    if (!this.invoke) {
      const tauri = await import('@tauri-apps/api/core')
      this.invoke = tauri.invoke
    }
    await initFontService()
  }

  async getAvailableFonts(): Promise<{ system: FontInfo[]; google: GoogleFont[] }> {
    const allFonts = await getAllFonts()
    return { system: allFonts.system, google: allFonts.google }
  }

  async searchFonts(query: string): Promise<GoogleFont[]> {
    return searchGoogleFonts(query)
  }

  async loadFont(family: string, weights: string[] = ['400']): Promise<void> {
    await loadGoogleFont(family, weights)
  }

  async applyTextFormatting(layer: LayerObject, updates: LayerUpdates): Promise<LayerObject | null> {
    if (!this.invoke) throw new Error('Tauri not initialized')
    
    return this.invoke('update_layer', {
      pageIndex: 0, // Will be provided by caller
      layerId: layer.id,
      updates
    }) as Promise<LayerObject>
  }

  async validateFontSupport(fontFamily: string): Promise<boolean> {
    if (!this.invoke) return false
    
    try {
      const fonts = await getSystemFonts()
      return fonts.some(f => f.family === fontFamily)
    } catch {
      return false
    }
  }
}

class WasmTypographyBridge implements TypographyBridge {
  async initTypography(): Promise<void> {
    await initFontService()
  }

  async getAvailableFonts(): Promise<{ system: FontInfo[]; google: GoogleFont[] }> {
    const allFonts = await getAllFonts()
    return { system: allFonts.system, google: allFonts.google }
  }

  async searchFonts(query: string): Promise<GoogleFont[]> {
    return searchGoogleFonts(query)
  }

  async loadFont(family: string, weights: string[] = ['400']): Promise<void> {
    await loadGoogleFont(family, weights)
  }

  async applyTextFormatting(layer: LayerObject, updates: LayerUpdates): Promise<LayerObject | null> {
    const wasm = getWasm()
    return wasm.update_layer(layer, updates)
  }

  async validateFontSupport(fontFamily: string): Promise<boolean> {
    try {
      const wasm = getWasm()
      const systemFonts = wasm.get_system_fonts()
      return systemFonts.includes(fontFamily)
    } catch {
      // Fallback to web-safe fonts check
      const webSafeFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New']
      return webSafeFonts.includes(fontFamily)
    }
  }
}

// Singleton bridge instance
let typographyBridge: TypographyBridge | null = null

/**
 * Get the typography bridge instance
 */
export function getTypographyBridge(): TypographyBridge {
  if (!typographyBridge) {
    typographyBridge = isTauri() ? new TauriTypographyBridge() : new WasmTypographyBridge()
  }
  return typographyBridge
}

/**
 * Initialize typography system
 */
export async function initTypographyBridge(): Promise<void> {
  const bridge = getTypographyBridge()
  await bridge.initTypography()
}

/**
 * Get all available fonts (cross-platform)
 */
export async function getAvailableFonts(): Promise<{ system: FontInfo[]; google: GoogleFont[] }> {
  const bridge = getTypographyBridge()
  return bridge.getAvailableFonts()
}

/**
 * Search fonts (cross-platform)
 */
export async function searchFonts(query: string): Promise<GoogleFont[]> {
  const bridge = getTypographyBridge()
  return bridge.searchFonts(query)
}

/**
 * Load font (cross-platform)
 */
export async function loadFont(family: string, weights?: string[]): Promise<void> {
  const bridge = getTypographyBridge()
  await bridge.loadFont(family, weights)
}

/**
 * Apply text formatting (cross-platform)
 */
export async function applyTextFormatting(
  layer: LayerObject, 
  updates: LayerUpdates
): Promise<LayerObject | null> {
  const bridge = getTypographyBridge()
  return bridge.applyTextFormatting(layer, updates)
}

/**
 * Validate font support (cross-platform)
 */
export async function validateFontSupport(fontFamily: string): Promise<boolean> {
  const bridge = getTypographyBridge()
  return bridge.validateFontSupport(fontFamily)
}

/**
 * Preload common fonts for better performance
 */
export async function preloadCommonFonts(): Promise<void> {
  const commonFonts = [
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 
    'Poppins', 'Nunito', 'Source Sans Pro'
  ]
  
  const bridge = getTypographyBridge()
  
  // Load fonts in parallel but limit concurrency
  const batchSize = 3
  for (let i = 0; i < commonFonts.length; i += batchSize) {
    const batch = commonFonts.slice(i, i + batchSize)
    await Promise.allSettled(
      batch.map(font => bridge.loadFont(font, ['400', '700']))
    )
  }
}

/**
 * Get font fallback chain
 */
export function getFontFallbackChain(fontFamily: string): string {
  const fallbacks = {
    'serif': 'Georgia, "Times New Roman", serif',
    'sans-serif': 'Arial, Helvetica, sans-serif',
    'monospace': '"Courier New", Courier, monospace',
    'cursive': '"Comic Sans MS", cursive',
    'fantasy': 'Impact, fantasy'
  }
  
  // Determine category
  const lower = fontFamily.toLowerCase()
  let category = 'sans-serif'
  
  if (lower.includes('serif') && !lower.includes('sans')) {
    category = 'serif'
  } else if (lower.includes('mono') || lower.includes('code') || lower.includes('courier')) {
    category = 'monospace'
  } else if (lower.includes('script') || lower.includes('handwriting')) {
    category = 'cursive'
  } else if (lower.includes('display') || lower.includes('impact')) {
    category = 'fantasy'
  }
  
  return `"${fontFamily}", ${fallbacks[category as keyof typeof fallbacks]}`
}

/**
 * Text metrics result
 */
export interface TextMetrics {
  width: number
  height: number
  ascent: number
  descent: number
  lineHeight: number
}

/**
 * Calculate text metrics for given text and font settings
 */
export function calculateTextMetrics(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number = 400
): TextMetrics {
  // Create offscreen canvas for measurement
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  const metrics = ctx.measureText(text)
  
  // Calculate dimensions
  const width = metrics.width
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2
  const height = ascent + descent
  const lineHeight = fontSize * 1.2
  
  return {
    width,
    height,
    ascent,
    descent,
    lineHeight
  }
}
