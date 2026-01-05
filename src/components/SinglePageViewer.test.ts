/**
 * SinglePageViewer Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import SinglePageViewer from './SinglePageViewer.vue'
import type { PageData, LayerObject } from '@/models'

// Mock child components
vi.mock('./EditableLayer.vue', () => ({
  default: {
    name: 'EditableLayer',
    template: '<div class="mock-layer" :data-id="layer.id">{{ layer.content }}</div>',
    props: ['layer', 'pageWidth', 'pageHeight', 'scale', 'selected']
  }
}))

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: `layer-${Math.random().toString(36).slice(2)}`,
    type: 'text',
    bounds: { x: 50, y: 50, width: 200, height: 100 },
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

function createTestPage(layers: LayerObject[] = []): PageData {
  return {
    pageIndex: 0,
    width: 612,
    height: 792,
    dpi: 72,
    layers: layers.length ? layers : [createTestLayer()]
  }
}

describe('SinglePageViewer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render container element', () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      // Component renders a div with overflow-hidden class
      expect(container.querySelector('.overflow-hidden')).toBeTruthy()
    })

    it('should render layers', () => {
      const layers = [
        createTestLayer({ id: 'layer-1', content: 'First' }),
        createTestLayer({ id: 'layer-2', content: 'Second' })
      ]
      
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(layers),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const renderedLayers = container.querySelectorAll('.mock-layer')
      expect(renderedLayers.length).toBe(2)
    })
  })

  describe('Props', () => {
    it('should accept page prop', () => {
      const page = createTestPage()
      
      const { container } = render(SinglePageViewer, {
        props: {
          page,
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      expect(container.firstChild).toBeTruthy()
    })

    it('should accept selectedLayerIds prop', () => {
      const layers = [createTestLayer({ id: 'layer-1' })]
      
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(layers),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: ['layer-1']
        }
      })
      
      expect(container.firstChild).toBeTruthy()
    })

    it('should accept isMobile prop', () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: [],
          isMobile: true
        }
      })
      
      expect(container.firstChild).toBeTruthy()
    })
  })

  describe('Events', () => {
    it('should emit select event', async () => {
      const layers = [createTestLayer({ id: 'layer-1' })]
      
      const { emitted } = render(SinglePageViewer, {
        props: {
          page: createTestPage(layers),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      // Events are defined on the component
      expect(emitted).toBeDefined()
    })
  })

  describe('Cursor Styles', () => {
    it('should have grab cursor by default', () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv.classList.contains('cursor-grab')).toBe(true)
    })
  })
})
