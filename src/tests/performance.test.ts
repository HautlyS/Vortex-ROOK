/**
 * Performance and Stress Tests
 * Tests application behavior under heavy load
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocumentStore } from '@/stores/documentStore'
import { createEmptyProject } from '@/models'
import type { LayerObject, PageData, BookProjectData } from '@/models'

vi.mock('@/bridge', () => ({
  importDocumentWithAnalysis: vi.fn(),
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  isTauri: vi.fn(() => false)
}))

function createTestLayer(id: string, zIndex: number): LayerObject {
  return {
    id,
    type: 'text',
    bounds: { x: Math.random() * 500, y: Math.random() * 700, width: 100, height: 50 },
    visible: true,
    locked: false,
    zIndex,
    opacity: 1,
    content: `Layer ${id} content with some text to make it realistic`,
    fontFamily: 'Arial',
    fontSize: 12,
    sourceType: 'extracted',
    role: 'content'
  }
}

function createLargePage(pageIndex: number, layerCount: number): PageData {
  return {
    pageIndex,
    width: 612,
    height: 792,
    dpi: 72,
    layers: Array.from({ length: layerCount }, (_, i) => createTestLayer(`layer-${pageIndex}-${i}`, i))
  }
}

function createLargeDocument(pageCount: number, layersPerPage: number): BookProjectData {
  const project = createEmptyProject()
  project.document.pages = Array.from({ length: pageCount }, (_, i) => createLargePage(i, layersPerPage))
  return project
}

describe('Performance Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Large Document Handling', () => {
    it('should handle document with 100 pages', () => {
      const documentStore = useDocumentStore()
      const startTime = performance.now()
      
      documentStore.document = createLargeDocument(100, 10)
      
      const loadTime = performance.now() - startTime
      
      expect(documentStore.totalPages).toBe(100)
      expect(loadTime).toBeLessThan(500) // Should load in < 500ms
    })

    it('should handle page with 500 layers', () => {
      const documentStore = useDocumentStore()
      const startTime = performance.now()
      
      documentStore.document = createLargeDocument(1, 500)
      
      const loadTime = performance.now() - startTime
      
      expect(documentStore.currentPage!.layers.length).toBe(500)
      expect(loadTime).toBeLessThan(200)
    })

    it('should navigate pages quickly in large document', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(100, 50)
      
      const startTime = performance.now()
      
      // Navigate through all pages
      for (let i = 0; i < 100; i++) {
        documentStore.goToPage(i)
      }
      
      const navTime = performance.now() - startTime
      
      expect(navTime).toBeLessThan(100) // < 1ms per page
    })

    it('should select layers quickly', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 200)
      
      const startTime = performance.now()
      
      // Select all layers one by one
      for (let i = 0; i < 200; i++) {
        documentStore.selectLayer(`layer-0-${i}`, true)
      }
      
      const selectTime = performance.now() - startTime
      
      expect(documentStore.selectedLayerIds.length).toBe(200)
      expect(selectTime).toBeLessThan(200)
    })
  })

  describe('Rapid Operations', () => {
    it('should handle 1000 layer updates', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 10)
      
      const startTime = performance.now()
      
      for (let i = 0; i < 1000; i++) {
        documentStore.updateLayer(0, 'layer-0-0', { 
          content: `Update ${i}`,
          opacity: (i % 100) / 100
        })
      }
      
      const updateTime = performance.now() - startTime
      
      expect(updateTime).toBeLessThan(500)
    })

    it('should handle rapid undo/redo cycles', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 5)
      
      // Create history
      for (let i = 0; i < 50; i++) {
        documentStore.updateLayer(0, 'layer-0-0', { content: `Update ${i}` })
      }
      
      const startTime = performance.now()
      
      // Rapid undo/redo
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          documentStore.undo()
        } else {
          documentStore.redo()
        }
      }
      
      const cycleTime = performance.now() - startTime
      
      expect(cycleTime).toBeLessThan(100)
    })

    it('should handle rapid layer add/delete', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 5)
      
      const startTime = performance.now()
      
      for (let i = 0; i < 100; i++) {
        const newLayer = createTestLayer(`temp-${i}`, 100 + i)
        documentStore.addLayer(0, newLayer)
        documentStore.deleteLayer(0, `temp-${i}`)
      }
      
      const opTime = performance.now() - startTime
      
      expect(opTime).toBeLessThan(200)
      expect(documentStore.currentPage!.layers.length).toBe(5) // Original count
    })
  })

  describe('Memory Efficiency', () => {
    it('should not leak memory on document close', () => {
      const documentStore = useDocumentStore()
      
      // Open and close multiple large documents
      for (let i = 0; i < 10; i++) {
        documentStore.document = createLargeDocument(50, 100)
        documentStore.closeDocument()
      }
      
      expect(documentStore.document).toBeNull()
      expect(documentStore.selectedLayerIds.length).toBe(0)
    })

    it('should handle history stack efficiently', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 10)
      
      // Create many history entries
      for (let i = 0; i < 200; i++) {
        documentStore.updateLayer(0, 'layer-0-0', { content: `Update ${i}` })
      }
      
      // History should be limited
      let undoCount = 0
      while (documentStore.canUndo && undoCount < 100) {
        documentStore.undo()
        undoCount++
      }
      
      expect(undoCount).toBeLessThanOrEqual(50)
    })
  })

  describe('Concurrent Access Simulation', () => {
    it('should handle interleaved operations', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(5, 20)
      
      // Simulate interleaved operations from different "users"
      const operations = [
        () => documentStore.goToPage(1),
        () => documentStore.selectLayer('layer-1-0', false),
        () => documentStore.goToPage(2),
        () => documentStore.updateLayer(2, 'layer-2-0', { content: 'User A' }),
        () => documentStore.goToPage(1),
        () => documentStore.updateLayer(1, 'layer-1-0', { content: 'User B' }),
        () => documentStore.selectLayer('layer-1-1', true),
        () => documentStore.goToPage(3),
        () => documentStore.deleteLayer(3, 'layer-3-0'),
        () => documentStore.goToPage(0),
      ]
      
      // Execute in random order
      const shuffled = [...operations].sort(() => Math.random() - 0.5)
      
      for (const op of shuffled) {
        op()
      }
      
      // Document should still be valid
      expect(documentStore.document).not.toBeNull()
      expect(documentStore.totalPages).toBe(5)
    })
  })
})

describe('Stress Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Extreme Data Sizes', () => {
    it('should handle very long text content', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      const longContent = 'A'.repeat(100000) // 100KB of text
      
      documentStore.updateLayer(0, 'layer-0-0', { content: longContent })
      
      const layer = documentStore.currentPage!.layers[0]
      expect(layer.content?.length).toBe(100000)
    })

    it('should handle many small layers', () => {
      const documentStore = useDocumentStore()
      
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: Array.from({ length: 1000 }, (_, i) => ({
          id: `tiny-${i}`,
          type: 'text' as const,
          bounds: { x: i % 50 * 10, y: Math.floor(i / 50) * 10, width: 8, height: 8 },
          visible: true,
          locked: false,
          zIndex: i,
          opacity: 1,
          content: `${i}`,
          sourceType: 'extracted' as const,
          role: 'content' as const
        }))
      }]
      
      documentStore.document = project
      
      expect(documentStore.currentPage!.layers.length).toBe(1000)
    })

    it('should handle deeply nested operations', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 10)
      
      // Nested selection and update operations
      for (let i = 0; i < 10; i++) {
        documentStore.selectLayer(`layer-0-${i}`, i > 0)
        for (let j = 0; j < 10; j++) {
          documentStore.updateLayer(0, `layer-0-${i}`, { 
            opacity: (j + 1) / 10,
            bounds: { x: j * 10, y: j * 10, width: 100, height: 50 }
          })
        }
      }
      
      expect(documentStore.selectedLayerIds.length).toBe(10)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty document', () => {
      const documentStore = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = []
      
      documentStore.document = project
      
      expect(documentStore.totalPages).toBe(0)
      expect(documentStore.currentPage).toBeNull()
    })

    it('should handle page with no layers', () => {
      const documentStore = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: []
      }]
      
      documentStore.document = project
      
      expect(documentStore.currentPage!.layers.length).toBe(0)
      documentStore.selectLayer('non-existent', false)
      // Selection adds to selectedLayerIds but selectedLayers filters to actual layers
      expect(documentStore.selectedLayers.length).toBe(0)
    })

    it('should handle special characters in content', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      const specialContent = '🎉 <script>alert("xss")</script> "quotes" \'apostrophe\' & ampersand \n\t\r'
      
      documentStore.updateLayer(0, 'layer-0-0', { content: specialContent })
      
      const layer = documentStore.currentPage!.layers[0]
      expect(layer.content).toBe(specialContent)
    })

    it('should handle zero-dimension bounds', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      documentStore.updateLayer(0, 'layer-0-0', { 
        bounds: { x: 0, y: 0, width: 0, height: 0 }
      })
      
      const layer = documentStore.currentPage!.layers[0]
      expect(layer.bounds.width).toBe(0)
      expect(layer.bounds.height).toBe(0)
    })

    it('should handle negative coordinates', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      documentStore.updateLayer(0, 'layer-0-0', { 
        bounds: { x: -100, y: -50, width: 200, height: 100 }
      })
      
      const layer = documentStore.currentPage!.layers[0]
      expect(layer.bounds.x).toBe(-100)
      expect(layer.bounds.y).toBe(-50)
    })

    it('should handle very large coordinates', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      documentStore.updateLayer(0, 'layer-0-0', { 
        bounds: { x: 1000000, y: 1000000, width: 100, height: 50 }
      })
      
      const layer = documentStore.currentPage!.layers[0]
      expect(layer.bounds.x).toBe(1000000)
    })
  })

  describe('Boundary Conditions', () => {
    it('should handle opacity at boundaries', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      // Test boundary values
      const opacities = [0, 0.001, 0.5, 0.999, 1]
      
      for (const opacity of opacities) {
        documentStore.updateLayer(0, 'layer-0-0', { opacity })
        const layer = documentStore.currentPage!.layers[0]
        expect(layer.opacity).toBe(opacity)
      }
    })

    it('should handle font size boundaries', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 1)
      
      const fontSizes = [1, 8, 12, 72, 144, 500]
      
      for (const fontSize of fontSizes) {
        documentStore.updateLayer(0, 'layer-0-0', { fontSize })
        const layer = documentStore.currentPage!.layers[0]
        expect(layer.fontSize).toBe(fontSize)
      }
    })

    it('should handle z-index boundaries', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createLargeDocument(1, 5)
      
      // Move first layer to top repeatedly
      for (let i = 0; i < 10; i++) {
        documentStore.moveLayerUp(0, 'layer-0-0')
      }
      
      // Move last layer to bottom repeatedly
      for (let i = 0; i < 10; i++) {
        documentStore.moveLayerDown(0, 'layer-0-4')
      }
      
      // Document should still be valid
      expect(documentStore.currentPage!.layers.length).toBe(5)
    })
  })
})
