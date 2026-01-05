/**
 * Font Service Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock document.fonts
const mockFontFace = vi.fn()
const mockFonts = {
  add: vi.fn(),
  check: vi.fn().mockReturnValue(true),
  load: vi.fn().mockResolvedValue([]),
  ready: Promise.resolve()
}

vi.stubGlobal('FontFace', mockFontFace)
vi.stubGlobal('document', { fonts: mockFonts })

describe('Font Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Font Loading', () => {
    it('should load font from URL', async () => {
      mockFontFace.mockImplementation((family, source) => ({
        family,
        load: vi.fn().mockResolvedValue({ family })
      }))
      
      const { loadFont } = await import('./fontService')
      await loadFont('CustomFont', 'https://example.com/font.woff2')
      
      expect(mockFontFace).toHaveBeenCalledWith('CustomFont', expect.any(String))
    })

    it('should handle font load failure', async () => {
      mockFontFace.mockImplementation(() => ({
        load: vi.fn().mockRejectedValue(new Error('Font load failed'))
      }))
      
      const { loadFont } = await import('./fontService')
      
      // loadFont returns false on failure, doesn't throw
      const result = await loadFont('BadFont', 400)
      expect(result).toBe(false)
    })
  })

  describe('Font Matching', () => {
    it('should find matching font for PDF font name', async () => {
      const { findMatchingFont } = await import('./fontService')
      
      const match = await findMatchingFont('Helvetica', false, false)
      
      expect(match.cssFamily).toBeDefined()
    })

    it('should handle bold font matching', async () => {
      const { findMatchingFont } = await import('./fontService')
      
      const match = await findMatchingFont('Arial-Bold', true, false)
      
      expect(match.cssFamily).toBeDefined()
    })

    it('should handle italic font matching', async () => {
      const { findMatchingFont } = await import('./fontService')
      
      const match = await findMatchingFont('Times-Italic', false, true)
      
      expect(match.cssFamily).toBeDefined()
    })

    it('should return fallback for unknown fonts', async () => {
      const { findMatchingFont } = await import('./fontService')
      
      const match = await findMatchingFont('UnknownFont123', false, false)
      
      expect(match.cssFamily).toBeDefined()
    })
  })

  describe('Font Availability', () => {
    it('should check if font is available', async () => {
      mockFonts.check.mockReturnValue(true)
      
      const { isFontAvailable } = await import('./fontService')
      const available = await isFontAvailable('Arial')
      
      expect(available).toBe(true)
    })

    it('should return false for unavailable font', async () => {
      mockFonts.check.mockReturnValue(false)
      
      const { isFontAvailable } = await import('./fontService')
      const available = await isFontAvailable('NonExistentFont')
      
      expect(available).toBe(false)
    })
  })

  describe('System Fonts', () => {
    it('should return list of system fonts', async () => {
      const { getSystemFonts } = await import('./fontService')
      const fonts = await getSystemFonts()
      
      expect(Array.isArray(fonts)).toBe(true)
      expect(fonts.length).toBeGreaterThan(0)
    })

    it('should include common fonts', async () => {
      const { getSystemFonts } = await import('./fontService')
      const fonts = await getSystemFonts()
      
      const fontNames = fonts.map(f => f.family.toLowerCase())
      expect(fontNames.some(f => f.includes('arial') || f.includes('sans'))).toBe(true)
    })
  })

  describe('Font Normalization', () => {
    it('should normalize PDF font names', async () => {
      const { normalizeFontFamily } = await import('./fontService')
      
      expect(normalizeFontFamily('ABCDEF+Arial')).toBe('Arial')
      expect(normalizeFontFamily('TimesNewRomanPSMT')).toContain('Times')
    })

    it('should handle font subsets', async () => {
      const { normalizeFontFamily } = await import('./fontService')
      
      // PDF fonts often have subset prefixes like ABCDEF+
      expect(normalizeFontFamily('XYZABC+Helvetica-Bold')).toContain('Helvetica')
    })
  })
})
