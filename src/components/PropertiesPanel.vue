<script setup lang="ts">
  import { ref, computed, watch, reactive } from 'vue'
  import { useDocumentStore } from '@/stores/documentStore'
  import { useUIStore } from '@/stores/uiStore'
  import { canvasManager } from '@/canvas'
  import { isTauri, pickFile, downloadFile } from '@/bridge'
  import type { LayerObject, TextAlign, LayerRole } from '@/models'
  import FontPicker from './FontPicker.vue'
  import WatermarkPanel from './WatermarkPanel.vue'
  import { ElasticSlider, BackgroundTexture } from './extra'

  const props = defineProps<{
    isMobile?: boolean
  }>()

  const emit = defineEmits<{
    (e: 'close'): void
  }>()

  // Expose for template usage
  const isMobile = computed(() => props.isMobile)
  const closePanel = () => emit('close')
  const store = useDocumentStore()
  const uiStore = useUIStore()

  const selectedLayer = computed<LayerObject | null>(() => {
    const layers = store.selectedLayers
    return layers.length === 1 ? layers[0] : null
  })

  const multipleSelected = computed(() => store.selectedLayers.length > 1)

  const showHFDialog = ref(false)
  const hfStartPage = ref(1)
  const hfEndPage = ref(1)

  const imageFilters = reactive({ brightness: 0, contrast: 0, saturation: 0 })

  watch(selectedLayer, () => {
    imageFilters.brightness = 0
    imageFilters.contrast = 0
    imageFilters.saturation = 0
  })

  watch(
    () => store.totalPages,
    (total) => {
      hfEndPage.value = total
    }
  )

  function updateProperty<K extends keyof LayerObject>(key: K, value: LayerObject[K]) {
    if (!selectedLayer.value) return
    store.updateLayer(store.currentPageIndex, selectedLayer.value.id, { [key]: value })
  }

  function updateBounds(key: 'x' | 'y' | 'width' | 'height', value: number) {
    if (!selectedLayer.value) return
    const bounds = { ...selectedLayer.value.bounds, [key]: value }
    store.updateLayer(store.currentPageIndex, selectedLayer.value.id, { bounds })
  }

  function setRole(role: LayerRole) {
    if (!selectedLayer.value) return
    store.setLayerRole(store.currentPageIndex, selectedLayer.value.id, role)
  }

  function openApplyHFDialog() {
    hfStartPage.value = 1
    hfEndPage.value = store.totalPages
    showHFDialog.value = true
  }

  function applyHeaderFooter() {
    if (!selectedLayer.value) return
    store.applyHeaderFooterToRange(
      store.currentPageIndex,
      selectedLayer.value.id,
      hfStartPage.value - 1,
      hfEndPage.value - 1
    )
    showHFDialog.value = false
  }

  function applyFilters() {
    if (!selectedLayer.value) return
    canvasManager.applyImageFilters(selectedLayer.value.id, imageFilters)
  }

  function resetFilters() {
    imageFilters.brightness = 0
    imageFilters.contrast = 0
    imageFilters.saturation = 0
    applyFilters()
  }

  async function replaceImage() {
    if (!selectedLayer.value) return

    if (isTauri()) {
      // Tauri: Use native file dialog
      const { open } = await import('@tauri-apps/plugin-dialog')
      const file = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      })
      if (file) {
        store.updateLayer(store.currentPageIndex, selectedLayer.value.id, {
          imagePath: file as string,
          imageUrl: `file://${file}`
        })
        uiStore.showNotification('success', 'Image replaced')
      }
    } else {
      // Web: Use browser file picker
      const file = await pickFile({ accept: ['.png', '.jpg', '.jpeg', '.webp', '.gif'] })
      if (file) {
        // Create object URL for the image - ensure we have a proper ArrayBuffer for Blob
        const blob = new Blob([new Uint8Array(file.data)], {
          type: 'image/' + file.name.split('.').pop()
        })
        const imageUrl = URL.createObjectURL(blob)
        store.updateLayer(store.currentPageIndex, selectedLayer.value.id, {
          imageUrl
        })
        uiStore.showNotification('success', 'Image replaced')
      }
    }
  }

  async function exportImage() {
    if (!selectedLayer.value) return

    const dataUrl = canvasManager.exportLayerImage(selectedLayer.value.id, 'png')
    if (!dataUrl) {
      uiStore.showNotification('error', 'Failed to export image')
      return
    }

    if (isTauri()) {
      // Tauri: Use native save dialog
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await save({
        filters: [
          { name: 'PNG Image', extensions: ['png'] },
          { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
        ],
        defaultPath: `layer-${selectedLayer.value.id}.png`
      })
      if (path) {
        uiStore.setLoading(true, 'Exporting image...')
        try {
          const format =
            path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
              ? 'jpeg'
              : 'png'
          const exportDataUrl = canvasManager.exportLayerImage(selectedLayer.value.id, format)
          if (exportDataUrl) {
            await invoke('export_layer_image', { dataUrl: exportDataUrl, outputPath: path })
            uiStore.showNotification('success', 'Image exported')
          }
        } catch (e) {
          uiStore.showNotification('error', `Export failed: ${e}`)
        }
        uiStore.setLoading(false)
      }
    } else {
      // Web: Download directly
      const base64Data = dataUrl.split(',')[1]
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      downloadFile(bytes, `layer-${selectedLayer.value.id}.png`, 'image/png')
      uiStore.showNotification('success', 'Image downloaded')
    }
  }

  const textAlignOptions: { value: TextAlign; icon: string }[] = [
    { value: 'left', icon: 'M4 6h16M4 12h10M4 18h14' },
    { value: 'center', icon: 'M4 6h16M7 12h10M5 18h14' },
    { value: 'right', icon: 'M4 6h16M10 12h10M6 18h14' }
  ]
  const roleOptions: { value: LayerRole; label: string }[] = [
    { value: 'content', label: 'Content' },
    { value: 'background', label: 'BG' },
    { value: 'header', label: 'Header' },
    { value: 'footer', label: 'Footer' }
  ]
</script>

<template>
  <BackgroundTexture
    variant="crosshatch"
    :opacity="0.15"
    class="flex h-full flex-col"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 border-b border-white/[0.06]"
    >
      <h2 class="text-xs font-semibold uppercase tracking-wider text-white/40">
        Properties
      </h2>
      <button
        v-if="isMobile"
        class="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/40 hover:text-white"
        @click="closePanel"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- No Selection -->
      <div
        v-if="!selectedLayer && !multipleSelected"
        class="flex flex-col items-center justify-center h-full px-6 text-center"
      >
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-400/15 to-pink-400/10 flex items-center justify-center mb-4 ring-1 ring-violet-400/20 shadow-[0_0_30px_rgba(167,139,250,0.1)]">
          <svg
            class="h-8 w-8 text-violet-300/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
            />
          </svg>
        </div>
        <span class="text-sm text-white/50 font-medium">Select a layer ✨</span>
        <span class="text-xs text-white/30 mt-1">Click on any layer to edit</span>
      </div>

      <!-- Multiple Selection -->
      <div
        v-else-if="multipleSelected"
        class="flex flex-col items-center justify-center h-full px-6 text-center"
      >
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-400/15 to-pink-400/10 flex items-center justify-center mb-4 ring-1 ring-fuchsia-400/20 shadow-[0_0_30px_rgba(232,121,249,0.1)]">
          <svg
            class="h-8 w-8 text-fuchsia-300/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>
        <span class="text-sm text-white/50 font-medium">{{ store.selectedLayers.length }} layers selected</span>
        <span class="text-xs text-white/30 mt-1">Select one to edit properties</span>
      </div>

      <!-- Single Layer Properties -->
      <div
        v-else-if="selectedLayer"
        class="divide-y divide-white/[0.04]"
      >
        <!-- Watermark Section (if watermark type or enable for any image) -->
        <div
          v-if="selectedLayer.type === 'watermark' || selectedLayer.type === 'image'"
          class="p-4"
        >
          <WatermarkPanel :is-mobile="isMobile" />
        </div>

        <!-- Position & Size -->
        <div class="p-4">
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Transform
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">X</label>
              <input
                type="number"
                :value="Math.round(selectedLayer.bounds.x)"
                class="glass-input text-sm"
                @input="updateBounds('x', Number(($event.target as HTMLInputElement).value))"
              >
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Y</label>
              <input
                type="number"
                :value="Math.round(selectedLayer.bounds.y)"
                class="glass-input text-sm"
                @input="updateBounds('y', Number(($event.target as HTMLInputElement).value))"
              >
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">W</label>
              <input
                type="number"
                :value="Math.round(selectedLayer.bounds.width)"
                class="glass-input text-sm"
                @input="updateBounds('width', Number(($event.target as HTMLInputElement).value))"
              >
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">H</label>
              <input
                type="number"
                :value="Math.round(selectedLayer.bounds.height)"
                class="glass-input text-sm"
                @input="updateBounds('height', Number(($event.target as HTMLInputElement).value))"
              >
            </div>
          </div>
        </div>

        <!-- Appearance -->
        <div class="p-4">
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Appearance
          </h3>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[10px] text-white/30 uppercase">Opacity</label>
              <span class="text-[10px] text-white/40 tabular-nums">{{ Math.round(selectedLayer.opacity * 100) }}%</span>
            </div>
            <ElasticSlider
              :default-value="Math.round(selectedLayer.opacity * 100)"
              :starting-value="0"
              :max-value="100"
              class="!w-full !gap-2 [&>div:first-child]:!gap-2 [&_p]:hidden [&_.bg-gray-400]:!bg-white/10 [&_.bg-\[\#27FF64\]]:!bg-gradient-to-r [&_.bg-\[\#27FF64\]]:!from-violet-500 [&_.bg-\[\#27FF64\]]:!to-fuchsia-500"
              @update:model-value="updateProperty('opacity', $event / 100)"
            >
              <template #left-icon>
                <span class="text-white/30 text-xs">0</span>
              </template>
              <template #right-icon>
                <span class="text-white/30 text-xs">100</span>
              </template>
            </ElasticSlider>
          </div>
        </div>

        <!-- Image Properties -->
        <div
          v-if="selectedLayer.type === 'image'"
          class="p-4"
        >
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Image
          </h3>

          <div class="flex gap-2 mb-4">
            <button
              class="glass-btn flex-1 text-xs flex items-center justify-center gap-1.5"
              @click="replaceImage"
            >
              <svg
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Replace
            </button>
            <button
              class="glass-btn flex-1 text-xs flex items-center justify-center gap-1.5"
              @click="exportImage"
            >
              <svg
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export
            </button>
          </div>

          <!-- Filters -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-white/30 uppercase">Filters</span>
              <button
                class="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                @click="resetFilters"
              >
                Reset
              </button>
            </div>

            <div>
              <label class="text-[10px] text-white/30 mb-1 block">Brightness</label>
              <ElasticSlider
                :default-value="Math.round(imageFilters.brightness * 100)"
                :starting-value="-100"
                :max-value="100"
                class="slider-style"
                @update:model-value="imageFilters.brightness = $event / 100; applyFilters()"
              >
                <template #left-icon>
                  <span class="text-white/30 text-[10px]">-</span>
                </template>
                <template #right-icon>
                  <span class="text-white/30 text-[10px]">+</span>
                </template>
              </ElasticSlider>
            </div>

            <div>
              <label class="text-[10px] text-white/30 mb-1 block">Contrast</label>
              <ElasticSlider
                :default-value="Math.round(imageFilters.contrast * 100)"
                :starting-value="-100"
                :max-value="100"
                class="slider-style"
                @update:model-value="imageFilters.contrast = $event / 100; applyFilters()"
              >
                <template #left-icon>
                  <span class="text-white/30 text-[10px]">-</span>
                </template>
                <template #right-icon>
                  <span class="text-white/30 text-[10px]">+</span>
                </template>
              </ElasticSlider>
            </div>

            <div>
              <label class="text-[10px] text-white/30 mb-1 block">Saturation</label>
              <ElasticSlider
                :default-value="Math.round(imageFilters.saturation * 100)"
                :starting-value="-100"
                :max-value="100"
                class="slider-style"
                @update:model-value="imageFilters.saturation = $event / 100; applyFilters()"
              >
                <template #left-icon>
                  <span class="text-white/30 text-[10px]">-</span>
                </template>
                <template #right-icon>
                  <span class="text-white/30 text-[10px]">+</span>
                </template>
              </ElasticSlider>
            </div>
          </div>
        </div>

        <!-- Layer Role -->
        <div class="p-4">
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Role
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="opt in roleOptions"
              :key="opt.value"
              :class="[
                'rounded-lg px-3 py-1.5 text-xs transition-all duration-200',
                selectedLayer.role === opt.value
                  ? opt.value === 'header' || opt.value === 'footer'
                    ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                    : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/70'
              ]"
              @click="setRole(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
          <button
            v-if="selectedLayer.role === 'header' || selectedLayer.role === 'footer'"
            class="mt-3 w-full glass-btn text-xs flex items-center justify-center gap-1.5 !bg-fuchsia-500/10 !border-fuchsia-500/20 text-fuchsia-300 hover:!bg-fuchsia-500/20"
            @click="openApplyHFDialog"
          >
            <svg
              class="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Apply to Pages
          </button>
        </div>

        <!-- Text Properties -->
        <div
          v-if="selectedLayer.type === 'text'"
          class="p-4"
        >
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Typography
          </h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Font</label>
              <FontPicker
                :model-value="selectedLayer.fontFamily ?? 'Inter'"
                @update:model-value="updateProperty('fontFamily', $event)"
              />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Size</label>
                <input
                  type="number"
                  :value="selectedLayer.fontSize ?? 16"
                  class="glass-input text-sm"
                  @input="
                    updateProperty('fontSize', Number(($event.target as HTMLInputElement).value))
                  "
                >
              </div>
              <div>
                <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Color</label>
                <div class="relative">
                  <input
                    type="color"
                    :value="selectedLayer.color ?? '#ffffff'"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    @input="updateProperty('color', ($event.target as HTMLInputElement).value)"
                  >
                  <div class="glass-input h-[38px] flex items-center gap-2">
                    <div
                      class="w-5 h-5 rounded-md border border-white/20"
                      :style="{ backgroundColor: selectedLayer.color ?? '#ffffff' }"
                    />
                    <span class="text-xs text-white/50 uppercase">{{
                      (selectedLayer.color ?? '#ffffff').slice(1)
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Align</label>
              <div class="flex gap-1">
                <button
                  v-for="align in textAlignOptions"
                  :key="align.value"
                  :class="[
                    'flex h-9 flex-1 items-center justify-center rounded-xl border transition-all duration-200',
                    selectedLayer.textAlign === align.value
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                      : 'border-white/[0.06] bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                  ]"
                  @click="updateProperty('textAlign', align.value)"
                >
                  <svg
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      :d="align.icon"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Shape Properties -->
        <div
          v-if="selectedLayer.type === 'shape'"
          class="p-4"
        >
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Shape
          </h3>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Fill</label>
                <div class="relative">
                  <input
                    type="color"
                    :value="selectedLayer.fillColor ?? '#8b5cf6'"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    @input="updateProperty('fillColor', ($event.target as HTMLInputElement).value)"
                  >
                  <div class="glass-input h-[38px] flex items-center gap-2">
                    <div
                      class="w-5 h-5 rounded-md border border-white/20"
                      :style="{ backgroundColor: selectedLayer.fillColor ?? '#8b5cf6' }"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Stroke</label>
                <div class="relative">
                  <input
                    type="color"
                    :value="selectedLayer.strokeColor ?? '#ffffff'"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    @input="
                      updateProperty('strokeColor', ($event.target as HTMLInputElement).value)
                    "
                  >
                  <div class="glass-input h-[38px] flex items-center gap-2">
                    <div
                      class="w-5 h-5 rounded-md border border-white/20"
                      :style="{ backgroundColor: selectedLayer.strokeColor ?? '#ffffff' }"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] text-white/30 uppercase">Stroke Width</label>
              <input
                type="number"
                min="0"
                :value="selectedLayer.strokeWidth ?? 1"
                class="glass-input text-sm"
                @input="
                  updateProperty('strokeWidth', Number(($event.target as HTMLInputElement).value))
                "
              >
            </div>
          </div>
        </div>

        <!-- Layer Info -->
        <div class="p-4">
          <h3 class="mb-3 text-xs font-medium text-white/40 uppercase tracking-wider">
            Info
          </h3>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-white/30">Type</span>
              <span class="capitalize text-white/60">{{ selectedLayer.type }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/30">Source</span>
              <span class="capitalize text-white/60">{{ selectedLayer.sourceType }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/30">ID</span>
              <span class="font-mono text-white/40 text-[10px]">{{ selectedLayer.id }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Header/Footer Dialog -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showHFDialog"
          class="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-xl"
          @click.self="showHFDialog = false"
        >
          <div class="w-80 glass-panel-strong rounded-2xl p-5">
            <h3 class="mb-4 text-sm font-semibold text-white">
              Apply {{ selectedLayer?.role }} to Pages
            </h3>
            <div class="mb-5 space-y-3">
              <div class="flex items-center gap-3">
                <label class="w-12 text-xs text-white/40">From</label>
                <input
                  v-model.number="hfStartPage"
                  type="number"
                  min="1"
                  :max="store.totalPages"
                  class="glass-input flex-1 text-sm"
                >
              </div>
              <div class="flex items-center gap-3">
                <label class="w-12 text-xs text-white/40">To</label>
                <input
                  v-model.number="hfEndPage"
                  type="number"
                  :min="hfStartPage"
                  :max="store.totalPages"
                  class="glass-input flex-1 text-sm"
                >
              </div>
              <button
                class="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                @click="hfStartPage = 1; hfEndPage = store.totalPages"
              >
                Apply to all pages
              </button>
            </div>
            <div class="flex justify-end gap-2">
              <button
                class="glass-btn text-sm"
                @click="showHFDialog = false"
              >
                Cancel
              </button>
              <button
                class="btn-accent text-sm !py-2"
                @click="applyHeaderFooter"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </BackgroundTexture>
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
