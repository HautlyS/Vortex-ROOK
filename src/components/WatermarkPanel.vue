<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { canvasManager } from '@/canvas'
import { isTauri, pickFile } from '@/bridge'
import type { LayerObject, BlendMode, WatermarkPosition } from '@/models'
import { ElasticSlider } from './extra'

defineProps<{ isMobile?: boolean }>()
defineEmits<{ (e: 'close'): void }>()

const store = useDocumentStore()
const uiStore = useUIStore()

const isLoading = ref(false)
const previewBlendMode = ref<BlendMode | null>(null)
const savedBlendMode = ref<BlendMode | null>(null)

const selectedLayer = computed<LayerObject | null>(() => {
  const layers = store.selectedLayers
  return layers.length === 1 && layers[0].type === 'watermark' ? layers[0] : null
})

const isWatermarkSelected = computed(() => selectedLayer.value?.type === 'watermark')

// Reset preview state when layer changes
watch(() => store.selectedLayerIds, () => {
  previewBlendMode.value = null
  savedBlendMode.value = null
})

const blendModes: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Dodge' },
  { value: 'color-burn', label: 'Burn' },
  { value: 'hard-light', label: 'Hard' },
  { value: 'soft-light', label: 'Soft' },
  { value: 'difference', label: 'Diff' },
  { value: 'exclusion', label: 'Excl' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Sat' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Lum' },
  { value: 'dissolve', label: 'Dissolve' }
]

const positionGrid: { value: WatermarkPosition; icon: string }[] = [
  { value: 'top-left', icon: '↖' },
  { value: 'top-center', icon: '↑' },
  { value: 'top-right', icon: '↗' },
  { value: 'middle-left', icon: '←' },
  { value: 'center', icon: '●' },
  { value: 'middle-right', icon: '→' },
  { value: 'bottom-left', icon: '↙' },
  { value: 'bottom-center', icon: '↓' },
  { value: 'bottom-right', icon: '↘' }
]

function update<K extends keyof LayerObject>(key: K, value: LayerObject[K]) {
  if (!selectedLayer.value) return
  store.updateLayer(store.currentPageIndex, selectedLayer.value.id, { [key]: value })
  // Live update canvas
  canvasManager.updateWatermark(selectedLayer.value.id, { [key]: value })
}

async function handleImageUpload() {
  if (!selectedLayer.value) return
  isLoading.value = true

  try {
    let imageUrl: string | null = null

    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const file = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
      })
      if (file) imageUrl = `file://${file}`
    } else {
      const file = await pickFile({ accept: ['.png', '.jpg', '.jpeg', '.webp', '.svg'] })
      if (file) {
        const blob = new Blob([new Uint8Array(file.data)], { type: `image/${file.name.split('.').pop()}` })
        imageUrl = URL.createObjectURL(blob)
      }
    }

    if (imageUrl) {
      update('imageUrl', imageUrl)
      uiStore.showNotification('success', 'Watermark image set')
    }
  } catch (e) {
    uiStore.showNotification('error', 'Failed to load image')
  } finally {
    isLoading.value = false
  }
}

function removeImage() {
  if (!selectedLayer.value) return
  // Revoke blob URL if exists
  if (selectedLayer.value.imageUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(selectedLayer.value.imageUrl)
  }
  update('imageUrl', undefined as unknown as string)
}

function onBlendModeHover(mode: BlendMode) {
  if (!selectedLayer.value) return
  if (savedBlendMode.value === null) {
    savedBlendMode.value = selectedLayer.value.blendMode ?? 'normal'
  }
  previewBlendMode.value = mode
  canvasManager.updateWatermark(selectedLayer.value.id, { blendMode: mode })
}

function onBlendModeLeave() {
  if (!selectedLayer.value || savedBlendMode.value === null) return
  canvasManager.updateWatermark(selectedLayer.value.id, { blendMode: savedBlendMode.value })
  previewBlendMode.value = null
}

function applyBlendMode(mode: BlendMode) {
  savedBlendMode.value = mode
  previewBlendMode.value = null
  update('blendMode', mode)
}

async function onPositionChange(pos: WatermarkPosition) {
  if (!selectedLayer.value) return
  update('watermarkPosition', pos)
  // Tile mode needs full re-render
  if (pos === 'tile' || selectedLayer.value.watermarkPosition === 'tile') {
    await canvasManager.rerenderWatermark(selectedLayer.value)
  }
}

function onSliderChange(key: 'opacity' | 'watermarkScale' | 'watermarkRotation' | 'watermarkTileSpacing', value: number) {
  if (!selectedLayer.value) return
  const finalValue = key === 'opacity' ? value / 100 : key === 'watermarkScale' ? value / 100 : value
  update(key, finalValue)
}
</script>

