<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { canvasManager } from '@/canvas'
import EditableLayer from './EditableLayer.vue'
import SinglePageViewer from './SinglePageViewer.vue'
import { BackgroundTexture } from './extra'
import type { Bounds, LayerUpdates } from '@/models'

const props = defineProps<{
  isMobile?: boolean
}>()

const canvasContainer = ref<HTMLDivElement | null>(null)
const canvasElement = ref<HTMLCanvasElement | null>(null)

const documentStore = useDocumentStore()
const uiStore = useUIStore()

const selectedLayerIds = computed(() => documentStore.selectedLayerIds)

function updateLayerProps(pageIndex: number, layerId: string, updates: LayerUpdates) {
  documentStore.updateLayer(pageIndex, layerId, updates)
}

function updateLayerBounds(pageIndex: number, layerId: string, bounds: Bounds) {
  documentStore.updateLayer(pageIndex, layerId, { bounds })
}

function selectLayer(layerId: string) {
  documentStore.selectLayer(layerId, false)
}

function deselectAll() {
  documentStore.deselectAll()
}

const currentPage = computed(() => documentStore.currentPage)
const currentPageIndex = computed(() => documentStore.currentPageIndex)
const totalPages = computed(() => documentStore.totalPages)
const zoom = computed(() => uiStore.zoom)
const hasDocument = computed(() => documentStore.hasDocument)

// Single page mode: use SinglePageViewer for 1-page documents
const isSinglePage = computed(() => totalPages.value === 1)

// Book view: show two pages side by side (only for multi-page docs)
const bookViewEnabled = ref(true)

// Get the spread pages (left and right)
const spreadPages = computed(() => {
  if (!documentStore.document) return { left: null, right: null }
  const pages = documentStore.document.document.pages
  const idx = currentPageIndex.value
  
  // First page is always alone (cover)
  if (idx === 0) {
    return { left: null, right: pages[0] }
  }
  
  // For book spread: odd pages on left, even on right
  const leftIdx = idx % 2 === 0 ? idx - 1 : idx
  const rightIdx = leftIdx + 1
  
  return {
    left: pages[leftIdx] || null,
    right: pages[rightIdx] || null
  }
})

// Page dimensions for scaling
const pageWidth = computed(() => documentStore.document?.document.pageWidth || 612)
const pageHeight = computed(() => documentStore.document?.document.pageHeight || 792)

watch(currentPage, (page) => {
  if (page && !isSinglePage.value) {
    // Set page dimensions for watermark positioning
    canvasManager.setPageDimensions(pageWidth.value, pageHeight.value)
    canvasManager.renderPage(page)
  }
}, { deep: true })

watch(zoom, (z) => {
  if (!isSinglePage.value) canvasManager.setZoom(z)
})

function toggleBookView() {
  bookViewEnabled.value = !bookViewEnabled.value
}

// Single page viewer handlers
function onSinglePageSelect(layerId: string) {
  documentStore.selectLayer(layerId, false)
}

function onSinglePageUpdateLayer(layerId: string, updates: LayerUpdates) {
  documentStore.updateLayer(currentPageIndex.value, layerId, updates)
}

function onSinglePageUpdateBounds(layerId: string, bounds: Bounds) {
  documentStore.updateLayer(currentPageIndex.value, layerId, { bounds })
}

onMounted(() => {
  if (canvasElement.value && canvasContainer.value && !isSinglePage.value) {
    const rect = canvasContainer.value.getBoundingClientRect()
    canvasManager.initialize(canvasElement.value, {
      width: rect.width - 32,
      height: rect.height - 32,
      backgroundColor: '#ffffff'
    })
    
    canvasManager.setSelectionCallback((layerIds: string[]) => {
      if (layerIds.length > 0) {
        documentStore.selectLayer(layerIds[0], false)
      } else {
        documentStore.deselectAll()
      }
    })
    
    canvasManager.setModifiedCallback((layerId: string, bounds) => {
      documentStore.updateLayer(documentStore.currentPageIndex, layerId, { bounds })
    })
    
    if (currentPage.value) {
      canvasManager.renderPage(currentPage.value)
    }
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown)
})

