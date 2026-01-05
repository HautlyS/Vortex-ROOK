<script setup lang="ts">
import { computed } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'
import { canvasManager } from '@/canvas'
import { BackgroundTexture } from './extra'
import type { LayerObject } from '@/models'

const props = defineProps<{
  isMobile?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useDocumentStore()

// Expose for template usage
const closePanel = () => emit('close')

const layers = computed(() => {
  if (!store.currentPage) return []
  return [...store.currentPage.layers].sort((a, b) => b.zIndex - a.zIndex)
})

const selectedIds = computed(() => store.selectedLayerIds)

function isSelected(layer: LayerObject): boolean {
  return selectedIds.value.includes(layer.id)
}

function selectLayer(layer: LayerObject, event: MouseEvent) {
  store.selectLayer(layer.id, event.shiftKey)
  canvasManager.selectLayer(layer.id)
  if (props.isMobile) closePanel()
}

function toggleVisibility(layer: LayerObject) {
  store.updateLayer(store.currentPageIndex, layer.id, { visible: !layer.visible })
}

function toggleLock(layer: LayerObject) {
  store.updateLayer(store.currentPageIndex, layer.id, { locked: !layer.locked })
}

function moveUp(layer: LayerObject) {
  const idx = layers.value.findIndex(l => l.id === layer.id)
  if (idx > 0) {
    const above = layers.value[idx - 1]
    store.updateLayer(store.currentPageIndex, layer.id, { zIndex: above.zIndex + 1 })
  }
}

function moveDown(layer: LayerObject) {
  const idx = layers.value.findIndex(l => l.id === layer.id)
  if (idx < layers.value.length - 1) {
    const below = layers.value[idx + 1]
    store.updateLayer(store.currentPageIndex, layer.id, { zIndex: below.zIndex - 1 })
  }
}

function bringToFront(layer: LayerObject) {
  const maxZ = Math.max(...layers.value.map(l => l.zIndex))
  store.updateLayer(store.currentPageIndex, layer.id, { zIndex: maxZ + 1 })
}

function sendToBack(layer: LayerObject) {
  const minZ = Math.min(...layers.value.map(l => l.zIndex))
  store.updateLayer(store.currentPageIndex, layer.id, { zIndex: minZ - 1 })
}

function deleteLayer(layer: LayerObject) {
  if (!layer.locked) {
    store.deleteLayer(store.currentPageIndex, layer.id)
  }
}

function duplicateLayer(layer: LayerObject) {
  const newLayer: LayerObject = {
    ...layer,
    id: `${layer.type}-${store.currentPageIndex}-${Date.now()}`,
    bounds: { ...layer.bounds, x: layer.bounds.x + 10, y: layer.bounds.y + 10 },
    zIndex: Math.max(...layers.value.map(l => l.zIndex)) + 1
  }
  store.addLayer(store.currentPageIndex, newLayer)
}

const layerStyles: Record<string, { icon: string; color: string; bg: string }> = {
  text: { icon: 'T', color: 'text-sky-400', bg: 'from-sky-500/20 to-sky-600/10' },
  image: { icon: '▣', color: 'text-rose-400', bg: 'from-rose-500/20 to-rose-600/10' },
  shape: { icon: '◆', color: 'text-amber-400', bg: 'from-amber-500/20 to-amber-600/10' },
  vector: { icon: '✦', color: 'text-emerald-400', bg: 'from-emerald-500/20 to-emerald-600/10' }
}

function getStyle(type: string) {
  return layerStyles[type] || { icon: '•', color: 'text-white/50', bg: 'from-white/10 to-white/5' }
}

function getLabel(layer: LayerObject): string {
  if (layer.type === 'text' && layer.content) {
    const text = layer.content.replace(/\s+/g, ' ').trim()
    return text.length > 20 ? text.slice(0, 20) + '…' : text
  }
  return `${layer.type.charAt(0).toUpperCase()}${layer.type.slice(1)}`
}
</script>

<template>
  <BackgroundTexture variant="dots" :opacity="0.25" class="flex h-full flex-col bg-gradient-to-b from-white/[0.02] to-transparent">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 border-b border-white/[0.06]">
      <div class="flex items-center gap-2 md:gap-2.5">
        <div class="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-gradient-to-br from-sky-500/25 to-cyan-500/15 flex items-center justify-center ring-1 ring-white/10">
          <svg class="w-3.5 h-3.5 md:w-4 md:h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <span class="text-sm font-semibold text-white/90">Layers</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="layers.length" class="text-[10px] md:text-[11px] font-medium text-white/40 bg-white/[0.06] px-2 py-0.5 rounded-md">
          {{ layers.length }}
        </span>
        <button
          v-if="props.isMobile"
          @click="closePanel"
          class="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/40 hover:text-white"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Layer List -->
    <div class="flex-1 overflow-y-auto">
      <!-- Empty -->
      <div v-if="!layers.length" class="flex flex-col items-center justify-center h-full px-6 text-center">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400/15 to-cyan-400/10 flex items-center justify-center mb-4 ring-1 ring-sky-400/20 shadow-[0_0_30px_rgba(56,189,248,0.1)]">
          <svg class="w-8 h-8 text-sky-300/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p class="text-sm text-white/50 font-medium">No layers yet ✨</p>
        <p class="text-xs text-white/30 mt-1">Import a document to see layers</p>
      </div>

      <!-- Items -->
      <div v-else class="p-2 space-y-1">
        <div
          v-for="layer in layers"
          :key="layer.id"
          @click="selectLayer(layer, $event)"
          :class="[
            'group relative flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all duration-200',
            isSelected(layer)
              ? 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 ring-1 ring-violet-500/40'
              : 'hover:bg-white/[0.04]'
          ]"
        >
          <!-- Type Icon -->
          <div :class="[
            'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 bg-gradient-to-br ring-1 ring-white/10',
            getStyle(layer.type).bg,
            getStyle(layer.type).color
          ]">
            {{ getStyle(layer.type).icon }}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0 pr-1">
            <div :class="['text-[13px] font-medium truncate leading-tight', layer.visible ? 'text-white/90' : 'text-white/40']">
              {{ getLabel(layer) }}
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] text-white/30 uppercase tracking-wide">{{ layer.type }}</span>
              <span v-if="layer.role !== 'content'" class="text-[9px] px-1.5 py-px rounded bg-fuchsia-500/20 text-fuchsia-300 font-medium uppercase">
                {{ layer.role }}
              </span>
            </div>
          </div>

          <!-- Controls -->
          <div class="flex items-center gap-0.5 shrink-0">
            <!-- Visibility -->
            <button
              @click.stop="toggleVisibility(layer)"
              :class="['w-7 h-7 rounded-lg flex items-center justify-center transition-all', layer.visible ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-white/20 hover:text-white/40']"
            >
              <svg v-if="layer.visible" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>

            <!-- Lock -->
            <button
              @click.stop="toggleLock(layer)"
              :class="['w-7 h-7 rounded-lg flex items-center justify-center transition-all', layer.locked ? 'text-amber-400 bg-amber-500/15' : 'text-white/20 hover:text-white/40']"
            >
              <svg v-if="layer.locked" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            </button>

            <!-- Hover Actions -->
            <div class="hidden group-hover:flex items-center gap-0.5 ml-1 pl-1 border-l border-white/10">
              <button @click.stop="moveUp(layer)" class="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button @click.stop="moveDown(layer)" class="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              <button @click.stop="duplicateLayer(layer)" class="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
              <button v-if="!layer.locked" @click.stop="deleteLayer(layer)" class="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="selectedIds.length" class="p-3 border-t border-white/[0.06]">
      <div class="flex gap-2">
        <button @click="bringToFront(layers.find(l => l.id === selectedIds[0])!)" class="flex-1 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] font-medium text-white/70 hover:text-white flex items-center justify-center gap-1.5 transition-all">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 11l7-7 7 7M5 19l7-7 7 7" /></svg>
          Front
        </button>
        <button @click="sendToBack(layers.find(l => l.id === selectedIds[0])!)" class="flex-1 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] font-medium text-white/70 hover:text-white flex items-center justify-center gap-1.5 transition-all">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" /></svg>
          Back
        </button>
      </div>
    </div>
  </BackgroundTexture>
</template>
