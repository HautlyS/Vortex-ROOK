/**
 * Document Store Tests
 * Comprehensive tests for document state management
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocumentStore } from './documentStore'
import { createEmptyProject } from '@/models'
import type { LayerObject, PageData, BookProjectData } from '@/models'

// Mock bridge module
vi.mock('@/bridge', () => ({
  importDocumentWithAnalysis: vi.fn(),
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  isTauri: vi.fn(() => false)
}))

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: `layer-${Date.now()}-${Math.random()}`,
    type: 'text',
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    visible: true,
    locked: false,
    zIndex: 0,
    opacity: 1,
    content: 'Test content',
    sourceType: 'manual',
    role: 'content',
    ...overrides
  }
}

function createTestPage(layers: LayerObject[] = []): PageData {
  return {
    pageIndex: 0,
    width: 612,
    height: 792,
    dpi: 72,
    layers
  }
}

function createTestDocument(pages: PageData[] = []): BookProjectData {
  return {
    ...createEmptyProject(),
    document: {
      pageWidth: 612,
      pageHeight: 792,
      pages: pages.length ? pages : [createTestPage()]
    }
  }
}

describe('DocumentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should have null document initially', () => {
      const store = useDocumentStore()
      expect(store.document).toBeNull()
      expect(store.hasDocument).toBe(false)
    })

    it('should have default page index of 0', () => {
      const store = useDocumentStore()
      expect(store.currentPageIndex).toBe(0)
    })

    it('should have empty selection', () => {
      const store = useDocumentStore()
      expect(store.selectedLayerIds).toEqual([])
      expect(store.selectedLayers).toEqual([])
    })

    it('should have empty undo/redo stacks', () => {
      const store = useDocumentStore()
      expect(store.canUndo).toBe(false)
      expect(store.canRedo).toBe(false)
    })
  })

  describe('Document Operations', () => {
    it('should set document correctly', () => {
      const store = useDocumentStore()
      const doc = createTestDocument()
      store.document = doc
      
      expect(store.document).toStrictEqual(doc)
      expect(store.hasDocument).toBe(true)
    })

    it('should close document and reset state', () => {
      const store = useDocumentStore()
      store.document = createTestDocument()
      store.selectedLayerIds = ['layer-1']
      
      store.closeDocument()
      
      expect(store.document).toBeNull()
      expect(store.selectedLayerIds).toEqual([])
      expect(store.currentPageIndex).toBe(0)
    })
  })

  describe('Page Navigation', () => {
    it('should navigate to valid page', () => {
      const store = useDocumentStore()
      store.document = createTestDocument([
        createTestPage(),
        createTestPage(),
        createTestPage()
      ])
      
      store.goToPage(1)
      expect(store.currentPageIndex).toBe(1)
      
      store.goToPage(2)
      expect(store.currentPageIndex).toBe(2)
    })

    it('should clamp page index to valid range', () => {
      const store = useDocumentStore()
      store.document = createTestDocument([createTestPage(), createTestPage()])
      
      store.goToPage(-1)
      expect(store.currentPageIndex).toBe(0)
      
      store.goToPage(100)
      expect(store.currentPageIndex).toBe(1)
    })

    it('should navigate to next/previous page', () => {
      const store = useDocumentStore()
      store.document = createTestDocument([
        createTestPage(),
        createTestPage(),
        createTestPage()
      ])
      
      store.nextPage()
      expect(store.currentPageIndex).toBe(1)
      
      store.nextPage()
      expect(store.currentPageIndex).toBe(2)
      
      store.nextPage() // Should stay at last page
      expect(store.currentPageIndex).toBe(2)
      
      store.previousPage()
      expect(store.currentPageIndex).toBe(1)
      
      store.goToPage(0)
      store.previousPage() // Should stay at first page
      expect(store.currentPageIndex).toBe(0)
    })

    it('should return correct total pages', () => {
      const store = useDocumentStore()
      expect(store.totalPages).toBe(0)
      
      store.document = createTestDocument([createTestPage(), createTestPage()])
      expect(store.totalPages).toBe(2)
    })
  })

  describe('Layer Selection', () => {
    it('should select single layer', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.selectLayer('layer-1', false)
      
      expect(store.selectedLayerIds).toEqual(['layer-1'])
      expect(store.selectedLayers).toHaveLength(1)
      expect(store.selectedLayers[0].id).toBe('layer-1')
    })

    it('should add to selection with addToSelection=true', () => {
      const store = useDocumentStore()
      const layer1 = createTestLayer({ id: 'layer-1' })
      const layer2 = createTestLayer({ id: 'layer-2' })
      store.document = createTestDocument([createTestPage([layer1, layer2])])
      
      store.selectLayer('layer-1', false)
      store.selectLayer('layer-2', true)
      
      expect(store.selectedLayerIds).toContain('layer-1')
      expect(store.selectedLayerIds).toContain('layer-2')
    })

    it('should replace selection with addToSelection=false', () => {
      const store = useDocumentStore()
      const layer1 = createTestLayer({ id: 'layer-1' })
      const layer2 = createTestLayer({ id: 'layer-2' })
      store.document = createTestDocument([createTestPage([layer1, layer2])])
      
      store.selectLayer('layer-1', false)
      store.selectLayer('layer-2', false)
      
      expect(store.selectedLayerIds).toEqual(['layer-2'])
    })

    it('should deselect layer', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.selectLayer('layer-1', false)
      store.deselectLayer('layer-1')
      
      expect(store.selectedLayerIds).toEqual([])
    })

    it('should clear all selections', () => {
      const store = useDocumentStore()
      const layer1 = createTestLayer({ id: 'layer-1' })
      const layer2 = createTestLayer({ id: 'layer-2' })
      store.document = createTestDocument([createTestPage([layer1, layer2])])
      
      store.selectLayer('layer-1', false)
      store.selectLayer('layer-2', true)
      store.clearSelection()
      
      expect(store.selectedLayerIds).toEqual([])
    })
  })

  describe('Layer Updates', () => {
    it('should update layer properties', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1', content: 'Original' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.updateLayer(0, 'layer-1', { content: 'Updated' })
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === 'layer-1')
      expect(updatedLayer?.content).toBe('Updated')
    })

    it('should not update locked layer (except lock property)', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1', locked: true, content: 'Original' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.updateLayer(0, 'layer-1', { content: 'Updated' })
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === 'layer-1')
      expect(updatedLayer?.content).toBe('Original')
    })

    it('should allow unlocking a locked layer', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1', locked: true })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.updateLayer(0, 'layer-1', { locked: false })
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === 'layer-1')
      expect(updatedLayer?.locked).toBe(false)
    })

    it('should update layer bounds', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.updateLayer(0, 'layer-1', { 
        bounds: { x: 50, y: 50, width: 200, height: 100 } 
      })
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === 'layer-1')
      expect(updatedLayer?.bounds).toEqual({ x: 50, y: 50, width: 200, height: 100 })
    })
  })

  describe('Layer Management', () => {
    it('should add new layer', () => {
      const store = useDocumentStore()
      store.document = createTestDocument([createTestPage()])
      
      const newLayer = createTestLayer({ id: 'new-layer' })
      store.addLayer(0, newLayer)
      
      expect(store.currentPage?.layers).toContainEqual(expect.objectContaining({ id: 'new-layer' }))
    })

    it('should delete layer', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.deleteLayer(0, 'layer-1')
      
      expect(store.currentPage?.layers.find(l => l.id === 'layer-1')).toBeUndefined()
    })

    it('should remove deleted layer from selection', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1' })
      store.document = createTestDocument([createTestPage([layer])])
      store.selectLayer('layer-1', false)
      
      store.deleteLayer(0, 'layer-1')
      
      expect(store.selectedLayerIds).not.toContain('layer-1')
    })

    it('should duplicate layer', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1', content: 'Original' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.duplicateLayer(0, 'layer-1')
      
      expect(store.currentPage?.layers).toHaveLength(2)
      const duplicated = store.currentPage?.layers.find(l => l.id !== 'layer-1')
      expect(duplicated?.content).toBe('Original')
    })
  })

  describe('Layer Ordering', () => {
    it('should move layer up', () => {
      const store = useDocumentStore()
      const layer1 = createTestLayer({ id: 'layer-1', zIndex: 0 })
      const layer2 = createTestLayer({ id: 'layer-2', zIndex: 1 })
      store.document = createTestDocument([createTestPage([layer1, layer2])])
      
      store.moveLayerUp(0, 'layer-1')
      
      const l1 = store.currentPage?.layers.find(l => l.id === 'layer-1')
      const l2 = store.currentPage?.layers.find(l => l.id === 'layer-2')
      expect(l1?.zIndex).toBeGreaterThan(l2?.zIndex ?? 0)
    })

    it('should move layer down', () => {
      const store = useDocumentStore()
      const layer1 = createTestLayer({ id: 'layer-1', zIndex: 0 })
      const layer2 = createTestLayer({ id: 'layer-2', zIndex: 1 })
      store.document = createTestDocument([createTestPage([layer1, layer2])])
      
      store.moveLayerDown(0, 'layer-2')
      
      const l1 = store.currentPage?.layers.find(l => l.id === 'layer-1')
      const l2 = store.currentPage?.layers.find(l => l.id === 'layer-2')
      expect(l2?.zIndex).toBeLessThan(l1?.zIndex ?? 0)
    })
  })

  describe('Undo/Redo', () => {
    it('should undo layer update', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1', content: 'Original' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.updateLayer(0, 'layer-1', { content: 'Updated' })
      expect(store.canUndo).toBe(true)
      
      store.undo()
      
      const restoredLayer = store.currentPage?.layers.find(l => l.id === 'layer-1')
      expect(restoredLayer?.content).toBe('Original')
    })

    it('should redo undone action', () => {
      const store = useDocumentStore()
      const layer = createTestLayer({ id: 'layer-1', content: 'Original' })
      store.document = createTestDocument([createTestPage([layer])])
      
      store.updateLayer(0, 'layer-1', { content: 'Updated' })
      store.undo()
      expect(store.canRedo).toBe(true)
      
      store.redo()
      
      const restoredLayer = store.currentPage?.layers.find(l => l.id === 'layer-1')
      expect(restoredLayer?.content).toBe('Updated')
    })
  })

  describe('PDF Analysis', () => {
    it('should store PDF analysis', () => {
      const store = useDocumentStore()
      const analysis = {
        contentType: 'text-based' as const,
        totalPages: 5,
        totalTextObjects: 100,
        totalImageObjects: 10,
        totalPathObjects: 20,
        totalCharCount: 5000,
        avgImageCoverage: 0.1,
        avgTextCoverage: 0.8,
        pageStats: [],
        confidence: 0.95,
        recommendation: 'none' as const
      }
      
      store.pdfAnalysis = analysis
      
      expect(store.getAnalysis()).toEqual(analysis)
    })

    it('should show analysis bar when recommendation is not none', () => {
      const store = useDocumentStore()
      store.pdfAnalysis = {
        contentType: 'image-only',
        totalPages: 1,
        totalTextObjects: 0,
        totalImageObjects: 1,
        totalPathObjects: 0,
        totalCharCount: 0,
        avgImageCoverage: 0.9,
        avgTextCoverage: 0,
        pageStats: [],
        confidence: 0.9,
        recommendation: 'ocr-required'
      }
      
      expect(store.showAnalysisBar).toBe(true)
    })

    it('should hide analysis bar after dismissal', () => {
      const store = useDocumentStore()
      store.pdfAnalysis = {
        contentType: 'image-only',
        totalPages: 1,
        totalTextObjects: 0,
        totalImageObjects: 1,
        totalPathObjects: 0,
        totalCharCount: 0,
        avgImageCoverage: 0.9,
        avgTextCoverage: 0,
        pageStats: [],
        confidence: 0.9,
        recommendation: 'ocr-required'
      }
      
      store.dismissAnalysis()
      
      expect(store.showAnalysisBar).toBe(false)
    })
  })
})
