/**
 * CanvasManager - Fabric.js 6+ Canvas Integration
 */

import {
  Canvas,
  FabricObject,
  FabricText,
  FabricImage,
  Rect,
  Circle,
  Point,
  Group,
  filters
} from 'fabric'
import type { LayerObject, PageData, Bounds, BlendMode, WatermarkPosition } from '@/models'

export interface CanvasOptions {
  width: number
  height: number
  backgroundColor: string
}

export interface ImageFilters {
  brightness: number // -1 to 1
  contrast: number // -1 to 1
  saturation: number // -1 to 1
}

/** Map BlendMode to canvas globalCompositeOperation */
const BLEND_MODE_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  dissolve: 'source-over' // Dissolve simulated via opacity
}

type SelectionCallback = (layerIds: string[]) => void
type ModifiedCallback = (layerId: string, bounds: Bounds) => void

export class CanvasManager {
  private canvas: Canvas | null = null
  private layerMap = new Map<string, FabricObject>()
  private objectToLayerId = new WeakMap<FabricObject, string>()
  private layerFilters = new Map<string, ImageFilters>()
  private zoom = 1
  private onSelectionChange: SelectionCallback | null = null
  private onLayerModified: ModifiedCallback | null = null
  private resizeObserver: ResizeObserver | null = null
  private containerElement: HTMLElement | null = null
  private isDisposed = false
  
  // Gesture handling
  private isPanning = false
  private lastPanPoint = { x: 0, y: 0 }
  private rotation = 0
  private minZoom = 0.1
  private maxZoom = 5

  initialize(element: HTMLCanvasElement, options: CanvasOptions): void {
    // Clean up any existing canvas
    this.dispose()
    this.isDisposed = false

    this.canvas = new Canvas(element, {
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor || '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      allowTouchScrolling: false
    })

    // Store container for resize observer
    this.containerElement = element.parentElement

    this.setupEvents()
    this.setupGestureHandling()
    this.setupResizeObserver()
  }

  private setupEvents(): void {
    if (!this.canvas) return

    this.canvas.on('selection:created', (e) => {
      if (this.isDisposed) return
      const ids = e.selected
        ?.map((obj) => this.objectToLayerId.get(obj))
        .filter(Boolean) as string[]
      this.onSelectionChange?.(ids)
    })

    this.canvas.on('selection:updated', (e) => {
      if (this.isDisposed) return
      const ids = e.selected
        ?.map((obj) => this.objectToLayerId.get(obj))
        .filter(Boolean) as string[]
      this.onSelectionChange?.(ids)
    })

    this.canvas.on('selection:cleared', () => {
      if (this.isDisposed) return
      this.onSelectionChange?.([])
    })

    this.canvas.on('object:modified', (e) => {
      if (this.isDisposed) return
      const obj = e.target
      if (!obj) return
      const layerId = this.objectToLayerId.get(obj)
      if (layerId) {
        const bounds = this.getFabricObjectBounds(obj)
        this.onLayerModified?.(layerId, bounds)
      }
    })
  }

  private setupResizeObserver(): void {
    if (!this.containerElement) return

    // Clean up existing observer
    this.resizeObserver?.disconnect()

    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.isDisposed || !this.canvas) return

