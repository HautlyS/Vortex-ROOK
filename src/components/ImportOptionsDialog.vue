<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ImportMode, ImportOptions, ImpositionLayout, PaperSize, ImpositionOptions } from '@/bridge/types'
import { calculateImposition, getImpositionDescription } from '@/bridge/printImposition'

const props = defineProps<{ show: boolean; totalPages?: number }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', options: ImportOptions): void
}>()

// Import mode
const mode = ref<ImportMode>('layers')

// OCR options
const ocrLanguage = ref('eng')

// Print imposition options
const impositionLayout = ref<ImpositionLayout>('2-up')
const paperSize = ref<PaperSize>('a4')
const landscape = ref(false)
const creepAdjustment = ref(0)
const nUpCols = ref(2)
const nUpRows = ref(2)

const modes: { value: ImportMode; label: string; icon: string; desc: string }[] = [
  { value: 'preserve', label: 'Preserve', icon: '📄', desc: 'Keep original, no editing' },
  { value: 'layers', label: 'Layers', icon: '📑', desc: 'Extract for editing' },
  { value: 'ocr', label: 'OCR', icon: '🔍', desc: 'Text recognition' },
  { value: 'print', label: 'Print', icon: '🖨️', desc: 'Book printing layout' },
]

const layouts: { value: ImpositionLayout; label: string; desc: string }[] = [
  { value: '2-up', label: '2-Up', desc: '2 pages per sheet' },
  { value: 'booklet', label: 'Booklet', desc: 'Saddle-stitch folding' },
  { value: '4-up', label: '4-Up', desc: '4 pages (2×2)' },
  { value: 'n-up', label: 'N-Up', desc: 'Custom grid' },
]

const papers: { value: PaperSize; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'a3', label: 'A3' },
  { value: 'legal', label: 'Legal' },
]

const impositionOptions = computed<ImpositionOptions>(() => ({
  layout: impositionLayout.value,
  paperSize: paperSize.value,
  landscape: landscape.value,
  creepAdjustment: creepAdjustment.value,
  nUpColumns: nUpCols.value,
  nUpRows: nUpRows.value,
}))

const impositionPreview = computed(() => {
  if (mode.value !== 'print' || !props.totalPages) return null
  const result = calculateImposition(props.totalPages, impositionOptions.value)
  return getImpositionDescription(result, impositionLayout.value)
})

function confirm() {
  const options: ImportOptions = { mode: mode.value }
  if (mode.value === 'ocr') {
    options.ocrLanguage = ocrLanguage.value
  } else if (mode.value === 'print') {
    options.imposition = impositionOptions.value
  }
  emit('confirm', options)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-all duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background: rgba(0,0,0,0.8); backdrop-filter: blur(12px)"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-lg glass-panel-strong rounded-2xl overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 class="text-lg font-bold text-white">📥 Import Options</h2>
            <button @click="emit('close')" class="text-white/40 hover:text-white p-1">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-5 space-y-5">
            <!-- Mode Selection -->
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="m in modes"
                :key="m.value"
                @click="mode = m.value"
                class="p-3 rounded-xl border transition-all text-center"
                :class="mode === m.value 
                  ? 'bg-violet-500/20 border-violet-500/50 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'"
              >
                <div class="text-2xl mb-1">{{ m.icon }}</div>
                <div class="text-xs font-medium">{{ m.label }}</div>
              </button>
            </div>

            <p class="text-xs text-white/50 text-center">
              {{ modes.find(m => m.value === mode)?.desc }}
            </p>

            <!-- OCR Options -->
            <div v-if="mode === 'ocr'" class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
              <label class="block">
                <span class="text-xs text-white/60">Language</span>
                <select v-model="ocrLanguage" class="mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm">
                  <option value="eng">English</option>
                  <option value="por">Portuguese</option>
                  <option value="spa">Spanish</option>
                  <option value="fra">French</option>
                  <option value="deu">German</option>
                </select>
              </label>
            </div>

            <!-- Print Options -->
            <div v-if="mode === 'print'" class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
              <!-- Layout -->
              <div class="grid grid-cols-4 gap-2">
                <button
                  v-for="l in layouts"
                  :key="l.value"
                  @click="impositionLayout = l.value"
                  class="px-2 py-2 rounded-lg text-xs font-medium transition-all"
                  :class="impositionLayout === l.value 
                    ? 'bg-violet-500 text-white' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'"
                >
                  {{ l.label }}
                </button>
              </div>

              <div class="flex gap-3">
                <!-- Paper Size -->
                <label class="flex-1">
                  <span class="text-xs text-white/60">Paper</span>
                  <select v-model="paperSize" class="mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm">
                    <option v-for="p in papers" :key="p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </label>

                <!-- Orientation -->
                <label class="flex items-end gap-2 pb-2">
                  <input type="checkbox" v-model="landscape" class="w-4 h-4 rounded accent-violet-500" />
                  <span class="text-xs text-white/60">Landscape</span>
                </label>
              </div>

              <!-- Booklet creep -->
              <div v-if="impositionLayout === 'booklet'">
                <label class="block">
                  <span class="text-xs text-white/60">Creep adjustment (mm)</span>
                  <input type="number" v-model.number="creepAdjustment" min="0" max="5" step="0.1"
                    class="mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm" />
                </label>
              </div>

              <!-- N-up grid -->
              <div v-if="impositionLayout === 'n-up'" class="flex gap-3">
                <label class="flex-1">
                  <span class="text-xs text-white/60">Columns</span>
                  <input type="number" v-model.number="nUpCols" min="1" max="6"
                    class="mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm" />
                </label>
                <label class="flex-1">
                  <span class="text-xs text-white/60">Rows</span>
                  <input type="number" v-model.number="nUpRows" min="1" max="6"
                    class="mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm" />
                </label>
              </div>

              <!-- Preview -->
              <div v-if="impositionPreview" class="text-xs text-violet-400 text-center pt-2 border-t border-white/10">
                {{ impositionPreview }}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 py-4 border-t border-white/10 flex justify-end gap-3">
            <button @click="emit('close')" class="px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white">
              Cancel
            </button>
            <button
              @click="confirm"
              class="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:scale-105 transition-all"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
