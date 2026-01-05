<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { PageData, Bounds, LayerUpdates } from '@/models'
import EditableLayer from './EditableLayer.vue'

const props = defineProps<{
  page: PageData
  pageWidth: number
  pageHeight: number
  selectedLayerIds: string[]
  isMobile?: boolean
}>()

const emit = defineEmits<{
  select: [layerId: string]
  deselect: []
  updateLayer: [layerId: string, updates: LayerUpdates]
  updateBounds: [layerId: string, bounds: Bounds]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const containerSize = ref({ width: 800, height: 600 })

// View state
const zoom = ref(1)
const panOffset = ref({ x: 0, y: 0 })
const fitMode = ref<'fit' | 'width' | 'height' | 'actual'>('fit')

// Gesture state
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
const lastPinchDist = ref(0)
const lastPinchCenter = ref({ x: 0, y: 0 })

const computedScale = computed(() => {
  const padding = props.isMobile ? 24 : 48
  const availableW = Math.max(100, containerSize.value.width - padding)
  const availableH = Math.max(100, containerSize.value.height - padding)
  const pw = props.pageWidth || 612
  const ph = props.pageHeight || 792
  
  switch (fitMode.value) {
    case 'width': return availableW / pw
    case 'height': return availableH / ph
    case 'actual': return 1
    default: return Math.min(availableW / pw, availableH / ph)
  }
})

const finalScale = computed(() => computedScale.value * zoom.value)
const scaledWidth = computed(() => (props.pageWidth || 612) * finalScale.value)
const scaledHeight = computed(() => (props.pageHeight || 792) * finalScale.value)

const centerOffset = computed(() => ({
  x: Math.max(0, (containerSize.value.width - scaledWidth.value) / 2),
  y: Math.max(0, (containerSize.value.height - scaledHeight.value) / 2)
}))

function updateContainerSize() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    containerSize.value = { width: rect.width, height: rect.height }
  }
}

function setFitMode(mode: typeof fitMode.value) {
  fitMode.value = mode
  zoom.value = 1
  panOffset.value = { x: 0, y: 0 }
}

// Zoom at specific point (mouse/touch position)
function zoomAtPoint(newZoom: number, pointX: number, pointY: number) {
  const clampedZoom = Math.max(0.25, Math.min(4, newZoom))
  const zoomRatio = clampedZoom / zoom.value
  
  // Adjust pan to keep point stationary
  const pageX = centerOffset.value.x + panOffset.value.x
  const pageY = centerOffset.value.y + panOffset.value.y
  const relX = pointX - pageX
  const relY = pointY - pageY
  
  panOffset.value = {
    x: panOffset.value.x - relX * (zoomRatio - 1),
    y: panOffset.value.y - relY * (zoomRatio - 1)
  }
  zoom.value = clampedZoom
}

function zoomIn() { zoomAtPoint(zoom.value * 1.25, containerSize.value.width / 2, containerSize.value.height / 2) }
function zoomOut() { zoomAtPoint(zoom.value / 1.25, containerSize.value.width / 2, containerSize.value.height / 2) }
function resetZoom() { zoom.value = 1; panOffset.value = { x: 0, y: 0 } }

// Mouse drag to pan (any button or space+drag)
function onMouseDown(e: MouseEvent) {
  // Allow pan with middle button, space key, or on empty canvas area
  if (e.button === 1 || e.altKey || (e.target === containerRef.value)) {
    e.preventDefault()
    startPan(e.clientX, e.clientY)
  }
}

function startPan(x: number, y: number) {
  isPanning.value = true
  panStart.value = { x, y, offsetX: panOffset.value.x, offsetY: panOffset.value.y }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isPanning.value) return
  panOffset.value = {
    x: panStart.value.offsetX + (e.clientX - panStart.value.x),
    y: panStart.value.offsetY + (e.clientY - panStart.value.y)
  }
}

function onMouseUp() {
  isPanning.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

// Wheel zoom at mouse position
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return
  
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const delta = e.ctrlKey ? e.deltaY * 0.01 : e.deltaY * 0.002
  zoomAtPoint(zoom.value * (1 - delta), mouseX, mouseY)
}

