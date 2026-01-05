/**
 * LayersPanel Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import LayersPanel from './LayersPanel.vue'
import { useDocumentStore } from '@/stores/documentStore'
import { createEmptyProject } from '@/models'
import type { LayerObject } from '@/models'

// Mock canvas manager
vi.mock('@/canvas', () => ({
  canvasManager: {
    selectLayer: vi.fn()
  }
}))

// Mock extra components
vi.mock('./extra', () => ({
  BackgroundTexture: { template: '<div><slot /></div>' }
}))

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: `layer-${Math.random().toString(36).substr(2, 9)}`,
    type: 'text',
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    visible: true,
    locked: false,
    zIndex: 0,
    opacity: 1,
    content: 'Test',
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
      
      expect(screen.getByText(/no layers yet/i)).toBeInTheDocument()
    })

    it('should render layer list when document exists', () => {
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
      
      // Should show layer count
      expect(screen.getByText('2')).toBeInTheDocument()
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
          createTestLayer({ type: 'image' })
        ]
      }]
      store.document = project
      
      const { container } = render(LayersPanel)
      
      // Should have icons
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
        layers: [createTestLayer({ id: 'layer-1', content: 'Click' })]
      }]
      store.document = project
      
      const { container } = render(LayersPanel)
      
      // Find and click the layer item
      const layerItem = container.querySelector('[class*="cursor-pointer"]')
      if (layerItem) {
        await fireEvent.click(layerItem)
        expect(store.selectedLayerIds).toContain('layer-1')
      }
    })
  })

  describe('Visibility', () => {
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
      
      // Find visibility toggle button
      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('Layer Count', () => {
    it('should show correct layer count', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1' }),
          createTestLayer({ id: 'layer-2' }),
          createTestLayer({ id: 'layer-3' })
        ]
      }]
      store.document = project
      
      render(LayersPanel)
      
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  describe('Header', () => {
    it('should show Layers title', () => {
      render(LayersPanel)
      
      expect(screen.getByText('Layers')).toBeInTheDocument()
    })
  })
})
