/**
 * useTypography Composable Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the bridge modules
vi.mock('@/bridge', () => ({
  updateLayer: vi.fn().mockResolvedValue({ id: 'test-layer' })
}))

vi.mock('@/bridge/typographyBridge', () => ({
  initTypographyBridge: vi.fn().mockResolvedValue(undefined),
  getAvailableFonts: vi.fn().mockResolvedValue({
    system: [{ family: 'Arial' }, { family: 'Times New Roman' }],
    google: [{ family: 'Roboto', variants: ['400', '700'], category: 'sans-serif' }]
  }),
  loadFont: vi.fn().mockResolvedValue(undefined),
  validateFontSupport: vi.fn().mockResolvedValue(true)
}))

import { useTypography } from '@/composables/useTypography'

describe('useTypography', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('State Management', () => {
    it('should have default typography state', () => {
      const { state } = useTypography()
      
      expect(state.value.fontFamily).toBe('Inter')
      expect(state.value.fontSize).toBe(16)
      expect(state.value.fontWeight).toBe(400)
      expect(state.value.fontStyle).toBe('normal')
      expect(state.value.textAlign).toBe('left')
      expect(state.value.lineHeight).toBe(1.5)
      expect(state.value.letterSpacing).toBe(0)
      expect(state.value.color).toBe('#000000')
    })

    it('should have presets available', () => {
      const { presets } = useTypography()
      
      expect(presets.value.length).toBeGreaterThan(0)
      expect(presets.value[0]).toHaveProperty('name')
      expect(presets.value[0]).toHaveProperty('fontSize')
    })
  })

  describe('Font Loading', () => {
    it('should load available fonts', async () => {
      const { loadFonts, fonts, fontsLoading } = useTypography()
      
      expect(fontsLoading.value).toBe(false)
      await loadFonts()
      
      expect(fonts.value.length).toBeGreaterThan(0)
      expect(fontsLoading.value).toBe(false)
    })

    it('should handle font load errors gracefully', async () => {
      const { getAvailableFonts } = await import('@/bridge/typographyBridge')
      vi.mocked(getAvailableFonts).mockRejectedValueOnce(new Error('Network error'))
      
      const { loadFonts, fontsLoading } = useTypography()
      
      await loadFonts()
      expect(fontsLoading.value).toBe(false)
    })
  })

  describe('Computed Properties', () => {
    it('should compute hasTextLayer correctly', () => {
      const { hasTextLayer } = useTypography()
      
      // No layer selected by default
      expect(hasTextLayer.value).toBe(false)
    })

    it('should compute textDecorationString', () => {
      const { textDecorationString, state } = useTypography()
      
      expect(textDecorationString.value).toBe('none')
      
      state.value.textDecoration.add('underline')
      expect(textDecorationString.value).toBe('underline')
    })
  })

  describe('Presets', () => {
    it('should have heading and body presets', () => {
      const { presets } = useTypography()
      
      const heading1 = presets.value.find(p => p.name === 'Heading 1')
      const body = presets.value.find(p => p.name === 'Body')
      
      expect(heading1).toBeDefined()
      expect(heading1?.fontSize).toBe(32)
      expect(body).toBeDefined()
      expect(body?.fontSize).toBe(16)
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('should have handleKeyboard function', () => {
      const { handleKeyboard } = useTypography()
      
      expect(typeof handleKeyboard).toBe('function')
    })

    it('should not throw on keyboard events without text layer', () => {
      const { handleKeyboard } = useTypography()
      
      const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })
      expect(() => handleKeyboard(event)).not.toThrow()
    })
  })

  describe('Format Application', () => {
    it('should have applyFormat function', () => {
      const { applyFormat } = useTypography()
      
      expect(typeof applyFormat).toBe('function')
    })

    it('should have toggleDecoration function', () => {
      const { toggleDecoration } = useTypography()
      
      expect(typeof toggleDecoration).toBe('function')
    })

    it('should have applyPreset function', () => {
      const { applyPreset } = useTypography()
      
      expect(typeof applyPreset).toBe('function')
    })
  })
})
