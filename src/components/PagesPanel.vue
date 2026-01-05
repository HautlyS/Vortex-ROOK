<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'
import { BackgroundTexture } from './extra'
import { getImageUrl, isDirectUrl } from '@/composables/useImageLoader'
import type { PageData, LayerObject } from '@/models'

const props = defineProps<{
  isMobile?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useDocumentStore()

const pages = computed(() => store.document?.document.pages ?? [])
const currentIndex = computed(() => store.currentPageIndex)
const totalPages = computed(() => store.totalPages)
const pageWidth = computed(() => store.document?.document.pageWidth || 612)
const pageHeight = computed(() => store.document?.document.pageHeight || 792)

const draggedIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)
const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuPageIndex = ref<number | null>(null)

// Image thumbnail cache
const imageThumbnails = ref<Map<string, string>>(new Map())

async function loadImageThumbnail(layer: LayerObject): Promise<string | null> {
  if (!layer.imageUrl) return null
  
  // For blob/data URLs, use directly
  if (isDirectUrl(layer.imageUrl)) {
    imageThumbnails.value.set(layer.imageUrl, layer.imageUrl)
    return layer.imageUrl
  }
  
  // Check cache
  if (imageThumbnails.value.has(layer.imageUrl)) {
    return imageThumbnails.value.get(layer.imageUrl) || null
  }
  
  try {
    const url = await getImageUrl(layer.imageUrl)
    if (url) imageThumbnails.value.set(layer.imageUrl, url)
    return url
  } catch {
    return null
  }
}

// Load thumbnails for visible images
async function loadVisibleThumbnails() {
  for (const page of pages.value) {
    const imageLayers = page.layers.filter(l => l.visible && l.type === 'image').slice(0, 3)
    for (const layer of imageLayers) {
      await loadImageThumbnail(layer)
    }
  }
}

onMounted(loadVisibleThumbnails)
watch(pages, loadVisibleThumbnails, { deep: true })

function getImageThumbnailUrl(layer: LayerObject): string | null {
  if (!layer.imageUrl) return null
  // For blob/data URLs, use directly
  if (isDirectUrl(layer.imageUrl)) return layer.imageUrl
  return imageThumbnails.value.get(layer.imageUrl) || null
}

function selectPage(index: number) {
  store.goToPage(index)
  if (props.isMobile) emit('close')
}

function getLayerCount(page: PageData): number {
  return page.layers.length
}

// Get visible text layers for thumbnail preview (limit to first 20)
function getPreviewLayers(page: PageData) {
  return page.layers
    .filter(l => l.visible && l.type === 'text' && l.content)
    .slice(0, 20)
}

function onDragStart(index: number, e: DragEvent) {
  draggedIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(index: number, e: DragEvent) {
  e.preventDefault()
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    dropTargetIndex.value = index
  }
}

function onDragLeave() {
  dropTargetIndex.value = null
}

function onDrop(index: number) {
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    store.reorderPage(draggedIndex.value, index)
  }
  draggedIndex.value = null
  dropTargetIndex.value = null
}

function onDragEnd() {
  draggedIndex.value = null
  dropTargetIndex.value = null
}

