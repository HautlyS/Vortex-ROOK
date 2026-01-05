/**
 * useImageLoader Composable Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useImageLoader, getImageUrl, isDirectUrl, extractImageId, clearImageCache } from '@/composables/useImageLoader'

// Mock environment
vi.mock('@/bridge/environment', () => ({
  isTauri: () => false
}))

describe('useImageLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearImageCache()
  })

  afterEach(() => {
    clearImageCache()
  })

  describe('isDirectUrl', () => {
    it('should return false for null/undefined/empty', () => {
      expect(isDirectUrl('')).toBe(false)
      expect(isDirectUrl(null as any)).toBe(false)
      expect(isDirectUrl(undefined as any)).toBe(false)
    })

    it('should return true for http/https URLs', () => {
      expect(isDirectUrl('https://example.com/image.png')).toBe(true)
      expect(isDirectUrl('http://example.com/image.png')).toBe(true)
    })

    it('should return true for data URLs', () => {
      expect(isDirectUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    })

    it('should return true for blob URLs', () => {
      expect(isDirectUrl('blob:http://localhost/12345')).toBe(true)
    })

    it('should return false for image:// protocol', () => {
      expect(isDirectUrl('image://layer-123')).toBe(false)
    })
  })

  describe('extractImageId', () => {
    it('should return null for empty input', () => {
      expect(extractImageId('')).toBe(null)
      expect(extractImageId(null as any)).toBe(null)
    })

    it('should extract ID from image:// URL', () => {
      expect(extractImageId('image://layer-123')).toBe('layer-123')
    })

    it('should return direct URLs as-is', () => {
      expect(extractImageId('https://example.com/img.png')).toBe('https://example.com/img.png')
      expect(extractImageId('blob:http://localhost/123')).toBe('blob:http://localhost/123')
    })

    it('should return plain ID as-is', () => {
      expect(extractImageId('layer-123')).toBe('layer-123')
    })
  })

  describe('getImageUrl', () => {
    it('should return null for empty input', async () => {
      expect(await getImageUrl('')).toBe(null)
    })

    it('should return direct URLs as-is', async () => {
      expect(await getImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png')
      expect(await getImageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
      expect(await getImageUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123')
    })

    it('should return null for image:// in web mode', async () => {
      // In web mode without Tauri, image:// URLs can't be loaded
      const result = await getImageUrl('image://layer-123')
      expect(result).toBe(null)
    })
  })

  describe('useImageLoader composable', () => {
    it('should return loading state and functions', () => {
      const { loading, error, loadImage, getImageUrl: getUrl } = useImageLoader()
      
      expect(loading.value).toBe(false)
      expect(error.value).toBe(null)
      expect(typeof loadImage).toBe('function')
      expect(typeof getUrl).toBe('function')
    })

    it('should load direct URLs immediately', async () => {
      const { loadImage, loading } = useImageLoader()
      
      const result = await loadImage('https://example.com/image.png')
      expect(result).toBe('https://example.com/image.png')
      expect(loading.value).toBe(false)
    })

    it('should return null for empty input', async () => {
      const { loadImage } = useImageLoader()
      
      const result = await loadImage('')
      expect(result).toBe(null)
    })
  })

  describe('clearImageCache', () => {
    it('should clear cache without errors', () => {
      expect(() => clearImageCache()).not.toThrow()
    })
  })
})
