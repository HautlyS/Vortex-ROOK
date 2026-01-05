/**
 * Edge Case and Boundary Tests
 * Tests for unusual inputs, boundary conditions, and error scenarios
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeStore } from '@/stores/themeStore'
import { createEmptyProject } from '@/models'
import type { LayerObject, Bounds } from '@/models'

vi.mock('@/bridge', () => ({
  importDocumentWithAnalysis: vi.fn(),
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  isTauri: vi.fn(() => false)
}))

describe('Edge Case Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Numeric Boundary Conditions', () => {
    it('should handle Number.MAX_SAFE_INTEGER', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: Number.MAX_SAFE_INTEGER, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: Number.MAX_SAFE_INTEGER,
          opacity: 1,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].bounds.x).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle Number.MIN_SAFE_INTEGER', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: Number.MIN_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].bounds.x).toBe(Number.MIN_SAFE_INTEGER)
    })

    it('should handle floating point precision', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: 0.1 + 0.2, y: 0.3, width: 100.123456789, height: 50.987654321 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 0.333333333333,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      // Floating point comparison
      expect(Math.abs(store.currentPage!.layers[0].bounds.x - 0.3)).toBeLessThan(0.0001)
    })

    it('should handle Infinity values', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: Infinity, y: -Infinity, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].bounds.x).toBe(Infinity)
      expect(store.currentPage!.layers[0].bounds.y).toBe(-Infinity)
    })

    it('should handle NaN values gracefully', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: NaN, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(Number.isNaN(store.currentPage!.layers[0].bounds.x)).toBe(true)
    })
  })

  describe('String Edge Cases', () => {
    it('should handle empty string content', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          content: '',
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].content).toBe('')
    })

    it('should handle whitespace-only content', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          content: '   \t\n\r   ',
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].content).toBe('   \t\n\r   ')
    })

    it('should handle Unicode content', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      const unicodeContent = '你好世界 🌍 مرحبا العالم שלום עולם'
      
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          content: unicodeContent,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].content).toBe(unicodeContent)
    })

    it('should handle emoji content', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      const emojiContent = '👨‍👩‍👧‍👦 🏳️‍🌈 🇺🇸 👩🏽‍💻'
      
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          content: emojiContent,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].content).toBe(emojiContent)
    })

    it('should handle null bytes in content', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      const nullContent = 'Hello\x00World'
      
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'layer-1',
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          content: nullContent,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].content).toBe(nullContent)
    })

    it('should handle very long layer IDs', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      const longId = 'a'.repeat(10000)
      
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: longId,
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      expect(store.currentPage!.layers[0].id).toBe(longId)
      store.selectLayer(longId, false)
      expect(store.selectedLayerIds).toContain(longId)
    })
  })

  describe('Array Edge Cases', () => {
    it('should handle empty layers array', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: []
      }]
      
      expect(store.currentPage!.layers.length).toBe(0)
      store.selectLayer('non-existent', false)
      // Selection of non-existent layer should add it to selection array
      // but selectedLayers getter will return empty since layer doesn't exist
      expect(store.selectedLayers.length).toBe(0)
    })

    it('should handle empty pages array', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = []
      
      expect(store.totalPages).toBe(0)
      expect(store.currentPage).toBeNull()
    })

    it('should handle single element arrays', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{
          id: 'only-layer',
          type: 'text',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: 0,
          opacity: 1,
          sourceType: 'manual',
          role: 'content'
        }]
      }]
      
      store.moveLayerUp(0, 'only-layer')
      store.moveLayerDown(0, 'only-layer')
      
      // Should not throw, layer should remain
      expect(store.currentPage!.layers.length).toBe(1)
    })
  })

  describe('UI Store Edge Cases', () => {
    it('should handle zoom at boundaries', () => {
      const store = useUIStore()
      
      store.setZoom(0)
      expect(store.zoom).toBeGreaterThanOrEqual(0.1)
      
      store.setZoom(100)
      expect(store.zoom).toBeLessThanOrEqual(5)
      
      store.setZoom(-1)
      expect(store.zoom).toBeGreaterThanOrEqual(0.1)
    })

    it('should handle rapid zoom changes', () => {
      const store = useUIStore()
      
      for (let i = 0; i < 100; i++) {
        store.zoomIn(0.1)
      }
      
      expect(store.zoom).toBeLessThanOrEqual(5)
      
      for (let i = 0; i < 200; i++) {
        store.zoomOut(0.1)
      }
      
      expect(store.zoom).toBeGreaterThanOrEqual(0.1)
    })

    it('should handle notification overflow', () => {
      const store = useUIStore()
      
      // Add many notifications
      for (let i = 0; i < 100; i++) {
        store.showNotification('info', `Notification ${i}`, 0) // 0 = no auto-dismiss
      }
      
      // Should handle gracefully
      expect(store.notifications.length).toBeGreaterThan(0)
    })
  })

  describe('Theme Store Edge Cases', () => {
    it('should handle invalid color values', () => {
      const store = useThemeStore()
      
      // These should be handled gracefully
      store.setColor('accent', 'not-a-color')
      store.setColor('accent', '')
      store.setColor('accent', '#')
      store.setColor('accent', 'rgb()')
    })

    it('should handle color with alpha', () => {
      const store = useThemeStore()
      
      store.setColor('accent', '#ff000080')
      expect(store.colors.accent).toBe('#ff000080')
      
      store.setColor('accent', 'rgba(255, 0, 0, 0.5)')
      // Should handle or normalize
    })
  })

  describe('Concurrent Operation Edge Cases', () => {
    it('should handle selection during deletion', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          { id: 'layer-1', type: 'text', bounds: { x: 0, y: 0, width: 100, height: 50 }, visible: true, locked: false, zIndex: 0, opacity: 1, sourceType: 'manual', role: 'content' },
          { id: 'layer-2', type: 'text', bounds: { x: 0, y: 0, width: 100, height: 50 }, visible: true, locked: false, zIndex: 1, opacity: 1, sourceType: 'manual', role: 'content' }
        ]
      }]
      
      store.selectLayer('layer-1', false)
      store.deleteLayer(0, 'layer-1')
      
      // Selection should be cleared for deleted layer
      expect(store.selectedLayerIds).not.toContain('layer-1')
    })

    it('should handle update during page change', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [
        { pageIndex: 0, width: 612, height: 792, layers: [{ id: 'layer-0', type: 'text', bounds: { x: 0, y: 0, width: 100, height: 50 }, visible: true, locked: false, zIndex: 0, opacity: 1, sourceType: 'manual', role: 'content' }] },
        { pageIndex: 1, width: 612, height: 792, layers: [{ id: 'layer-1', type: 'text', bounds: { x: 0, y: 0, width: 100, height: 50 }, visible: true, locked: false, zIndex: 0, opacity: 1, sourceType: 'manual', role: 'content' }] }
      ]
      
      // Update layer on page 0
      store.updateLayer(0, 'layer-0', { content: 'Updated' })
      
      // Change to page 1
      store.goToPage(1)
      
      // Go back to page 0 and verify update persisted
      store.goToPage(0)
      expect(store.currentPage!.layers[0].content).toBe('Updated')
    })
  })

  describe('State Consistency Edge Cases', () => {
    it('should maintain consistency after rapid state changes', () => {
      const store = useDocumentStore()
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: Array.from({ length: 10 }, (_, i) => ({
          id: `layer-${i}`,
          type: 'text' as const,
          bounds: { x: i * 10, y: i * 10, width: 100, height: 50 },
          visible: true,
          locked: false,
          zIndex: i,
          opacity: 1,
          sourceType: 'manual' as const,
          role: 'content' as const
        }))
      }]
      
      // Rapid operations
      for (let i = 0; i < 50; i++) {
        const layerId = `layer-${i % 10}`
        store.selectLayer(layerId, i % 3 === 0)
        store.updateLayer(0, layerId, { opacity: (i % 100) / 100 })
        if (i % 5 === 0) store.clearSelection()
      }
      
      // State should be consistent
      expect(store.document).not.toBeNull()
      expect(store.currentPage!.layers.length).toBe(10)
    })

    it('should handle document replacement', () => {
      const store = useDocumentStore()
      
      // Set first document
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{ id: 'old-layer', type: 'text', bounds: { x: 0, y: 0, width: 100, height: 50 }, visible: true, locked: false, zIndex: 0, opacity: 1, sourceType: 'manual', role: 'content' }]
      }]
      store.selectLayer('old-layer', false)
      
      // Replace with new document
      store.document = createEmptyProject()
      store.document.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [{ id: 'new-layer', type: 'text', bounds: { x: 0, y: 0, width: 100, height: 50 }, visible: true, locked: false, zIndex: 0, opacity: 1, sourceType: 'manual', role: 'content' }]
      }]
      
      // Old selection should not affect new document
      expect(store.currentPage!.layers[0].id).toBe('new-layer')
    })
  })
})
