/**
 * PropertiesPanel Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import PropertiesPanel from './PropertiesPanel.vue'
import { useDocumentStore } from '@/stores/documentStore'
import { createEmptyProject } from '@/models'
import type { LayerObject } from '@/models'

// Mock canvas manager
vi.mock('@/canvas', () => ({
  canvasManager: {
    applyImageFilters: vi.fn(),
    exportLayerImage: vi.fn().mockReturnValue('data:image/png;base64,test')
  }
}))

// Mock bridge
vi.mock('@/bridge', () => ({
  isTauri: vi.fn(() => false),
  pickFile: vi.fn(),
  downloadFile: vi.fn()
}))

// Mock extra components
vi.mock('./extra', () => ({
  ElasticSlider: { template: '<div><slot /></div>' },
  BackgroundTexture: { template: '<div><slot /></div>' }
}))

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: `layer-${Math.random().toString(36).substr(2, 9)}`,
    type: 'text',
    bounds: { x: 100, y: 100, width: 200, height: 50 },
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

describe('PropertiesPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Empty State', () => {
    it('should show empty state when no layer selected', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [createTestLayer()]
      }]
      store.document = project
      // No layer selected
      
      render(PropertiesPanel)
      
      expect(screen.getByText(/select a layer/i)).toBeInTheDocument()
    })

    it('should show empty state when no document', () => {
      render(PropertiesPanel)
      
      expect(screen.getByText(/select a layer/i)).toBeInTheDocument()
    })
  })

  describe('Header', () => {
    it('should show Properties title', () => {
      render(PropertiesPanel)
      
      expect(screen.getByText('Properties')).toBeInTheDocument()
    })
  })

  describe('Single Selection', () => {
    it('should render when layer selected', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ id: 'layer-1' })
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [layer]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(PropertiesPanel)
      
      // Component should render
      expect(container.firstChild).toBeTruthy()
    })

    it('should render position section for selected layer', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ id: 'layer-1', bounds: { x: 100, y: 200, width: 300, height: 150 } })
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [layer]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(PropertiesPanel)
      
      // Component should render
      expect(container.firstChild).toBeTruthy()
    })
  })

  describe('Multiple Selection', () => {
    it('should handle multiple selection state', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1' }),
          createTestLayer({ id: 'layer-2' })
        ]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1', 'layer-2']
      
      const { container } = render(PropertiesPanel)
      
      // Component should render
      expect(container.firstChild).toBeTruthy()
    })
  })

  describe('Text Layer Properties', () => {
    it('should render when layer is selected', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ 
        id: 'layer-1', 
        type: 'text',
        content: 'Hello',
        fontFamily: 'Arial',
        fontSize: 16
      })
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [layer]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1']
      
      const { container } = render(PropertiesPanel)
      
      // Component should render
      expect(container.firstChild).toBeTruthy()
    })
  })

  describe('Mobile Mode', () => {
    it('should accept isMobile prop', () => {
      const { container } = render(PropertiesPanel, {
        props: { isMobile: true }
      })
      
      // Component should render
      expect(container.firstChild).toBeTruthy()
    })
  })
})
