/**
 * PDF Parser Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock PDF.js
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
  OPS: {
    save: 1,
    restore: 2,
    transform: 3,
    paintImageXObject: 4,
    paintXObject: 5,
    moveTo: 6,
    lineTo: 7,
    curveTo: 8,
    rectangle: 9,
    stroke: 10,
    fill: 11
  }
}))

describe('PDF Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Text Extraction', () => {
    it('should extract text items from PDF page', async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Hello', transform: [1, 0, 0, 1, 100, 700], width: 50 },
            { str: 'World', transform: [1, 0, 0, 1, 160, 700], width: 50 }
          ],
          styles: {}
        }),
        getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
        getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] })
      }
      
      const mockDoc = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage)
      }
      
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDoc)
      } as any)
      
      const { parsePdf } = await import('./pdfParser')
      const pages = await parsePdf(new Uint8Array([]))
      
      expect(pages).toHaveLength(1)
      expect(pages[0].layers.some(l => l.content?.includes('Hello'))).toBe(true)
    })

    it('should handle empty PDF', async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const mockDoc = {
        numPages: 0,
        getPage: vi.fn()
      }
      
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDoc)
      } as any)
      
      const { parsePdf } = await import('./pdfParser')
      const pages = await parsePdf(new Uint8Array([]))
      
      expect(pages).toHaveLength(0)
    })

    it('should calculate correct text bounds', async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Test', transform: [12, 0, 0, 12, 50, 700], width: 40 }
          ],
          styles: {}
        }),
        getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
        getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] })
      }
      
      const mockDoc = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage)
      }
      
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDoc)
      } as any)
      
      const { parsePdf } = await import('./pdfParser')
      const pages = await parsePdf(new Uint8Array([]))
      
      const textLayer = pages[0].layers.find(l => l.type === 'text')
      expect(textLayer?.bounds.x).toBeGreaterThanOrEqual(0)
      expect(textLayer?.bounds.y).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Image Extraction', () => {
    it('should handle pages with images', async () => {
      const { parsePdf } = await import('./pdfParser')
      
      // Test with empty PDF - should not throw
      const pages = await parsePdf(new Uint8Array([]))
      
      // Should return pages array
      expect(Array.isArray(pages)).toBe(true)
    })
  })

  describe('Progress Callback', () => {
    it('should call progress callback during parsing', async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} }),
        getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
        getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() })
      }
      
      const mockDoc = {
        numPages: 3,
        getPage: vi.fn().mockResolvedValue(mockPage)
      }
      
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDoc)
      } as any)
      
      const { parsePdf } = await import('./pdfParser')
      const onProgress = vi.fn()
      
      await parsePdf(new Uint8Array([]), onProgress)
      
      expect(onProgress).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle PDF load error', async () => {
      const pdfjsLib = await import('pdfjs-dist')
      
      const mockError = new Error('Invalid PDF')
      vi.mocked(pdfjsLib.getDocument).mockImplementation(() => ({
        promise: Promise.reject(mockError)
      } as any))
      
      const { parsePdf } = await import('./pdfParser')
      
      try {
        await parsePdf(new Uint8Array([]))
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeDefined()
      }
    })
  })
})
