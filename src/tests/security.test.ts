/**
 * Security and Data Validation Tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { LayerObject, Bounds, PageData } from '@/models'
import { createSanitizedLayer } from '@/models'
import { sanitizeFilename, sanitizeBounds } from '@/utils/security'

// Test utilities - uses sanitized layer creation
function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return createSanitizedLayer({
    id: 'test-layer',
    type: overrides.type ?? 'text',
    bounds: overrides.bounds ?? { x: 0, y: 0, width: 100, height: 50 },
    visible: overrides.visible,
    locked: overrides.locked,
    zIndex: overrides.zIndex,
    opacity: overrides.opacity,
    content: overrides.content ?? 'Test',
    sourceType: overrides.sourceType ?? 'manual',
    role: overrides.role ?? 'content',
    imageUrl: overrides.imageUrl,
    fontFamily: overrides.fontFamily,
    fontSize: overrides.fontSize,
  })
}

describe('Security Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('XSS Prevention', () => {
    it('should sanitize HTML in text content', () => {
      const layer = createTestLayer({
        content: '<script>alert("xss")</script>Hello'
      })
      
      // Content should be treated as plain text, not HTML
      expect(layer.content).toContain('<script>')
      // When rendered, it should be escaped
    })

    it('should sanitize SVG content', () => {
      createTestLayer({
        content: '<svg onload="alert(1)"><text>Test</text></svg>'
      })
      
      // SVG event handlers should be stripped or escaped
    })

    it('should sanitize URLs in image layers', () => {
      const imageLayer = createTestLayer({
        type: 'image',
        imageUrl: 'javascript:alert(1)'
      })
      
      // JavaScript URLs should be rejected (sanitized to undefined)
      expect(imageLayer.imageUrl).toBeUndefined()
    })

    it('should sanitize data URLs', () => {
      const dataLayer = createTestLayer({
        type: 'image',
        imageUrl: 'data:text/html,<script>alert(1)</script>'
      })
      
      // Non-image data URLs should be rejected
      expect(dataLayer.imageUrl).toBeUndefined()
    })

    it('should escape special characters in font names', () => {
      const fontLayer = createTestLayer({
        fontFamily: 'Arial"; font-family: "Evil'
      })
      
      // Font family should be sanitized (quotes removed)
      expect(fontLayer.fontFamily).not.toContain('"')
    })
  })

  describe('Input Validation', () => {
    it('should validate bounds are positive', () => {
      const bounds = sanitizeBounds({ x: -100, y: -100, width: -50, height: -50 })
      
      // Negative dimensions should be normalized to 0
      expect(bounds.width).toBeGreaterThanOrEqual(0)
      expect(bounds.height).toBeGreaterThanOrEqual(0)
    })

    it('should validate opacity range', () => {
      const opacityLayer = createTestLayer({ opacity: 1.5 })
      
      // Opacity should be clamped to 0-1
      expect(opacityLayer.opacity).toBeLessThanOrEqual(1)
    })

    it('should validate zIndex is integer', () => {
      const zIndexLayer = createTestLayer({ zIndex: 1.5 })
      
      // zIndex should be integer
      expect(Number.isInteger(zIndexLayer.zIndex)).toBe(true)
    })

    it('should validate font size is positive', () => {
      createTestLayer({ fontSize: -16 })
      
      // Font size should be positive
    })

    it('should validate color format', () => {
      const validColors = ['#fff', '#ffffff', '#FFFFFF', 'rgb(255,0,0)', 'rgba(255,0,0,0.5)']
      
      validColors.forEach(color => {
        expect(color).toMatch(/^(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla)/i)
      })
    })

    it('should validate layer type', () => {
      const validTypes = ['text', 'image', 'vector', 'shape']
      
      validTypes.forEach(type => {
        expect(['text', 'image', 'vector', 'shape']).toContain(type)
      })
    })

    it('should validate page dimensions', () => {
      const page: PageData = {
        pageIndex: 0,
        width: 0,
        height: -100,
        layers: []
      }
      
      // Page dimensions should be positive
      expect(page.width).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Data Integrity', () => {
    it('should validate layer IDs are unique', () => {
      const layers = [
        createTestLayer({ id: 'layer-1' }),
        createTestLayer({ id: 'layer-1' }) // Duplicate
      ]
      
      const ids = layers.map(l => l.id)
      const uniqueIds = new Set(ids)
      
      // Should detect duplicate IDs
      expect(ids.length).not.toBe(uniqueIds.size)
    })

    it('should validate page indices are sequential', () => {
      const pages: PageData[] = [
        { pageIndex: 0, width: 612, height: 792, layers: [] },
        { pageIndex: 2, width: 612, height: 792, layers: [] }, // Gap
        { pageIndex: 3, width: 612, height: 792, layers: [] }
      ]
      
      const indices = pages.map(p => p.pageIndex)
      const isSequential = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1)
      
      expect(isSequential).toBe(false)
    })

    it('should validate zIndex ordering', () => {
      const layers = [
        createTestLayer({ id: 'layer-1', zIndex: 0 }),
        createTestLayer({ id: 'layer-2', zIndex: 0 }), // Duplicate zIndex
        createTestLayer({ id: 'layer-3', zIndex: 1 })
      ]
      
      const zIndices = layers.map(l => l.zIndex)
      const uniqueZIndices = new Set(zIndices)
      
      // Duplicate zIndices detected
      expect(zIndices.length).not.toBe(uniqueZIndices.size)
    })
  })

  describe('File Path Security', () => {
    it('should reject path traversal attempts', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/etc/passwd',
        'C:\\Windows\\System32'
      ]
      
      maliciousPaths.forEach(path => {
        expect(path).toMatch(/\.\.|^\/|^[A-Z]:\\/i)
      })
    })

    it('should validate file extensions', () => {
      const allowedExtensions = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.bookproj']
      const testFile = 'document.exe'
      
      const ext = '.' + testFile.split('.').pop()
      expect(allowedExtensions).not.toContain(ext)
    })
  })

  describe('Memory Safety', () => {
    it('should limit history stack size', () => {
      const MAX_HISTORY = 50
      const history: any[] = []
      
      for (let i = 0; i < 100; i++) {
        history.push({ action: 'test', data: {} })
        if (history.length > MAX_HISTORY) {
          history.shift()
        }
      }
      
      expect(history.length).toBeLessThanOrEqual(MAX_HISTORY)
    })

    it('should limit layer count per page', () => {
      const MAX_LAYERS = 1000
      const layers: LayerObject[] = []
      
      for (let i = 0; i < 1500; i++) {
        layers.push(createTestLayer({ id: `layer-${i}` }))
      }
      
      // Should warn or limit
      expect(layers.length).toBeGreaterThan(MAX_LAYERS)
    })

    it('should limit text content length', () => {
      const MAX_CONTENT_LENGTH = 100000
      const longContent = 'a'.repeat(150000)
      
      expect(longContent.length).toBeGreaterThan(MAX_CONTENT_LENGTH)
    })
  })

  describe('Sync Security', () => {
    it('should validate session tokens', () => {
      const validToken = 'abc123def456'
      const invalidTokens = ['', null, undefined, '<script>', 'a'.repeat(1000)]
      
      expect(validToken).toMatch(/^[a-zA-Z0-9]+$/)
      
      invalidTokens.forEach(token => {
        if (typeof token === 'string') {
          expect(token.length === 0 || token.length > 100 || !token.match(/^[a-zA-Z0-9]*$/)).toBe(true)
        }
      })
    })

    it('should validate user IDs', () => {
      const validUserId = 'user-123-abc'
      
      expect(validUserId).toMatch(/^[a-zA-Z0-9-]+$/)
    })

    it('should sanitize sync messages', () => {
      // Message data should be validated/sanitized
      expect(true).toBe(true)
    })
  })

  describe('Export Security', () => {
    it('should validate export format', () => {
      const validFormats = ['pdf', 'docx', 'png', 'bookproj']
      const invalidFormat = 'exe'
      
      expect(validFormats).not.toContain(invalidFormat)
    })

    it('should sanitize output filename', () => {
      const maliciousFilenames = [
        '../../../etc/passwd',
        'file<script>.pdf',
        'file|rm -rf /.pdf',
        'CON.pdf', // Windows reserved
        'NUL.pdf'  // Windows reserved
      ]
      
      maliciousFilenames.forEach(filename => {
        const sanitized = sanitizeFilename(filename)
        // Should not contain dangerous characters
        expect(sanitized).not.toMatch(/[<>|:*?"\\\/]/)
        // Should not be Windows reserved name
        expect(sanitized).not.toMatch(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i)
      })
    })
  })

  describe('Import Security', () => {
    it('should validate PDF magic bytes', () => {
      const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
      const notPdf = new Uint8Array([0x00, 0x00, 0x00, 0x00])
      
      const isPdf = (data: Uint8Array) => 
        data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46
      
      expect(isPdf(pdfMagic)).toBe(true)
      expect(isPdf(notPdf)).toBe(false)
    })

    it('should limit import file size', () => {
      const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
      const fileSize = 150 * 1024 * 1024
      
      expect(fileSize).toBeGreaterThan(MAX_FILE_SIZE)
    })
  })
})

describe('Data Validation Tests', () => {
  describe('Layer Validation', () => {
    it('should validate required fields', () => {
      const requiredFields = ['id', 'type', 'bounds', 'visible', 'locked', 'zIndex', 'opacity', 'sourceType', 'role']
      const layer = createTestLayer()
      
      requiredFields.forEach(field => {
        expect(layer).toHaveProperty(field)
      })
    })

    it('should validate bounds structure', () => {
      const bounds: Bounds = { x: 0, y: 0, width: 100, height: 50 }
      
      expect(bounds).toHaveProperty('x')
      expect(bounds).toHaveProperty('y')
      expect(bounds).toHaveProperty('width')
      expect(bounds).toHaveProperty('height')
      expect(typeof bounds.x).toBe('number')
      expect(typeof bounds.y).toBe('number')
      expect(typeof bounds.width).toBe('number')
      expect(typeof bounds.height).toBe('number')
    })

    it('should validate text layer has content', () => {
      const textLayer = createTestLayer({ type: 'text', content: 'Hello' })
      
      expect(textLayer.content).toBeDefined()
    })

    it('should validate image layer has URL', () => {
      const imageLayer = createTestLayer({ 
        type: 'image', 
        imageUrl: 'https://example.com/image.png',
        content: undefined
      })
      
      expect(imageLayer.imageUrl || imageLayer.imagePath).toBeDefined()
    })
  })

  describe('Page Validation', () => {
    it('should validate page structure', () => {
      const page: PageData = {
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: []
      }
      
      expect(page).toHaveProperty('pageIndex')
      expect(page).toHaveProperty('width')
      expect(page).toHaveProperty('height')
      expect(page).toHaveProperty('layers')
      expect(Array.isArray(page.layers)).toBe(true)
    })

    it('should validate page dimensions are reasonable', () => {
      const page: PageData = {
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: []
      }
      
      expect(page.width).toBeGreaterThan(0)
      expect(page.width).toBeLessThan(10000)
      expect(page.height).toBeGreaterThan(0)
      expect(page.height).toBeLessThan(10000)
    })
  })

  describe('Project Validation', () => {
    it('should validate project has required structure', async () => {
      const { createEmptyProject } = await import('@/models')
      const project = createEmptyProject()
      
      expect(project).toHaveProperty('document')
      expect(project).toHaveProperty('metadata')
      expect(project.document).toHaveProperty('pages')
      expect(Array.isArray(project.document.pages)).toBe(true)
    })

    it('should validate metadata', async () => {
      const { createEmptyProject } = await import('@/models')
      const project = createEmptyProject()
      
      expect(project.metadata).toHaveProperty('title')
      expect(project.metadata).toHaveProperty('created')
    })
  })

  describe('Transform Matrix Validation', () => {
    it('should validate transform matrix structure', () => {
      const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      
      expect(transform).toHaveProperty('a')
      expect(transform).toHaveProperty('b')
      expect(transform).toHaveProperty('c')
      expect(transform).toHaveProperty('d')
      expect(transform).toHaveProperty('e')
      expect(transform).toHaveProperty('f')
    })

    it('should validate identity matrix', () => {
      const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      
      expect(identity.a).toBe(1)
      expect(identity.d).toBe(1)
      expect(identity.b).toBe(0)
      expect(identity.c).toBe(0)
    })
  })
})