function onContextMenu(index: number, e: MouseEvent) {
  e.preventDefault()
  contextMenuPageIndex.value = index
  contextMenuPos.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

function closeContextMenu() {
  showContextMenu.value = false
  contextMenuPageIndex.value = null
}

function addPage() {
  store.addPage(currentIndex.value + 1)
}

function duplicatePage(index: number) {
  store.duplicatePage(index)
  closeContextMenu()
}

function deletePage(index: number) {
  if (totalPages.value > 1) {
    store.deletePage(index)
  }
  closeContextMenu()
}
</script>

<template>
  <BackgroundTexture variant="waves" :opacity="0.2" class="flex h-full flex-col" @click="closeContextMenu">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-white/[0.04]">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 flex items-center justify-center">
          <svg class="w-3.5 h-3.5 md:w-4 md:h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 class="text-sm font-semibold text-white/80">Pages</h2>
          <p v-if="totalPages" class="text-[10px] text-white/30">{{ currentIndex + 1 }} of {{ totalPages }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click.stop="addPage"
          class="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-white/[0.04] hover:bg-violet-500/20 border border-white/[0.04] hover:border-violet-500/30 flex items-center justify-center text-white/40 hover:text-violet-300 transition-all duration-300"
          title="Add Page"
        >
          <svg class="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          v-if="props.isMobile"
          @click="emit('close')"
          class="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/40 hover:text-white"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Page List -->
    <div class="flex-1 overflow-y-auto p-3">
      <!-- Empty State -->
      <div v-if="pages.length === 0" class="flex flex-col items-center justify-center h-full text-center px-4">
        <div class="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
          <svg class="h-8 w-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p class="text-sm text-white/30 mb-1">No pages yet</p>
        <p class="text-xs text-white/20">Import a document to get started</p>
      </div>

      <!-- Page Cards -->
      <div v-else class="flex flex-col gap-2">
        <TransitionGroup
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0 scale-95"
          move-class="transition-all duration-300"
        >
          <div
            v-for="(page, index) in pages"
            :key="page.pageIndex"
            :draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover="onDragOver(index, $event)"
            @dragleave="onDragLeave"
            @drop="onDrop(index)"
            @dragend="onDragEnd"
            @click="selectPage(index)"
            @contextmenu="onContextMenu(index, $event)"
            :class="[
              'group relative flex cursor-pointer flex-col rounded-2xl p-2.5 transition-all duration-300',
              index === currentIndex
                ? 'bg-violet-500/10 border border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                : dropTargetIndex === index
                  ? 'bg-cyan-500/5 border border-cyan-500/30'
                  : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]',
              draggedIndex === index ? 'opacity-40 scale-95' : ''
            ]"
          >
            <!-- Drag Handle -->
            <div class="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:left-1.5">
              <svg class="h-4 w-4 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
              </svg>
            </div>

            <!-- Page Thumbnail with Content Preview -->
            <div
              :class="[
                'relative flex aspect-[3/4] w-full items-center justify-center rounded-xl overflow-hidden transition-all duration-300',
                index === currentIndex 
                  ? 'ring-2 ring-violet-500/50' 
                  : ''
              ]"
            >
              <!-- White Page Background -->
              <div class="absolute inset-1 bg-white rounded-lg shadow-inner overflow-hidden">
                <!-- Actual Content Preview -->
                <div class="relative w-full h-full">
                  <div 
                    v-for="layer in getPreviewLayers(page)" 
                    :key="layer.id"
                    class="absolute text-black leading-tight"
                    :style="{
                      left: `${(layer.bounds.x / pageWidth) * 100}%`,
                      top: `${(layer.bounds.y / pageHeight) * 100}%`,
                      fontSize: `${Math.max((layer.fontSize || 12) * 0.12, 2)}px`,
                      fontFamily: layer.fontFamily || 'Arial',
                      fontWeight: layer.fontWeight || 400,
                      color: layer.color || '#000000',
                      opacity: layer.opacity * 0.8,
                      maxWidth: '90%',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis'
                    }"
                  >
                    {{ layer.content?.substring(0, 30) }}
                  </div>
                  
                  <!-- Image thumbnails -->
                  <template v-for="layer in page.layers.filter(l => l.visible && l.type === 'image').slice(0, 3)" :key="'img-' + layer.id">
                    <img 
                      v-if="getImageThumbnailUrl(layer)"
                      :src="getImageThumbnailUrl(layer)!"
                      class="absolute object-contain"
                      :style="{
                        left: `${(layer.bounds.x / pageWidth) * 100}%`,
                        top: `${(layer.bounds.y / pageHeight) * 100}%`,
                        width: `${(layer.bounds.width / pageWidth) * 100}%`,
                        height: `${(layer.bounds.height / pageHeight) * 100}%`,
                        opacity: layer.opacity * 0.9
                      }"
                    />
                    <div 
                      v-else
                      class="absolute bg-gray-200 border border-gray-300"
                      :style="{
                        left: `${(layer.bounds.x / pageWidth) * 100}%`,
                        top: `${(layer.bounds.y / pageHeight) * 100}%`,
                        width: `${(layer.bounds.width / pageWidth) * 100}%`,
                        height: `${(layer.bounds.height / pageHeight) * 100}%`,
                        opacity: layer.opacity * 0.6
                      }"
                    />
                  </template>
                </div>
                
                <!-- Page Number Overlay -->
                <div class="absolute bottom-1 right-1 text-[8px] text-gray-400 font-medium">
                  {{ index + 1 }}
                </div>
              </div>
              
              <!-- Active Indicator Glow -->
              <div 
                v-if="index === currentIndex"
                class="absolute inset-0 bg-gradient-to-t from-violet-500/20 to-transparent rounded-xl pointer-events-none"
              />
            </div>

            <!-- Page Info -->
            <div class="mt-2.5 flex items-center justify-between px-0.5">
              <span :class="[
                'text-xs font-medium transition-colors duration-300',
                index === currentIndex ? 'text-violet-300' : 'text-white/50 group-hover:text-white/70'
              ]">
                Page {{ index + 1 }}
              </span>
              <div :class="[
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-300',
                index === currentIndex 
                  ? 'bg-violet-500/20 text-violet-300' 
                  : 'bg-white/[0.04] text-white/40 group-hover:bg-white/[0.06]'
              ]">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {{ getLayerCount(page) }}
              </div>
            </div>

            <!-- Quick Actions (hover) -->
            <div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
              <button
                @click.stop="duplicatePage(index)"
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-dark-800/90 backdrop-blur-sm text-white/50 hover:text-white hover:bg-dark-700 transition-all border border-white/[0.06]"
                title="Duplicate"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                v-if="totalPages > 1"
                @click.stop="deletePage(index)"
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-dark-800/90 backdrop-blur-sm text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-white/[0.06] hover:border-rose-500/20"
                title="Delete"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <!-- Footer Navigation -->
    <div v-if="pages.length > 0" class="border-t border-white/[0.04] p-4">
      <div class="flex items-center justify-between">
        <button
          @click="selectPage(Math.max(0, currentIndex - 1))"
          :disabled="currentIndex === 0"
          :class="[
            'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300',
            currentIndex === 0 
              ? 'opacity-30 cursor-not-allowed bg-white/[0.02]' 
              : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white'
          ]"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div class="flex items-center gap-1">
          <span class="text-sm font-semibold text-white/70">{{ currentIndex + 1 }}</span>
          <span class="text-sm text-white/30">/</span>
          <span class="text-sm text-white/40">{{ totalPages }}</span>
        </div>
        
        <button
          @click="selectPage(Math.min(totalPages - 1, currentIndex + 1))"
          :disabled="currentIndex >= totalPages - 1"
          :class="[
            'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300',
            currentIndex >= totalPages - 1 
              ? 'opacity-30 cursor-not-allowed bg-white/[0.02]' 
              : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white'
          ]"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="showContextMenu"
          class="fixed z-50 min-w-[180px] glass-panel-strong rounded-2xl py-2 overflow-hidden"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
          @click.stop
        >
          <button
            @click="duplicatePage(contextMenuPageIndex!)"
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <div class="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <svg class="h-4 w-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span>Duplicate Page</span>
          </button>
          <div class="mx-3 my-1 h-px bg-white/[0.06]" />
          <button
            v-if="totalPages > 1"
            @click="deletePage(contextMenuPageIndex!)"
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <div class="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <span>Delete Page</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </BackgroundTexture>
</template>
