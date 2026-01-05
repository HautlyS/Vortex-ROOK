/**
 * CanvasManager Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Fabric.js
const mockCanvas = {
  on: vi.fn(),
  off: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  getObjects: vi.fn().mockReturnValue([]),
  setActiveObject: vi.fn(),
  discardActiveObject: vi.fn(),
  getActiveObject: vi.fn(),
  getActiveObjects: vi.fn().mockReturnValue([]),
  setZoom: vi.fn(),
  zoomToPoint: vi.fn(),
  setViewportTransform: vi.fn(),
  getCenter: vi.fn().mockReturnValue({ left: 400, top: 300 }),
  requestRenderAll: vi.fn(),
  renderAll: vi.fn(),
  setDimensions: vi.fn(),
  dispose: vi.fn(),
  getElement: vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }),
  viewportTransform: [1, 0, 0, 1, 0, 0],
  width: 800,
  height: 600
}

vi.mock('fabric', () => ({
  Canvas: vi.fn(() => mockCanvas),
  FabricObject: vi.fn(),
  FabricText: vi.fn((text, opts) => ({
    type: 'text',
    text,
    ...opts,
    set: vi.fn(),
    setCoords: vi.fn()
  })),
  FabricImage: {
    fromURL: vi.fn().mockResolvedValue({
      type: 'image',
      width: 100,
      height: 100,
      set: vi.fn(),
      setCoords: vi.fn()
    })
  },
  Rect: vi.fn((opts) => ({
    type: 'rect',
    ...opts,
    set: vi.fn(),
    setCoords: vi.fn()
  })),
  Circle: vi.fn((opts) => ({
    type: 'circle',
    ...opts,
    set: vi.fn(),
    setCoords: vi.fn()
  })),
  Point: vi.fn((x, y) => ({ x, y })),
  Group: vi.fn(),
  filters: {
    Brightness: vi.fn(),
    Contrast: vi.fn(),
    Saturation: vi.fn()
  }
}))

describe('CanvasManager', () => {
  let canvasManager: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const { CanvasManager } = await import('@/canvas/CanvasManager')
    canvasManager = new CanvasManager()
  })

  afterEach(() => {
    canvasManager?.dispose()
  })

  describe('Initialization', () => {
    it('should initialize canvas with options', () => {
      const element = document.createElement('canvas')
      element.parentElement // Mock parent
      
      canvasManager.initialize(element, {
        width: 800,
        height: 600,
        backgroundColor: '#ffffff'
      })
      
      expect(canvasManager.getCanvas()).toBeDefined()
    })

    it('should set up event handlers', () => {
      const element = document.createElement('canvas')
      
      canvasManager.initialize(element, {
        width: 800,
        height: 600,
        backgroundColor: '#ffffff'
      })
      
      expect(mockCanvas.on).toHaveBeenCalled()
    })

    it('should dispose previous canvas on re-initialize', () => {
      const element = document.createElement('canvas')
      
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
      
      expect(mockCanvas.dispose).toHaveBeenCalled()
    })
  })

  describe('Zoom', () => {
    beforeEach(() => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
    })

    it('should set zoom level', () => {
      canvasManager.setZoom(2)
      
      expect(canvasManager.getZoom()).toBe(2)
      expect(mockCanvas.setZoom).toHaveBeenCalledWith(2)
    })

    it('should clamp zoom to min/max', () => {
      canvasManager.setZoom(0.01) // Below min
      expect(canvasManager.getZoom()).toBeGreaterThanOrEqual(0.1)
      
      canvasManager.setZoom(100) // Above max
      expect(canvasManager.getZoom()).toBeLessThanOrEqual(5)
    })

    it('should zoom at point', () => {
      canvasManager.zoomAt(2, 100, 100)
      
      expect(mockCanvas.zoomToPoint).toHaveBeenCalled()
    })

    it('should zoom to fit page', () => {
      canvasManager.zoomToFit(612, 792)
      
      expect(mockCanvas.setZoom).toHaveBeenCalled()
    })

    it('should reset view', () => {
      canvasManager.setZoom(2)
      canvasManager.resetView()
      
      expect(canvasManager.getZoom()).toBe(1)
      expect(mockCanvas.setViewportTransform).toHaveBeenCalled()
    })
  })

  describe('Selection', () => {
    beforeEach(() => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
    })

    it('should deselect all', () => {
      canvasManager.deselectAll()
      
      expect(mockCanvas.discardActiveObject).toHaveBeenCalled()
    })

    it('should set selection callback', () => {
      const callback = vi.fn()
      canvasManager.setSelectionCallback(callback)
      
      // Callback should be stored
      expect(() => canvasManager.setSelectionCallback(callback)).not.toThrow()
    })

    it('should set modified callback', () => {
      const callback = vi.fn()
      canvasManager.setModifiedCallback(callback)
      
      expect(() => canvasManager.setModifiedCallback(callback)).not.toThrow()
    })
  })

  describe('Resize', () => {
    beforeEach(() => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
    })

    it('should resize canvas', () => {
      canvasManager.resize(1024, 768)
      
      expect(mockCanvas.setDimensions).toHaveBeenCalledWith({ width: 1024, height: 768 })
    })
  })

  describe('Dispose', () => {
    it('should clean up resources on dispose', () => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
      
      canvasManager.dispose()
      
      expect(mockCanvas.dispose).toHaveBeenCalled()
      expect(canvasManager.getCanvas()).toBeNull()
    })

    it('should handle multiple dispose calls', () => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
      
      canvasManager.dispose()
      expect(() => canvasManager.dispose()).not.toThrow()
    })
  })

  describe('Page Rendering', () => {
    beforeEach(() => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
    })

    it('should render page with layers', () => {
      const page = {
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          {
            id: 'text-1',
            type: 'text',
            bounds: { x: 100, y: 100, width: 200, height: 50 },
            content: 'Hello',
            visible: true,
            locked: false,
            zIndex: 1,
            opacity: 1
          }
        ]
      }
      
      canvasManager.renderPage(page)
      
      expect(mockCanvas.clear).toHaveBeenCalled()
      expect(mockCanvas.add).toHaveBeenCalled()
    })

    it('should clear canvas', () => {
      canvasManager.clearCanvas()
      
      expect(mockCanvas.clear).toHaveBeenCalled()
    })
  })

  describe('Layer Updates', () => {
    beforeEach(() => {
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
    })

    it('should update layer properties', () => {
      // First render a page to add layers
      const page = {
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          {
            id: 'text-1',
            type: 'text',
            bounds: { x: 100, y: 100, width: 200, height: 50 },
            content: 'Hello',
            visible: true,
            locked: false,
            zIndex: 1,
            opacity: 1
          }
        ]
      }
      canvasManager.renderPage(page)
      
      // Update should not throw
      expect(() => canvasManager.updateLayer('text-1', { opacity: 0.5 })).not.toThrow()
    })
  })

  describe('Ready State', () => {
    it('should report ready state correctly', () => {
      expect(canvasManager.isReady()).toBe(false)
      
      const element = document.createElement('canvas')
      canvasManager.initialize(element, { width: 800, height: 600, backgroundColor: '#fff' })
      
      expect(canvasManager.isReady()).toBe(true)
      
      canvasManager.dispose()
      expect(canvasManager.isReady()).toBe(false)
    })
  })
})