// Touch gestures
function getTouchDist(t1: Touch, t2: Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

function getTouchCenter(t1: Touch, t2: Touch, rect: DOMRect) {
  return {
    x: (t1.clientX + t2.clientX) / 2 - rect.left,
    y: (t1.clientY + t2.clientY) / 2 - rect.top
  }
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    startPan(e.touches[0].clientX, e.touches[0].clientY)
  } else if (e.touches.length === 2) {
    e.preventDefault()
    isPanning.value = false
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    lastPinchDist.value = getTouchDist(e.touches[0], e.touches[1])
    lastPinchCenter.value = getTouchCenter(e.touches[0], e.touches[1], rect)
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 1 && isPanning.value) {
    panOffset.value = {
      x: panStart.value.offsetX + (e.touches[0].clientX - panStart.value.x),
      y: panStart.value.offsetY + (e.touches[0].clientY - panStart.value.y)
    }
  } else if (e.touches.length === 2) {
    e.preventDefault()
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    
    const dist = getTouchDist(e.touches[0], e.touches[1])
    const center = getTouchCenter(e.touches[0], e.touches[1], rect)
    
    // Pinch zoom at center point
    if (lastPinchDist.value > 0) {
      const scale = dist / lastPinchDist.value
      zoomAtPoint(zoom.value * scale, center.x, center.y)
    }
    
    // Pan with two fingers
    panOffset.value = {
      x: panOffset.value.x + (center.x - lastPinchCenter.value.x),
      y: panOffset.value.y + (center.y - lastPinchCenter.value.y)
    }
    
    lastPinchDist.value = dist
    lastPinchCenter.value = center
  }
}

function onTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2) {
    lastPinchDist.value = 0
  }
  if (e.touches.length === 0) {
    isPanning.value = false
  }
}

function selectLayer(layerId: string) { emit('select', layerId) }
function onCanvasClick() { emit('deselect') }

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(updateContainerSize)
  resizeObserver = new ResizeObserver(updateContainerSize)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

watch(() => props.page, () => { panOffset.value = { x: 0, y: 0 } })
</script>

<template>
  <div 
    ref="containerRef"
    class="relative h-full w-full overflow-hidden touch-none"
    :class="{ 'cursor-grab': !isPanning, 'cursor-grabbing': isPanning }"
    @mousedown="onMouseDown"
    @wheel.prevent="onWheel"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Page Container -->
    <div
      class="absolute"
      :style="{
        left: `${centerOffset.x + panOffset.x}px`,
        top: `${centerOffset.y + panOffset.y}px`,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`
      }"
      @click.self="onCanvasClick"
    >
      <!-- Page Background -->
      <div 
        class="relative w-full h-full bg-white shadow-2xl shadow-black/40 rounded-lg"
        @click.self="onCanvasClick"
      >
        <!-- Layers -->
        <EditableLayer
          v-for="layer in (page?.layers ?? []).filter(l => l.visible)"
          :key="layer.id"
          :layer="layer"
          :page-width="pageWidth"
          :page-height="pageHeight"
          :scale="finalScale"
          :selected="selectedLayerIds.includes(layer.id)"
          @select="selectLayer(layer.id)"
          @update="emit('updateLayer', layer.id, $event)"
          @update-bounds="emit('updateBounds', layer.id, $event)"
        />
      </div>
    </div>

    <!-- Controls -->
    <div class="absolute bottom-4 left-4 flex items-center gap-2">
      <div class="glass-panel rounded-xl px-3 py-2 text-xs text-white/60 font-mono">
        {{ Math.round(finalScale * 100) }}%
      </div>
    </div>

    <!-- Fit Mode & Zoom Controls -->
    <div class="absolute bottom-4 right-4 flex items-center gap-2">
      <div class="glass-panel rounded-xl flex overflow-hidden">
        <button
          @click="setFitMode('fit')"
          :class="['px-3 py-2 text-xs transition-colors', fitMode === 'fit' ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
          title="Fit Page"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          @click="setFitMode('width')"
          :class="['px-3 py-2 text-xs transition-colors', fitMode === 'width' ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
          title="Fit Width"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 12h16m-16 0l4-4m-4 4l4 4m12-4l-4-4m4 4l-4 4" />
          </svg>
        </button>
        <button
          @click="setFitMode('actual')"
          :class="['px-3 py-2 text-xs transition-colors', fitMode === 'actual' ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
          title="Actual Size (100%)"
        >1:1</button>
      </div>

      <div class="glass-panel rounded-xl flex overflow-hidden">
        <button @click="zoomOut" class="px-3 py-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="Zoom Out">−</button>
        <button @click="resetZoom" class="px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors border-x border-white/10" title="Reset Zoom">Reset</button>
        <button @click="zoomIn" class="px-3 py-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="Zoom In">+</button>
      </div>
    </div>

    <!-- Help Hint -->
    <div v-if="!isMobile" class="absolute top-4 right-4 text-xs text-white/30">
      Scroll to zoom • Drag empty area to pan
    </div>
  </div>
</template>