<template>
  <div class="flex flex-col gap-4 p-1">
    <h3 class="text-xs font-medium text-white/40 uppercase tracking-wider">
      Watermark
    </h3>

    <!-- No watermark selected -->
    <div
      v-if="!isWatermarkSelected"
      class="text-center py-6 text-white/30 text-sm"
    >
      Select a watermark layer to edit
    </div>

    <!-- Watermark Controls -->
    <template v-else-if="selectedLayer">
      <!-- Image Section -->
      <div class="space-y-2">
        <label class="text-[10px] text-white/30 uppercase">Image</label>
        
        <!-- Image Preview / Upload -->
        <div class="relative h-24 rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
          <div
            v-if="isLoading"
            class="absolute inset-0 flex items-center justify-center"
          >
            <div class="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          
          <img
            v-else-if="selectedLayer.imageUrl"
            :src="selectedLayer.imageUrl"
            class="w-full h-full object-contain"
            :style="{ opacity: selectedLayer.opacity, mixBlendMode: (selectedLayer.blendMode || 'normal') as any }"
            alt="Watermark preview"
          >
          
          <div
            v-else
            class="absolute inset-0 flex flex-col items-center justify-center text-white/30"
          >
            <svg
              class="w-8 h-8 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span class="text-[10px]">No image</span>
          </div>
        </div>

        <!-- Image Actions -->
        <div class="flex gap-2">
          <button
            :disabled="isLoading"
            class="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-50"
            @click="handleImageUpload"
          >
            {{ selectedLayer.imageUrl ? 'Replace' : 'Upload' }}
          </button>
          <button
            v-if="selectedLayer.imageUrl"
            class="py-2 px-3 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
            @click="removeImage"
          >
            Remove
          </button>
        </div>
      </div>

      <!-- Blend Mode -->
      <div class="space-y-2">
        <label class="text-[10px] text-white/30 uppercase">Blend Mode</label>
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="mode in blendModes"
            :key="mode.value"
            :class="[
              'py-1.5 px-1 rounded text-[9px] font-medium transition-all',
              (selectedLayer.blendMode === mode.value && !previewBlendMode) || previewBlendMode === mode.value
                ? 'bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/50'
                : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
            ]"
            @mouseenter="onBlendModeHover(mode.value)"
            @mouseleave="onBlendModeLeave"
            @click="applyBlendMode(mode.value)"
          >
            {{ mode.label }}
          </button>
        </div>
        <div
          v-if="previewBlendMode"
          class="text-[10px] text-violet-400 text-center"
        >
          Preview: {{ blendModes.find(m => m.value === previewBlendMode)?.label }}
        </div>
      </div>

      <!-- Position Grid -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-[10px] text-white/30 uppercase">Position</label>
          <button
            :class="[
              'px-2 py-1 rounded text-[10px] font-medium transition-all',
              selectedLayer.watermarkPosition === 'tile'
                ? 'bg-violet-500/30 text-violet-200'
                : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
            ]"
            @click="onPositionChange('tile')"
          >
            ⊞ Tile
          </button>
        </div>
        <div class="grid grid-cols-3 gap-1 max-w-[140px] mx-auto">
          <button
            v-for="pos in positionGrid"
            :key="pos.value"
            :class="[
              'aspect-square rounded-lg flex items-center justify-center text-base transition-all',
              selectedLayer.watermarkPosition === pos.value
                ? 'bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/50'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06]'
            ]"
            @click="onPositionChange(pos.value)"
          >
            {{ pos.icon }}
          </button>
        </div>
      </div>

      <!-- Tile Spacing (only for tile mode) -->
      <div
        v-if="selectedLayer.watermarkPosition === 'tile'"
        class="space-y-1"
      >
        <label class="text-[10px] text-white/30 uppercase">Tile Spacing</label>
        <ElasticSlider
          :default-value="selectedLayer.watermarkTileSpacing ?? 80"
          :starting-value="20"
          :max-value="200"
          :is-stepped="true"
          :step-size="10"
          class="slider-style"
          @update:model-value="onSliderChange('watermarkTileSpacing', $event)"
        >
          <template #left-icon>
            <span class="text-white/30 text-xs">20</span>
          </template>
          <template #right-icon>
            <span class="text-white/30 text-xs">200</span>
          </template>
        </ElasticSlider>
      </div>

      <!-- Opacity -->
      <div class="space-y-1">
        <label class="text-[10px] text-white/30 uppercase">Opacity</label>
        <ElasticSlider
          :default-value="Math.round((selectedLayer.opacity ?? 1) * 100)"
          :starting-value="0"
          :max-value="100"
          class="slider-style"
          @update:model-value="onSliderChange('opacity', $event)"
        >
          <template #left-icon>
            <span class="text-white/30 text-xs">0</span>
          </template>
          <template #right-icon>
            <span class="text-white/30 text-xs">100</span>
          </template>
        </ElasticSlider>
      </div>

      <!-- Scale -->
      <div class="space-y-1">
        <label class="text-[10px] text-white/30 uppercase">Scale</label>
        <ElasticSlider
          :default-value="Math.round((selectedLayer.watermarkScale ?? 1) * 100)"
          :starting-value="10"
          :max-value="300"
          class="slider-style"
          @update:model-value="onSliderChange('watermarkScale', $event)"
        >
          <template #left-icon>
            <span class="text-white/30 text-xs">10</span>
          </template>
          <template #right-icon>
            <span class="text-white/30 text-xs">300</span>
          </template>
        </ElasticSlider>
      </div>

      <!-- Rotation -->
      <div class="space-y-1">
        <label class="text-[10px] text-white/30 uppercase">Rotation</label>
        <ElasticSlider
          :default-value="selectedLayer.watermarkRotation ?? 0"
          :starting-value="-180"
          :max-value="180"
          class="slider-style"
          @update:model-value="onSliderChange('watermarkRotation', $event)"
        >
          <template #left-icon>
            <span class="text-white/30 text-xs">-180°</span>
          </template>
          <template #right-icon>
            <span class="text-white/30 text-xs">180°</span>
          </template>
        </ElasticSlider>
      </div>
    </template>
  </div>
</template>

<style scoped>
.slider-style {
  @apply !w-full !gap-2;
}
.slider-style :deep(> div:first-child) {
  @apply !gap-2;
}
.slider-style :deep(p) {
  @apply hidden;
}
.slider-style :deep(.bg-gray-400) {
  @apply !bg-white/10;
}
.slider-style :deep(.bg-\[\#27FF64\]) {
  @apply !bg-gradient-to-r !from-violet-500 !to-fuchsia-500;
}
</style>
