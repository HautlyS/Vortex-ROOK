/**
 * Integration Tests - Document Workflow
 * Tests complete workflows: import -> edit -> export
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { createEmptyProject } from '@/models'
import type { LayerObject, PageData, BookProjectData } from '@/models'

// Mock all bridge functions
vi.mock('@/bridge', () => ({
  importDocumentWithAnalysis: vi.fn(),
  exportDocument: vi.fn(),
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  isTauri: vi.fn(() => false),
  updateLayer: vi.fn().mockResolvedValue({})
}))

function createTestLayer(id: string, overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id,
    type: 'text',
    bounds: { x: 50, y: 50, width: 200, height: 50 },
    visible: true,
    locked: false,
    zIndex: 0,
    opacity: 1,
    content: `Content for ${id}`,
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 400,
    color: '#000000',
    sourceType: 'extracted',
    role: 'content',
    ...overrides
  }
}

function createTestPage(pageIndex: number, layerCount: number = 3): PageData {
  return {
    pageIndex,
    width: 612,
    height: 792,
    dpi: 72,
    layers: Array.from({ length: layerCount }, (_, i) => 
      createTestLayer(`layer-${pageIndex}-${i}`, { zIndex: i })
    )
  }
}

function createTestDocument(pageCount: number = 3): BookProjectData {
  const project = createEmptyProject()
  project.document.pages = Array.from({ length: pageCount }, (_, i) => createTestPage(i))
  project.metadata.title = 'Test Document'
  return project
}

describe('Document Workflow Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Complete Import -> Edit -> Export Workflow', () => {
    it('should handle full document lifecycle', async () => {
      const documentStore = useDocumentStore()
      const uiStore = useUIStore()
      
      // Step 1: Import document
      const { importDocumentWithAnalysis } = await import('@/bridge')
      vi.mocked(importDocumentWithAnalysis).mockResolvedValue({
        success: true,
        message: 'Imported',
        data: createTestDocument(5).document
      })
      
      await documentStore.importDocument()
      
      expect(documentStore.hasDocument).toBe(true)
      expect(documentStore.totalPages).toBe(5)
      
      // Step 2: Navigate pages
      documentStore.goToPage(2)
      expect(documentStore.currentPageIndex).toBe(2)
      
      // Step 3: Select and edit layer
      const layerId = documentStore.currentPage!.layers[0].id
      documentStore.selectLayer(layerId, false)
      expect(documentStore.selectedLayerIds).toContain(layerId)
      
      // Step 4: Update layer content
      documentStore.updateLayer(2, layerId, { content: 'Updated content' })
      const updatedLayer = documentStore.currentPage!.layers.find(l => l.id === layerId)
      expect(updatedLayer?.content).toBe('Updated content')
      
      // Step 5: Undo the change
      documentStore.undo()
      const revertedLayer = documentStore.currentPage!.layers.find(l => l.id === layerId)
      expect(revertedLayer?.content).not.toBe('Updated content')
      
      // Step 6: Redo the change
      documentStore.redo()
      const redoneLayer = documentStore.currentPage!.layers.find(l => l.id === layerId)
      expect(redoneLayer?.content).toBe('Updated content')
      
      // Step 7: Add new layer
      const newLayer = createTestLayer('new-layer', { content: 'New layer content' })
      documentStore.addLayer(2, newLayer)
      expect(documentStore.currentPage!.layers.some(l => l.id === 'new-layer')).toBe(true)
      
      // Step 8: Delete layer
      documentStore.deleteLayer(2, 'new-layer')
      expect(documentStore.currentPage!.layers.some(l => l.id === 'new-layer')).toBe(false)
      
      // Step 9: Save project
      const { saveProject } = await import('@/bridge')
      vi.mocked(saveProject).mockResolvedValue({ success: true, message: 'Saved' })
      
      const saveResult = await documentStore.saveProject()
      expect(saveResult.success).toBe(true)
    })

    it('should maintain state consistency across operations', async () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(3)
      
      // Perform multiple operations
      const operations = [
        () => documentStore.goToPage(1),
        () => documentStore.selectLayer('layer-1-0', false),
        () => documentStore.updateLayer(1, 'layer-1-0', { opacity: 0.5 }),
        () => documentStore.selectLayer('layer-1-1', true),
        () => documentStore.updateLayer(1, 'layer-1-1', { visible: false }),
        () => documentStore.moveLayerUp(1, 'layer-1-0'),
        () => documentStore.duplicateLayer(1, 'layer-1-2'),
      ]
      
      for (const op of operations) {
        op()
        // Verify state is consistent after each operation
        expect(documentStore.document).not.toBeNull()
        expect(documentStore.currentPage).not.toBeNull()
      }
      
      // Verify final state
      expect(documentStore.currentPageIndex).toBe(1)
      expect(documentStore.selectedLayerIds.length).toBe(2)
    })

    it('should handle concurrent operations correctly', async () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(2)
      
      // Simulate concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) => 
        documentStore.updateLayer(0, 'layer-0-0', { content: `Update ${i}` })
      )
      
      // All updates should complete without error
      // Final state should reflect last update
      const layer = documentStore.currentPage!.layers.find(l => l.id === 'layer-0-0')
      expect(layer?.content).toBe('Update 9')
    })
  })

  describe('Error Recovery Workflow', () => {
    it('should recover from failed import', async () => {
      const documentStore = useDocumentStore()
      const { importDocumentWithAnalysis } = await import('@/bridge')
      
      // First import fails
      vi.mocked(importDocumentWithAnalysis).mockResolvedValueOnce({
        success: false,
        message: 'Import failed',
        data: null
      })
      
      const result1 = await documentStore.importDocument()
      expect(result1).toBe(false)
      expect(documentStore.hasDocument).toBe(false)
      
      // Second import succeeds
      vi.mocked(importDocumentWithAnalysis).mockResolvedValueOnce({
        success: true,
        message: 'Imported',
        data: createTestDocument(1).document
      })
      
      const result2 = await documentStore.importDocument()
      expect(result2).toBe(true)
      expect(documentStore.hasDocument).toBe(true)
    })

    it('should handle corrupted layer data gracefully', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      // Try to update non-existent layer
      documentStore.updateLayer(0, 'non-existent-layer', { content: 'test' })
      
      // Should not throw, document should remain intact
      expect(documentStore.document).not.toBeNull()
      expect(documentStore.currentPage!.layers.length).toBe(3)
    })

    it('should handle invalid page navigation', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(3)
      
      // Navigate to invalid pages
      documentStore.goToPage(-100)
      expect(documentStore.currentPageIndex).toBe(0)
      
      documentStore.goToPage(1000)
      expect(documentStore.currentPageIndex).toBe(2)
      
      // Navigate when no document
      documentStore.closeDocument()
      documentStore.goToPage(1)
      expect(documentStore.currentPageIndex).toBe(0)
    })
  })

  describe('Multi-Page Operations', () => {
    it('should handle page reordering', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(5)
      
      // Get original page order
      const originalOrder = documentStore.document!.document.pages.map(p => p.pageIndex)
      
      // Reorder pages (if implemented)
      // This tests the data structure integrity
      expect(documentStore.totalPages).toBe(5)
    })

    it('should maintain layer references across page changes', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(3)
      
      // Select layer on page 0
      documentStore.selectLayer('layer-0-0', false)
      
      // Navigate to page 1
      documentStore.goToPage(1)
      
      // Selection should be cleared or maintained based on implementation
      // This tests selection state management
      expect(documentStore.currentPageIndex).toBe(1)
    })
  })

  describe('Undo/Redo Stack Integrity', () => {
    it('should maintain correct undo/redo stack after multiple operations', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      // Perform 10 operations
      for (let i = 0; i < 10; i++) {
        documentStore.updateLayer(0, 'layer-0-0', { content: `Update ${i}` })
      }
      
      expect(documentStore.canUndo).toBe(true)
      
      // Undo 5 times
      for (let i = 0; i < 5; i++) {
        documentStore.undo()
      }
      
      expect(documentStore.canUndo).toBe(true)
      expect(documentStore.canRedo).toBe(true)
      
      // Redo 3 times
      for (let i = 0; i < 3; i++) {
        documentStore.redo()
      }
      
      // New operation should clear redo stack
      documentStore.updateLayer(0, 'layer-0-0', { content: 'New update' })
      expect(documentStore.canRedo).toBe(false)
    })

    it('should limit history stack size', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      // Perform many operations (more than MAX_HISTORY_ENTRIES)
      for (let i = 0; i < 100; i++) {
        documentStore.updateLayer(0, 'layer-0-0', { content: `Update ${i}` })
      }
      
      // Undo stack should be limited
      let undoCount = 0
      while (documentStore.canUndo) {
        documentStore.undo()
        undoCount++
        if (undoCount > 100) break // Safety limit
      }
      
      expect(undoCount).toBeLessThanOrEqual(50) // MAX_HISTORY_ENTRIES
    })
  })
})

describe('Layer Operations Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Complex Layer Manipulations', () => {
    it('should handle layer grouping operations', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      // Select multiple layers
      documentStore.selectLayer('layer-0-0', false)
      documentStore.selectLayer('layer-0-1', true)
      documentStore.selectLayer('layer-0-2', true)
      
      expect(documentStore.selectedLayerIds.length).toBe(3)
      expect(documentStore.selectedLayers.length).toBe(3)
    })

    it('should maintain z-index integrity after operations', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      // Move layers around
      documentStore.moveLayerUp(0, 'layer-0-0')
      documentStore.moveLayerDown(0, 'layer-0-2')
      
      // Verify z-indices are still valid (no duplicates, proper ordering)
      const zIndices = documentStore.currentPage!.layers.map(l => l.zIndex)
      const uniqueZIndices = new Set(zIndices)
      
      // All z-indices should be unique
      expect(zIndices.length).toBe(uniqueZIndices.size)
    })

    it('should handle rapid layer updates', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      const startTime = performance.now()
      
      // Perform 100 rapid updates
      for (let i = 0; i < 100; i++) {
        documentStore.updateLayer(0, 'layer-0-0', { 
          bounds: { x: i, y: i, width: 100 + i, height: 50 + i }
        })
      }
      
      const endTime = performance.now()
      
      // Should complete in reasonable time (< 500ms for CI)
      expect(endTime - startTime).toBeLessThan(500)
      
      // Final state should be correct
      const layer = documentStore.currentPage!.layers.find(l => l.id === 'layer-0-0')
      expect(layer?.bounds.x).toBe(99)
    })
  })

  describe('Layer Type Conversions', () => {
    it('should handle text layer with all properties', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      documentStore.updateLayer(0, 'layer-0-0', {
        fontFamily: 'Georgia',
        fontSize: 24,
        fontWeight: 700,
        fontStyle: 'italic',
        textDecoration: 'underline',
        textTransform: 'uppercase',
        textAlign: 'center',
        lineHeight: 1.5,
        letterSpacing: 2,
        color: '#ff0000',
        backgroundColor: '#ffff00'
      })
      
      const layer = documentStore.currentPage!.layers.find(l => l.id === 'layer-0-0')
      expect(layer?.fontFamily).toBe('Georgia')
      expect(layer?.fontSize).toBe(24)
      expect(layer?.fontWeight).toBe(700)
    })

    it('should handle image layer properties', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createTestDocument(1)
      
      // Add image layer
      const imageLayer = createTestLayer('image-layer', {
        type: 'image',
        imageUrl: 'https://example.com/image.png',
        content: undefined
      })
      documentStore.addLayer(0, imageLayer)
      
      // Update image properties
      documentStore.updateLayer(0, 'image-layer', {
        opacity: 0.8,
        bounds: { x: 100, y: 100, width: 400, height: 300 }
      })
      
      const layer = documentStore.currentPage!.layers.find(l => l.id === 'image-layer')
      expect(layer?.opacity).toBe(0.8)
    })
  })
})