function onKeyDown(e: KeyboardEvent) {
  // Ignore if typing in input
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
  
  if (e.key === 'Escape') {
    deselectAll()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedLayerIds.value.length > 0 && !e.repeat) {
      // Could add delete layer functionality here
    }
  } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
    // Reset view with Ctrl+0
    e.preventDefault()
    if (!isSinglePage.value) canvasManager.resetView()
  } else if (e.key === '=' && (e.ctrlKey || e.metaKey)) {
    // Zoom in with Ctrl+=
    e.preventDefault()
    if (!isSinglePage.value) {
      const currentZoom = canvasManager.getZoom()
      canvasManager.setZoom(currentZoom * 1.2)
    }
  } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
    // Zoom out with Ctrl+-
    e.preventDefault()
    if (!isSinglePage.value) {
      const currentZoom = canvasManager.getZoom()
      canvasManager.setZoom(currentZoom * 0.8)
    }
  }
}

onUnmounted(() => {
  canvasManager.dispose()
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <BackgroundTexture 
    variant="grid-noise" 
    :opacity="0.2"
    class="relative h-full w-full overflow-auto bg-dark-900/50"
  >
    <div
      ref="canvasContainer"
      class="relative h-full w-full canvas-container"
      :style="{
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(167,139,250,0.06) 0%, transparent 50%),
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 24px 24px, 24px 24px'
      }"
    >
    <!-- Empty State -->
    <div 
      v-if="!hasDocument" 
      class="absolute inset-0 flex flex-col items-center justify-center p-4"
    >
      <div class="glass-panel-strong rounded-3xl md:rounded-[2rem] p-8 md:p-12 text-center max-w-md w-full border border-violet-400/10 shadow-[0_0_60px_rgba(167,139,250,0.1)]">
        <div class="w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 md:mb-8 rounded-2xl md:rounded-3xl bg-gradient-to-br from-violet-400/25 via-fuchsia-400/20 to-pink-400/15 flex items-center justify-center border border-violet-400/20 shadow-[0_0_40px_rgba(167,139,250,0.2)]">
          <svg class="h-10 w-10 md:h-12 md:w-12 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 class="text-xl md:text-2xl font-black text-white mb-3">No Document Yet ✨</h2>
        <p class="text-white/50 text-sm md:text-base mb-6 md:mb-8 font-medium">Import a PDF or DOCX file to start editing layers</p>
        <div v-if="!props.isMobile" class="flex flex-col gap-3 text-sm text-white/40">
          <div class="flex items-center justify-center gap-2">
            <kbd class="px-3 py-1.5 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.03] border border-white/[0.1] font-mono text-white/60 shadow-sm">Ctrl</kbd>
            <span class="text-white/30">+</span>
            <kbd class="px-3 py-1.5 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.03] border border-white/[0.1] font-mono text-white/60 shadow-sm">O</kbd>
            <span class="ml-2 text-white/50">to import</span>
          </div>
        </div>
        <p v-else class="text-white/40 text-sm font-medium">Tap the import button in the toolbar 📄</p>
      </div>
    </div>

    <!-- Single Page Viewer (for 1-page documents) -->
    <SinglePageViewer
      v-if="hasDocument && isSinglePage && currentPage"
      :page="currentPage"
      :page-width="pageWidth"
      :page-height="pageHeight"
      :selected-layer-ids="selectedLayerIds"
      :is-mobile="props.isMobile"
      class="absolute inset-0"
      @select="onSinglePageSelect"
      @deselect="deselectAll"
      @update-layer="onSinglePageUpdateLayer"
      @update-bounds="onSinglePageUpdateBounds"
    />

    <!-- Book View Canvas (multi-page documents) -->
    <div 
      v-show="hasDocument && !isSinglePage"
      class="flex min-h-full min-w-full items-center justify-center p-4 md:p-8"
      @click="deselectAll"
    >

      <!-- Book Spread Container (Desktop, multi-page only) -->
      <div 
        v-if="bookViewEnabled && totalPages > 1 && !props.isMobile"
        class="flex gap-1 items-center"
        :style="{ transform: `scale(${zoom})`, transformOrigin: 'center center' }"
      >
        <!-- Left Page -->
        <div 
          v-if="spreadPages.left"
          class="relative bg-white shadow-2xl shadow-black/40 rounded-l-sm"
          :style="{ 
            width: `${pageWidth * 0.5}px`, 
            height: `${pageHeight * 0.5}px`,
            boxShadow: 'inset -10px 0 20px -10px rgba(0,0,0,0.1), -4px 0 15px rgba(0,0,0,0.3)'
          }"
          @click.stop
        >
          <!-- Page Content Preview -->
          <div class="absolute inset-0 overflow-hidden p-2">
            <EditableLayer
              v-for="layer in spreadPages.left.layers.filter(l => l.visible).slice(0, 50)" 
              :key="layer.id"
              :layer="layer"
              :page-width="pageWidth"
              :page-height="pageHeight"
              :scale="0.5"
              :selected="selectedLayerIds.includes(layer.id)"
              @select="selectLayer(layer.id)"
              @update="updateLayerProps(spreadPages.left!.pageIndex, layer.id, $event)"
              @update-bounds="updateLayerBounds(spreadPages.left!.pageIndex, layer.id, $event)"
            />
          </div>
          <!-- Page Number -->
          <div class="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
            {{ spreadPages.left.pageIndex + 1 }}
          </div>
        </div>
        
        <!-- Book Spine -->
        <div class="w-2 h-full bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 shadow-inner" 
             :style="{ height: `${pageHeight * 0.5}px` }" />
        
        <!-- Right Page -->
        <div 
          v-if="spreadPages.right"
          class="relative bg-white shadow-2xl shadow-black/40 rounded-r-sm"
          :style="{ 
            width: `${pageWidth * 0.5}px`, 
            height: `${pageHeight * 0.5}px`,
            boxShadow: 'inset 10px 0 20px -10px rgba(0,0,0,0.1), 4px 0 15px rgba(0,0,0,0.3)'
          }"
          :class="{ 'ring-2 ring-violet-500/50': spreadPages.right.pageIndex === currentPageIndex }"
          @click.stop
        >
          <!-- Page Content Preview -->
          <div class="absolute inset-0 overflow-hidden p-2">
            <EditableLayer
              v-for="layer in spreadPages.right.layers.filter(l => l.visible).slice(0, 50)" 
              :key="layer.id"
              :layer="layer"
              :page-width="pageWidth"
              :page-height="pageHeight"
              :scale="0.5"
              :selected="selectedLayerIds.includes(layer.id)"
              @select="selectLayer(layer.id)"
              @update="updateLayerProps(spreadPages.right!.pageIndex, layer.id, $event)"
              @update-bounds="updateLayerBounds(spreadPages.right!.pageIndex, layer.id, $event)"
            />
          </div>
          <!-- Page Number -->
          <div class="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
            {{ spreadPages.right.pageIndex + 1 }}
          </div>
        </div>
      </div>

      <!-- Single Page View (Mobile or when book view disabled) -->
      <div 
        v-else
        class="relative shadow-2xl shadow-black/50 rounded-lg overflow-hidden bg-white"
        :style="{ 
          width: props.isMobile ? '100%' : `${pageWidth}px`, 
          maxWidth: props.isMobile ? `${pageWidth * 0.9}px` : 'none',
          height: props.isMobile ? 'auto' : `${pageHeight}px`,
          aspectRatio: props.isMobile ? `${pageWidth}/${pageHeight}` : 'auto',
          transform: `scale(${zoom})`,
          transformOrigin: 'center center'
        }"
      >
        <canvas 
          ref="canvasElement"
          class="block w-full h-full"
        />
      </div>
    </div>

    <!-- View Controls (Desktop, multi-page only) -->
    <div 
      v-if="hasDocument && !props.isMobile && !isSinglePage"
      class="absolute bottom-4 left-4 flex items-center gap-2"
    >
      <!-- Zoom Indicator -->
      <div class="glass-panel rounded-xl px-3 py-2 text-xs text-white/60">
        {{ Math.round(zoom * 100) }}%
      </div>
      
      <!-- Gesture Controls -->
      <div class="flex items-center gap-1">
        <button
          @click="canvasManager.resetView()"
          class="glass-panel rounded-xl px-3 py-2 text-xs text-white/60 hover:text-white/80 transition-all duration-300"
          title="Reset View (Ctrl+0)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        
        <button
          @click="canvasManager.centerView()"
          class="glass-panel rounded-xl px-3 py-2 text-xs text-white/60 hover:text-white/80 transition-all duration-300"
          title="Center View"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3v18m9-9H3" />
          </svg>
        </button>
      </div>
      
      <!-- Book View Toggle -->
      <button
        v-if="totalPages > 1"
        @click="toggleBookView"
        :class="[
          'glass-panel rounded-xl px-3 py-2 text-xs transition-all duration-300',
          bookViewEnabled 
            ? 'text-violet-300 border-violet-500/30' 
            : 'text-white/60 hover:text-white/80'
        ]"
        title="Toggle Book View"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </button>
    </div>

    <!-- Gesture Help (Desktop only) -->
    <div 
      v-if="hasDocument && !props.isMobile && !isSinglePage"
      class="absolute top-4 right-4 glass-panel rounded-xl p-3 text-xs text-white/60 max-w-xs"
    >
      <div class="font-medium text-white/80 mb-2">Canvas Controls</div>
      <div class="space-y-1">
        <div><kbd class="text-violet-300">Scroll</kbd> Pan view</div>
        <div><kbd class="text-violet-300">Ctrl+Scroll</kbd> Zoom at cursor</div>
        <div><kbd class="text-violet-300">Shift+Scroll</kbd> Rotate view</div>
        <div><kbd class="text-violet-300">Ctrl+Drag</kbd> Pan</div>
        <div><kbd class="text-violet-300">Middle+Drag</kbd> Pan</div>
        <div class="border-t border-white/10 pt-1 mt-2">
          <div><kbd class="text-violet-300">Ctrl+0</kbd> Reset view</div>
          <div><kbd class="text-violet-300">Ctrl++</kbd> Zoom in</div>
          <div><kbd class="text-violet-300">Ctrl+-</kbd> Zoom out</div>
        </div>
      </div>
    </div>

    <!-- Page Navigation (Desktop, multi-page only) -->
    <div 
      v-if="hasDocument && totalPages > 1 && !props.isMobile && !isSinglePage"
      class="absolute bottom-4 right-4 flex items-center gap-2"
    >
      <button
        @click="documentStore.goToPage(Math.max(0, currentPageIndex - (bookViewEnabled ? 2 : 1)))"
        :disabled="currentPageIndex === 0"
        :class="[
          'glass-panel rounded-xl w-9 h-9 flex items-center justify-center transition-all duration-300',
          currentPageIndex === 0 
            ? 'opacity-30 cursor-not-allowed' 
            : 'text-white/60 hover:text-white hover:bg-white/[0.08]'
        ]"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <div class="glass-panel rounded-xl px-3 py-2 text-xs text-white/60">
        {{ currentPageIndex + 1 }} / {{ totalPages }}
      </div>
      
      <button
        @click="documentStore.goToPage(Math.min(totalPages - 1, currentPageIndex + (bookViewEnabled ? 2 : 1)))"
        :disabled="currentPageIndex >= totalPages - 1"
        :class="[
          'glass-panel rounded-xl w-9 h-9 flex items-center justify-center transition-all duration-300',
          currentPageIndex >= totalPages - 1 
            ? 'opacity-30 cursor-not-allowed' 
            : 'text-white/60 hover:text-white hover:bg-white/[0.08]'
        ]"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    </div>
  </BackgroundTexture>
</template>

<style scoped>
.canvas-container {
  user-select: none;
  touch-action: none;
}

.canvas-container canvas {
  transition: cursor 0.1s ease;
}

.canvas-container.panning canvas {
  cursor: grabbing !important;
}

kbd {
  @apply px-1.5 py-0.5 rounded bg-white/10 border border-white/20 font-mono text-xs;
}
</style>
