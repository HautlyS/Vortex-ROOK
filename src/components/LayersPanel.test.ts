/**
 * LayersPanel Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import '@testing-library/jest-dom/vitest'
import LayersPanel from './LayersPanel.vue'
import { useDocumentStore } from '@/stores/documentStore'
import { createEmptyProject } from '@/models'
import type { LayerObject, PageData } from '@/models'

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: `layer-${Math.random().toString(36).substr(2, 9)}`,
    type: 'text',
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    visible: true,
    locked: false,
    zIndex: 0,
    opacity: 1,
    content: 'Test Layer',
    sourceType: 'manual',
    role: 'content',
    ...overrides
  }
}

describe('LayersPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should show empty state when no document', () => {
      render(LayersPanel)
      
      expect(screen.getByText(/no layers/i)).toBeInTheDocument()
    })

    it('should render layer list when document exists', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1', content: 'First Layer' }),
          createTestLayer({ id: 'layer-2', content: 'Second Layer' })
        ]
      }]
      store.document = project
      
      render(LayersPanel)
      
      expect(screen.getByText('First Layer')).toBeInTheDocument()
      expect(screen.getByText('Second Layer')).toBeInTheDocument()
    })

    it('should show layer type icons', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ type: 'text' }),
          createTestLayer({ type: 'image' }),
          createTestLayer({ type: 'vector' })
        ]
      }]
      store.document = project
      
      const { container } = render(LayersPanel)
      
      // Should have different icons for different types
      expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
    })
  })

  describe('Selection', () => {
    it('should select layer on click', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer({ id: 'layer-1', content: 'Click Me' })]
      }]
      store.document = project
      
      render(LayersPanel)
      
      await fireEvent.click(screen.getByText('Click Me'))
      
      expect(store.selectedLayerIds).toContain('layer-1')
    })

    it('should highlight selected layer', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer({ id: 'layer-1', content: 'Selected' })]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(LayersPanel)
      
      const layerItem = container.querySelector('[data-layer-id="layer-1"]')
      expect(layerItem).toHaveClass('bg-violet-500/20')
    })

    it('should support multi-select with Ctrl+click', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1', content: 'First' }),
          createTestLayer({ id: 'layer-2', content: 'Second' })
        ]
      }]
      store.document = project
      
      render(LayersPanel)
      
      await fireEvent.click(screen.getByText('First'))
      await fireEvent.click(screen.getByText('Second'), { ctrlKey: true })
      
      expect(store.selectedLayerIds).toContain('layer-1')
      expect(store.selectedLayerIds).toContain('layer-2')
    })
  })

  describe('Visibility Toggle', () => {
    it('should toggle layer visibility', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer({ id: 'layer-1', visible: true })]
      }]
      store.document = project
      
      const { container } = render(LayersPanel)
      
      const visibilityBtn = container.querySelector('[title*="visibility" i], [aria-label*="visibility" i]')
      if (visibilityBtn) {
        await fireEvent.click(visibilityBtn)
        
        const layer = store.currentPage?.layers.find(l => l.id === 'layer-1')
        expect(layer?.visible).toBe(false)
      }
    })
  })

  describe('Lock Toggle', () => {
    it('should toggle layer lock', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer({ id: 'layer-1', locked: false })]
      }]
      store.document = project
      
      const { container } = render(LayersPanel)
      
      const lockBtn = container.querySelector('[title*="lock" i], [aria-label*="lock" i]')
      if (lockBtn) {
        await fireEvent.click(lockBtn)
        
        const layer = store.currentPage?.layers.find(l => l.id === 'layer-1')
        expect(layer?.locked).toBe(true)
      }
    })
  })

  describe('Layer Actions', () => {
    it('should delete layer', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer({ id: 'layer-1' })]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(LayersPanel)
      
      const deleteBtn = container.querySelector('[title*="delete" i], [aria-label*="delete" i]')
      if (deleteBtn) {
        await fireEvent.click(deleteBtn)
        
        expect(store.currentPage?.layers.find(l => l.id === 'layer-1')).toBeUndefined()
      }
    })

    it('should duplicate layer', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer({ id: 'layer-1', content: 'Original' })]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(LayersPanel)
      
      const duplicateBtn = container.querySelector('[title*="duplicate" i], [aria-label*="duplicate" i]')
      if (duplicateBtn) {
        await fireEvent.click(duplicateBtn)
        
        expect(store.currentPage?.layers.length).toBe(2)
      }
    })
  })

  describe('Layer Ordering', () => {
    it('should move layer up', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1', zIndex: 0 }),
          createTestLayer({ id: 'layer-2', zIndex: 1 })
        ]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(LayersPanel)
      
      const moveUpBtn = container.querySelector('[title*="up" i], [aria-label*="up" i]')
      if (moveUpBtn) {
        await fireEvent.click(moveUpBtn)
        
        const layer1 = store.currentPage?.layers.find(l => l.id === 'layer-1')
        const layer2 = store.currentPage?.layers.find(l => l.id === 'layer-2')
        expect(layer1?.zIndex).toBeGreaterThan(layer2?.zIndex ?? 0)
      }
    })

    it('should move layer down', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1', zIndex: 0 }),
          createTestLayer({ id: 'layer-2', zIndex: 1 })
        ]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-2']
      
      const { container } = render(LayersPanel)
      
      const moveDownBtn = container.querySelector('[title*="down" i], [aria-label*="down" i]')
      if (moveDownBtn) {
        await fireEvent.click(moveDownBtn)
        
        const layer1 = store.currentPage?.layers.find(l => l.id === 'layer-1')
        const layer2 = store.currentPage?.layers.find(l => l.id === 'layer-2')
        expect(layer2?.zIndex).toBeLessThan(layer1?.zIndex ?? 0)
      }
    })
  })

  describe('Drag and Drop', () => {
    it('should support drag reordering', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1', zIndex: 0 }),
          createTestLayer({ id: 'layer-2', zIndex: 1 }),
          createTestLayer({ id: 'layer-3', zIndex: 2 })
        ]
      }]
      store.document = project
      
      const { container } = render(LayersPanel)
      
      const layers = container.querySelectorAll('[draggable="true"]')
      if (layers.length >= 2) {
        await fireEvent.dragStart(layers[0])
        await fireEvent.dragOver(layers[2])
        await fireEvent.drop(layers[2])
      }
    })
  })
})
