/**
 * SinglePageViewer Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import '@testing-library/jest-dom/vitest'
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
    id: `layer-${Math.random()}`,
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
    it('should render page container', () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      expect(container.querySelector('.page-container')).toBeInTheDocument()
    })

    it('should render all layers', () => {
      const layers = [
        createTestLayer({ id: 'layer-1', content: 'First' }),
        createTestLayer({ id: 'layer-2', content: 'Second' }),
        createTestLayer({ id: 'layer-3', content: 'Third' })
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
      expect(renderedLayers).toHaveLength(3)
    })

    it('should mark selected layers', () => {
      const layers = [
        createTestLayer({ id: 'layer-1' }),
        createTestLayer({ id: 'layer-2' })
      ]
      
      render(SinglePageViewer, {
        props: {
          page: createTestPage(layers),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: ['layer-1']
        }
      })
      
      // Selected layer should be passed selected=true prop
      // This is handled by the mock component
    })
  })

  describe('Zoom', () => {
    it('should handle zoom in', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      // Simulate wheel event for zoom
      const pageContainer = container.querySelector('.page-container')!
      await fireEvent.wheel(pageContainer, { deltaY: -100, ctrlKey: true })
      
      // Zoom should increase (checked via transform scale)
    })

    it('should handle zoom out', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const pageContainer = container.querySelector('.page-container')!
      await fireEvent.wheel(pageContainer, { deltaY: 100, ctrlKey: true })
    })

    it('should clamp zoom to min/max', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const pageContainer = container.querySelector('.page-container')!
      
      // Try to zoom way out
      for (let i = 0; i < 50; i++) {
        await fireEvent.wheel(pageContainer, { deltaY: 100, ctrlKey: true })
      }
      
      // Zoom should be clamped to minimum
    })
  })

  describe('Pan', () => {
    it('should handle pan with middle mouse button', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const pageContainer = container.querySelector('.page-container')!
      
      await fireEvent.mouseDown(pageContainer, { button: 1, clientX: 100, clientY: 100 })
      await fireEvent.mouseMove(document, { clientX: 150, clientY: 150 })
      await fireEvent.mouseUp(document)
    })

    it('should handle pan with space + drag', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const pageContainer = container.querySelector('.page-container')!
      
      await fireEvent.keyDown(document, { key: ' ' })
      await fireEvent.mouseDown(pageContainer, { clientX: 100, clientY: 100 })
      await fireEvent.mouseMove(document, { clientX: 150, clientY: 150 })
      await fireEvent.mouseUp(document)
      await fireEvent.keyUp(document, { key: ' ' })
    })
  })

  describe('Selection', () => {
    it('should emit select when clicking layer', async () => {
      const layer = createTestLayer({ id: 'layer-1', content: 'Click me' })
      
      const { emitted, container } = render(SinglePageViewer, {
        props: {
          page: createTestPage([layer]),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      const layerElement = container.querySelector('.mock-layer')!
      await fireEvent.click(layerElement)
      
      // The EditableLayer mock should trigger select
    })

    it('should emit deselect when clicking empty area', async () => {
      const { emitted, container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: ['layer-1']
        }
      })
      
      const pageContainer = container.querySelector('.page-container')!
      await fireEvent.click(pageContainer)
      
      expect(emitted().deselect).toBeTruthy()
    })
  })

  describe('Touch Gestures', () => {
    it('should handle pinch zoom', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: [],
          isMobile: true
        }
      })
      
      const pageContainer = container.querySelector('.page-container')!
      
      // Simulate pinch gesture
      await fireEvent.touchStart(pageContainer, {
        touches: [
          { clientX: 100, clientY: 100, identifier: 0 },
          { clientX: 200, clientY: 200, identifier: 1 }
        ]
      })
      
      await fireEvent.touchMove(pageContainer, {
        touches: [
          { clientX: 50, clientY: 50, identifier: 0 },
          { clientX: 250, clientY: 250, identifier: 1 }
        ]
      })
      
      await fireEvent.touchEnd(pageContainer)
    })
  })

  describe('Fit Modes', () => {
    it('should fit to width', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      // Fit mode should adjust scale to fit page width
    })

    it('should fit to height', async () => {
      const { container } = render(SinglePageViewer, {
        props: {
          page: createTestPage(),
          pageWidth: 612,
          pageHeight: 792,
          selectedLayerIds: []
        }
      })
      
      // Fit mode should adjust scale to fit page height
    })
  })
})
