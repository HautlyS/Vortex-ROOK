/**
 * Typography Bridge Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/bridge/environment', () => ({
  isTauri: vi.fn(() => false)
}))

vi.mock('@/bridge/wasm', () => ({
  getWasm: vi.fn(() => ({
    update_layer: vi.fn().mockReturnValue(null),
    get_system_fonts: vi.fn().mockReturnValue(['Arial', 'Helvetica'])
  })),
  initWasm: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/bridge/fontService', () => ({
  initFontService: vi.fn().mockResolvedValue(undefined),
  getAllFonts: vi.fn().mockResolvedValue({
    system: [{ family: 'Arial', name: 'Arial', style: 'normal', weight: 400, source: 'system', isVariable: false }],
    google: [{ family: 'Roboto', variants: ['400', '700'], subsets: ['latin'], category: 'sans-serif' }],
    embedded: []
  }),
  getSystemFonts: vi.fn().mockResolvedValue([
    { family: 'Arial', name: 'Arial', style: 'normal', weight: 400, source: 'system', isVariable: false }
  ]),
  searchGoogleFonts: vi.fn().mockResolvedValue([
    { family: 'Roboto', variants: ['400', '700'], subsets: ['latin'], category: 'sans-serif' }
  ]),
  loadGoogleFont: vi.fn().mockResolvedValue(undefined)
}))

describe('Typography Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize typography bridge', async () => {
      const { initTypographyBridge } = await import('./typographyBridge')
      
      await expect(initTypographyBridge()).resolves.not.toThrow()
    })
  })

  describe('Font Operations', () => {
    it('should get available fonts', async () => {
      const { getAvailableFonts } = await import('./typographyBridge')
      
      const fonts = await getAvailableFonts()
      
      expect(fonts).toHaveProperty('system')
      expect(fonts).toHaveProperty('google')
      expect(Array.isArray(fonts.system)).toBe(true)
    })

    it('should load font by name', async () => {
      const { loadFont } = await import('./typographyBridge')
      
      // Should not throw for common fonts
      await expect(loadFont('Arial')).resolves.not.toThrow()
    })

    it('should validate font support', async () => {
      const { validateFontSupport } = await import('./typographyBridge')
      
      const isSupported = await validateFontSupport('Arial')
      
      expect(typeof isSupported).toBe('boolean')
    })
  })

  describe('Text Formatting', () => {
    it('should apply text formatting to layer', async () => {
      const { applyTextFormatting } = await import('./typographyBridge')
      
      const layer = {
        id: 'layer-1',
        type: 'text' as const,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        visible: true,
        locked: false,
        zIndex: 0,
        opacity: 1,
        content: 'Test',
        sourceType: 'manual' as const,
        role: 'content' as const
      }
      
      const updates = {
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 700
      }
      
      const result = await applyTextFormatting(layer, updates)
      
      expect(result).toBeDefined()
    })
  })

  describe('Font Metrics', () => {
    it('should calculate text metrics', async () => {
      // Mock canvas context
      const mockCtx = {
        font: '',
        measureText: vi.fn().mockReturnValue({ width: 100, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 4 })
      }
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(mockCtx)
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)
      
      const { calculateTextMetrics } = await import('./typographyBridge')
      
      const metrics = await calculateTextMetrics('Hello World', 'Arial', 16)
      
      expect(metrics).toHaveProperty('width')
      expect(metrics).toHaveProperty('height')
    })

    it('should handle empty text', async () => {
      // Mock canvas context
      const mockCtx = {
        font: '',
        measureText: vi.fn().mockReturnValue({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 })
      }
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(mockCtx)
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)
      
      const { calculateTextMetrics } = await import('./typographyBridge')
      
      const metrics = await calculateTextMetrics('', 'Arial', 16)
      
      expect(metrics.width).toBe(0)
    })
  })
})