      for (const entry of entries) {
        const { width, height } = entry.contentRect
        // Add padding
        const canvasWidth = Math.max(100, width - 32)
        const canvasHeight = Math.max(100, height - 32)

        this.canvas.setDimensions({
          width: canvasWidth,
          height: canvasHeight
        })
        this.canvas.requestRenderAll()
      }
    })

    this.resizeObserver.observe(this.containerElement)
  }

  private setupGestureHandling(): void {
    if (!this.canvas || !this.containerElement) return

    const canvasElement = this.canvas.getElement()

    // Wheel event for zoom and pan
    canvasElement.addEventListener('wheel', this.handleWheel.bind(this), { passive: false })
    
    // Mouse events for panning
    canvasElement.addEventListener('mousedown', this.handleMouseDown.bind(this))
    canvasElement.addEventListener('mousemove', this.handleMouseMove.bind(this))
    canvasElement.addEventListener('mouseup', this.handleMouseUp.bind(this))
    canvasElement.addEventListener('mouseleave', this.handleMouseUp.bind(this))

    // Touch events for mobile gestures
    canvasElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false })
    canvasElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false })
    canvasElement.addEventListener('touchend', this.handleTouchEnd.bind(this))
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault()
    if (!this.canvas) return

    const pointer = this.canvas.getPointer(e)
    const delta = e.deltaY

    // Check for modifier keys
    if (e.ctrlKey || e.metaKey) {
      // Zoom at cursor position
      this.zoomAtPoint(pointer, delta > 0 ? 0.9 : 1.1)
    } else if (e.shiftKey) {
      // Rotate view
      this.rotateView(delta > 0 ? -5 : 5)
    } else {
      // Pan
      const panSpeed = 2
      this.panView(-e.deltaX * panSpeed, -delta * panSpeed)
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.canvas) return
    
    // Middle mouse button or space+left click for panning
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault()
      this.isPanning = true
      this.lastPanPoint = { x: e.clientX, y: e.clientY }
      this.canvas.getElement().style.cursor = 'grabbing'
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.canvas || !this.isPanning) return

    const deltaX = e.clientX - this.lastPanPoint.x
    const deltaY = e.clientY - this.lastPanPoint.y
    
    this.panView(deltaX, deltaY)
    
    this.lastPanPoint = { x: e.clientX, y: e.clientY }
  }

  private handleMouseUp(): void {
    if (!this.canvas) return
    
    this.isPanning = false
    this.canvas.getElement().style.cursor = 'default'
  }

  private handleTouchStart(e: TouchEvent): void {
    if (!this.canvas) return
    
    if (e.touches.length === 2) {
      e.preventDefault()
      // Two-finger gesture start
      this.isPanning = true
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.canvas || !this.isPanning) return
    
    if (e.touches.length === 2) {
      e.preventDefault()
      // Handle two-finger pan/zoom
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      
      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      
      // Simple pan based on center movement
      if (this.lastPanPoint.x !== 0) {
        const deltaX = centerX - this.lastPanPoint.x
        const deltaY = centerY - this.lastPanPoint.y
        this.panView(deltaX, deltaY)
      }
      
      this.lastPanPoint = { x: centerX, y: centerY }
    }
  }

  private handleTouchEnd(): void {
    this.isPanning = false
    this.lastPanPoint = { x: 0, y: 0 }
  }

  private zoomAtPoint(point: Point, zoomFactor: number): void {
    if (!this.canvas) return

    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor))
    
    if (newZoom !== this.zoom) {
      this.canvas.zoomToPoint(new Point(point.x, point.y), newZoom)
      this.zoom = newZoom
      this.canvas.requestRenderAll()
    }
  }

  private panView(deltaX: number, deltaY: number): void {
    if (!this.canvas) return

    const vpt = this.canvas.viewportTransform!
    vpt[4] += deltaX
    vpt[5] += deltaY
    
    this.canvas.setViewportTransform(vpt)
    this.canvas.requestRenderAll()
  }

  private rotateView(angleDelta: number): void {
    if (!this.canvas) return

    this.rotation += angleDelta
    
    const center = this.canvas.getCenter()
    const radians = (this.rotation * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    
    this.canvas.setViewportTransform([cos, sin, -sin, cos, center.left, center.top])
    this.canvas.requestRenderAll()
  }

  // Public methods for external control
  setZoom(zoom: number): void {
    if (!this.canvas) return
    
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom))
    this.canvas.setZoom(this.zoom)
    this.canvas.requestRenderAll()
  }

  getZoom(): number {
    return this.zoom
  }

  resetView(): void {
    if (!this.canvas) return
    
    this.zoom = 1
    this.rotation = 0
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    this.canvas.setZoom(1)
    this.canvas.requestRenderAll()
  }

  centerView(): void {
    if (!this.canvas) return
    
    const center = this.canvas.getCenter()
    const vpt = this.canvas.viewportTransform!
    
    vpt[4] = center.left
    vpt[5] = center.top
    
    this.canvas.setViewportTransform(vpt)
    this.canvas.requestRenderAll()
  }

  private getFabricObjectBounds(obj: FabricObject): Bounds {
    return {
      x: obj.left ?? 0,
      y: obj.top ?? 0,
      width: (obj.width ?? 0) * (obj.scaleX ?? 1),
      height: (obj.height ?? 0) * (obj.scaleY ?? 1)
    }
  }

  dispose(): void {
    this.isDisposed = true

    // Clean up resize observer
    this.resizeObserver?.disconnect()
    this.resizeObserver = null

    // Clean up canvas and gesture listeners
    if (this.canvas) {
      const canvasElement = this.canvas.getElement()
      
      // Remove gesture event listeners
      canvasElement.removeEventListener('wheel', this.handleWheel.bind(this))
      canvasElement.removeEventListener('mousedown', this.handleMouseDown.bind(this))
      canvasElement.removeEventListener('mousemove', this.handleMouseMove.bind(this))
      canvasElement.removeEventListener('mouseup', this.handleMouseUp.bind(this))
      canvasElement.removeEventListener('mouseleave', this.handleMouseUp.bind(this))
      canvasElement.removeEventListener('touchstart', this.handleTouchStart.bind(this))
      canvasElement.removeEventListener('touchmove', this.handleTouchMove.bind(this))
      canvasElement.removeEventListener('touchend', this.handleTouchEnd.bind(this))
      
      this.canvas.off() // Remove all event listeners
      this.canvas.dispose()
      this.canvas = null
    }

    // Clear maps
    this.layerMap.clear()
    this.layerFilters.clear()
    this.containerElement = null
  }

  renderPage(page: PageData): void {
    if (!this.canvas || this.isDisposed) return
    this.clearCanvas()

    const sortedLayers = [...page.layers].sort((a, b) => a.zIndex - b.zIndex)
    for (const layer of sortedLayers) {
      if (layer.visible) this.addLayerToCanvas(layer)
    }
    this.canvas.requestRenderAll()
  }

  private addLayerToCanvas(layer: LayerObject): void {
    if (!this.canvas || this.isDisposed) return

    let obj: FabricObject | null = null

    switch (layer.type) {
      case 'text':
        obj = new FabricText(layer.content ?? '', {
          left: layer.bounds.x,
          top: layer.bounds.y,
          fontSize: layer.fontSize ?? 16,
          fontFamily: layer.fontFamily ?? 'Arial',
          fill: layer.color ?? '#000000',
          fontWeight: layer.fontWeight ?? 400,
          textAlign: layer.textAlign ?? 'left',
          selectable: !layer.locked,
          evented: !layer.locked,
          opacity: layer.opacity
        })
        break

      case 'image':
        // Create placeholder rect for images (actual image loading handled separately)
        obj = new Rect({
          left: layer.bounds.x,
          top: layer.bounds.y,
          width: layer.bounds.width,
          height: layer.bounds.height,
          fill: '#e5e7eb',
          stroke: '#9ca3af',
          strokeWidth: 1,
          selectable: !layer.locked,
          evented: !layer.locked,
          opacity: layer.opacity
        })
        // Load actual image if URL exists
        if (layer.imageUrl) {
          this.loadImage(layer)
        }
        break

      case 'shape':
        obj = this.createShape(layer)
        break

      case 'watermark':
        // Watermark handled async with positioning
        this.addWatermarkToCanvas(layer)
        return

      default:
        obj = new Rect({
          left: layer.bounds.x,
          top: layer.bounds.y,
          width: layer.bounds.width,
          height: layer.bounds.height,
          fill: layer.fillColor ?? '#cccccc',
          selectable: !layer.locked,
          evented: !layer.locked,
          opacity: layer.opacity
        })
    }

    if (obj) {
      this.layerMap.set(layer.id, obj)
      this.objectToLayerId.set(obj, layer.id)
      this.canvas.add(obj)
    }
  }

  private createShape(layer: LayerObject): FabricObject {
    const baseProps = {
      left: layer.bounds.x,
      top: layer.bounds.y,
      fill: layer.fillColor ?? 'transparent',
      stroke: layer.strokeColor ?? '#000000',
      strokeWidth: layer.strokeWidth ?? 1,
      selectable: !layer.locked,
      evented: !layer.locked,
      opacity: layer.opacity
    }

    switch (layer.shapeType) {
      case 'circle':
        return new Circle({
          ...baseProps,
          radius: Math.min(layer.bounds.width, layer.bounds.height) / 2
        })
      default:
        return new Rect({
          ...baseProps,
          width: layer.bounds.width,
          height: layer.bounds.height
        })
    }
  }

  private async loadImage(layer: LayerObject): Promise<void> {
    if (!this.canvas || !layer.imageUrl || this.isDisposed) return

    try {
      const img = await FabricImage.fromURL(layer.imageUrl)

      // Check if disposed during async operation
      if (this.isDisposed || !this.canvas) return

      img.set({
        left: layer.bounds.x,
        top: layer.bounds.y,
        scaleX: layer.bounds.width / (img.width ?? 1),
        scaleY: layer.bounds.height / (img.height ?? 1),
        selectable: !layer.locked,
        evented: !layer.locked,
        opacity: layer.opacity
      })

      // Remove placeholder and add image
      const placeholder = this.layerMap.get(layer.id)
      if (placeholder) {
        this.canvas.remove(placeholder)
      }
      this.layerMap.set(layer.id, img)
      this.objectToLayerId.set(img, layer.id)
      this.canvas.add(img)
      this.canvas.requestRenderAll()
    } catch (e) {
      console.error('Failed to load image:', e)
    }
  }

  clearCanvas(): void {
    if (!this.canvas) return
    this.canvas.clear()
    this.layerMap.clear()
    this.layerFilters.clear()
  }

  updateLayer(layerId: string, updates: Partial<LayerObject>): void {
    const obj = this.layerMap.get(layerId)
    if (!obj || !this.canvas || this.isDisposed) return

    if (updates.bounds) {
      obj.set({
        left: updates.bounds.x,
        top: updates.bounds.y,
        scaleX: updates.bounds.width / (obj.width ?? 1),
        scaleY: updates.bounds.height / (obj.height ?? 1)
      })
    }
    if (updates.visible !== undefined) {
      obj.set('visible', updates.visible)
    }
    if (updates.locked !== undefined) {
      obj.set({ selectable: !updates.locked, evented: !updates.locked })
    }
    if (updates.opacity !== undefined) {
      obj.set('opacity', updates.opacity)
    }

    this.canvas.requestRenderAll()
  }

  selectLayer(layerId: string): void {
    const obj = this.layerMap.get(layerId)
    if (obj && this.canvas && !this.isDisposed) {
      this.canvas.setActiveObject(obj)
      this.canvas.requestRenderAll()
    }
  }

  selectLayers(layerIds: string[]): void {
    if (!this.canvas || this.isDisposed) return
    const objects = layerIds.map((id) => this.layerMap.get(id)).filter(Boolean) as FabricObject[]
    if (objects.length > 0) {
      this.canvas.setActiveObject(objects[0])
      this.canvas.requestRenderAll()
    }
  }

  deselectAll(): void {
    if (this.isDisposed) return
    this.canvas?.discardActiveObject()
    this.canvas?.requestRenderAll()
  }

  /** Zoom at specific point (for mouse-position zoom) */
  zoomAt(level: number, x: number, y: number): void {
    if (!this.canvas || this.isDisposed) return
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, level))
    this.canvas.zoomToPoint(new Point(x, y), this.zoom)
    this.canvas.requestRenderAll()
  }

  zoomToFit(pageWidth: number, pageHeight: number): void {
    if (!this.canvas || this.isDisposed) return
    const canvasWidth = this.canvas.width ?? 800
    const canvasHeight = this.canvas.height ?? 600
    const scaleX = canvasWidth / pageWidth
    const scaleY = canvasHeight / pageHeight
    this.setZoom(Math.min(scaleX, scaleY) * 0.9)
  }

  setSelectionCallback(callback: SelectionCallback): void {
    this.onSelectionChange = callback
  }

  setModifiedCallback(callback: ModifiedCallback): void {
    this.onLayerModified = callback
  }

  resize(width: number, height: number): void {
    if (!this.canvas || this.isDisposed) return
    this.canvas.setDimensions({ width, height })
  }

  getCanvas(): Canvas | null {
    return this.canvas
  }

  /**
   * Apply image filters to a layer
   */
  applyImageFilters(layerId: string, imageFilters: ImageFilters): void {
    const obj = this.layerMap.get(layerId)
    if (!obj || !this.canvas || this.isDisposed || !(obj instanceof FabricImage)) return

    // Clear existing filters
    obj.filters = []

    // Apply brightness filter
    if (imageFilters.brightness !== 0) {
      obj.filters.push(new filters.Brightness({ brightness: imageFilters.brightness }))
    }

    // Apply contrast filter
    if (imageFilters.contrast !== 0) {
      obj.filters.push(new filters.Contrast({ contrast: imageFilters.contrast }))
    }

    // Apply saturation filter
    if (imageFilters.saturation !== 0) {
      obj.filters.push(new filters.Saturation({ saturation: imageFilters.saturation }))
    }

    obj.applyFilters()
    this.canvas.requestRenderAll()
  }

  /**
   * Export a layer's image as data URL
   */
  exportLayerImage(layerId: string, format: 'png' | 'jpeg' = 'png'): string | null {
    const obj = this.layerMap.get(layerId)
    if (!obj || this.isDisposed) return null

    const multiplier = 2 // Export at 2x for better quality
    return obj.toDataURL({
      format,
      multiplier,
      quality: 1
    })
  }

  /**
   * Get image object for a layer
   */
  getLayerImage(layerId: string): FabricImage | null {
    const obj = this.layerMap.get(layerId)
    if (obj instanceof FabricImage) return obj
    return null
  }

  /**
   * Check if canvas is initialized and not disposed
   */
  isReady(): boolean {
    return this.canvas !== null && !this.isDisposed
  }

  /** Store page dimensions for watermark positioning */
  private pageWidth = 612
  private pageHeight = 792

  /** Set page dimensions for accurate watermark positioning */
  setPageDimensions(width: number, height: number): void {
    this.pageWidth = width
    this.pageHeight = height
  }

  /**
   * Calculate watermark position based on position type
   */
  private calculateWatermarkPosition(
    position: WatermarkPosition,
    imgWidth: number,
    imgHeight: number,
    rotation: number = 0
  ): { x: number; y: number } {
    const pageWidth = this.pageWidth
    const pageHeight = this.pageHeight
    const margin = 20

    // Account for rotation - rotated images need origin adjustment
    const rad = (rotation * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const rotatedWidth = imgWidth * cos + imgHeight * sin
    const rotatedHeight = imgWidth * sin + imgHeight * cos

    switch (position) {
      case 'top-left':
        return { x: margin, y: margin }
      case 'top-center':
        return { x: (pageWidth - rotatedWidth) / 2, y: margin }
      case 'top-right':
        return { x: pageWidth - rotatedWidth - margin, y: margin }
      case 'middle-left':
        return { x: margin, y: (pageHeight - rotatedHeight) / 2 }
      case 'center':
        return { x: (pageWidth - rotatedWidth) / 2, y: (pageHeight - rotatedHeight) / 2 }
      case 'middle-right':
        return { x: pageWidth - rotatedWidth - margin, y: (pageHeight - rotatedHeight) / 2 }
      case 'bottom-left':
        return { x: margin, y: pageHeight - rotatedHeight - margin }
      case 'bottom-center':
        return { x: (pageWidth - rotatedWidth) / 2, y: pageHeight - rotatedHeight - margin }
      case 'bottom-right':
        return { x: pageWidth - rotatedWidth - margin, y: pageHeight - rotatedHeight - margin }
      case 'tile':
        return { x: 0, y: 0 }
      default:
        return { x: (pageWidth - rotatedWidth) / 2, y: (pageHeight - rotatedHeight) / 2 }
    }
  }

  /**
   * Add watermark layer to canvas with blend mode and positioning
   */
  private async addWatermarkToCanvas(layer: LayerObject): Promise<void> {
    if (!this.canvas || this.isDisposed) return

    // Create placeholder if no image
    if (!layer.imageUrl) {
      const placeholder = new Rect({
        left: this.pageWidth / 2 - 50,
        top: this.pageHeight / 2 - 50,
        width: 100,
        height: 100,
        fill: 'transparent',
        stroke: '#8b5cf6',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: !layer.locked,
        evented: !layer.locked,
        opacity: 0.5
      })
      this.layerMap.set(layer.id, placeholder)
      this.objectToLayerId.set(placeholder, layer.id)
      this.canvas.add(placeholder)
      return
    }

    try {
      const img = await FabricImage.fromURL(layer.imageUrl, { crossOrigin: 'anonymous' })
      if (this.isDisposed || !this.canvas) return

      const scale = layer.watermarkScale ?? 1
      const rotation = layer.watermarkRotation ?? 0
      const blendMode = layer.blendMode ?? 'normal'
      const position = layer.watermarkPosition ?? 'center'
      const baseOpacity = layer.opacity ?? 0.5

      const scaledWidth = (img.width ?? 100) * scale
      const scaledHeight = (img.height ?? 100) * scale

      // Handle tile mode
      if (position === 'tile') {
        this.createTiledWatermark(layer, img, scale, rotation, blendMode, baseOpacity)
        return
      }

      const pos = this.calculateWatermarkPosition(position, scaledWidth, scaledHeight, rotation)

      img.set({
        left: pos.x + scaledWidth / 2,
        top: pos.y + scaledHeight / 2,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale,
        angle: rotation,
        opacity: baseOpacity,
        selectable: !layer.locked,
        evented: !layer.locked,
        globalCompositeOperation: BLEND_MODE_MAP[blendMode]
      })

      // Remove existing watermark if updating
      const existing = this.layerMap.get(layer.id)
      if (existing) this.canvas.remove(existing)

      this.layerMap.set(layer.id, img)
      this.objectToLayerId.set(img, layer.id)
      this.canvas.add(img)
      this.canvas.requestRenderAll()
    } catch (e) {
      console.error('Failed to load watermark:', e)
    }
  }

  /**
   * Create tiled watermark pattern (optimized)
   */
  private createTiledWatermark(
    layer: LayerObject,
    img: FabricImage,
    scale: number,
    rotation: number,
    blendMode: BlendMode,
    opacity: number
  ): void {
    if (!this.canvas || this.isDisposed) return

    const tileWidth = (img.width ?? 100) * scale
    const tileHeight = (img.height ?? 100) * scale
    const spacing = layer.watermarkTileSpacing ?? 80

    // Use pattern fill for better performance
    const tiles: FabricObject[] = []
    const cols = Math.ceil(this.pageWidth / (tileWidth + spacing)) + 1
    const rows = Math.ceil(this.pageHeight / (tileHeight + spacing)) + 1

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * (tileWidth + spacing)
        const y = row * (tileHeight + spacing)

        // Clone the image for each tile
        const tileImg = new FabricImage(img.getElement(), {
          left: x + tileWidth / 2,
          top: y + tileHeight / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          angle: rotation,
          opacity,
          selectable: false,
          evented: false,
          globalCompositeOperation: BLEND_MODE_MAP[blendMode]
        })
        tiles.push(tileImg)
      }
    }

    const group = new Group(tiles, {
      selectable: !layer.locked,
      evented: !layer.locked,
      left: 0,
      top: 0
    })

    const existing = this.layerMap.get(layer.id)
    if (existing) this.canvas.remove(existing)

    this.layerMap.set(layer.id, group)
    this.objectToLayerId.set(group, layer.id)
    this.canvas.add(group)
    this.canvas.requestRenderAll()
  }

  /**
   * Update watermark layer properties (for live preview)
   */
  updateWatermark(layerId: string, updates: Partial<LayerObject>): void {
    const obj = this.layerMap.get(layerId)
    if (!obj || !this.canvas || this.isDisposed) return

    // Blend mode update
    if (updates.blendMode) {
      const compositeOp = BLEND_MODE_MAP[updates.blendMode]
      if (obj instanceof Group) {
        obj.getObjects().forEach((o) => o.set('globalCompositeOperation', compositeOp))
      } else {
        obj.set('globalCompositeOperation', compositeOp)
      }
    }

    // Opacity update
    if (updates.opacity !== undefined) {
      if (obj instanceof Group) {
        obj.getObjects().forEach((o) => o.set('opacity', updates.opacity))
      } else {
        obj.set('opacity', updates.opacity)
      }
    }

    // Scale update
    if (updates.watermarkScale !== undefined) {
      if (obj instanceof Group) {
        obj.set({ scaleX: updates.watermarkScale, scaleY: updates.watermarkScale })
      } else {
        obj.set({ scaleX: updates.watermarkScale, scaleY: updates.watermarkScale })
      }
    }

    // Rotation update
    if (updates.watermarkRotation !== undefined) {
      if (obj instanceof Group) {
        obj.set('angle', updates.watermarkRotation)
      } else {
        obj.set('angle', updates.watermarkRotation)
      }
    }

    // Position update (non-tile)
    if (updates.watermarkPosition !== undefined && !(obj instanceof Group)) {
      const imgWidth = (obj.width ?? 100) * (obj.scaleX ?? 1)
      const imgHeight = (obj.height ?? 100) * (obj.scaleY ?? 1)
      const rotation = obj.angle ?? 0
      const pos = this.calculateWatermarkPosition(updates.watermarkPosition, imgWidth, imgHeight, rotation)
      obj.set({ left: pos.x + imgWidth / 2, top: pos.y + imgHeight / 2 })
    }

    this.canvas.requestRenderAll()
  }

  /**
   * Force re-render watermark (for position/tile changes that need full rebuild)
   */
  async rerenderWatermark(layer: LayerObject): Promise<void> {
    if (!this.canvas || this.isDisposed) return
    const existing = this.layerMap.get(layer.id)
    if (existing) this.canvas.remove(existing)
    this.layerMap.delete(layer.id)
    await this.addWatermarkToCanvas(layer)
  }
}

export const canvasManager = new CanvasManager()
