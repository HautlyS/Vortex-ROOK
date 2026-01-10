<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ImportMode, ImportOptions, ImpositionLayout, PaperSize, ImpositionOptions } from '@/bridge/types'
import { calculateImposition, getImpositionDescription, getBookletPageOrder, getFoldingInstructions } from '@/bridge/printImposition'

const props = defineProps<{ show: boolean; totalPages?: number; fileName?: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', options: ImportOptions): void
}>()

// Import mode
const mode = ref<ImportMode>('layers')

// OCR options
const ocrLanguage = ref('eng')

// Print imposition options
const impositionLayout = ref<ImpositionLayout>('booklet')
const paperSize = ref<PaperSize>('a4')
const landscape = ref(true)
const creepAdjustment = ref(0.5)
const nUpCols = ref(2)
const nUpRows = ref(2)
const showPageOrder = ref(false)

// Combined mode options
const combinedOcr = ref(false)
const combinedPrint = ref(false)

const modes: { value: ImportMode; label: string; icon: string; desc: string; detail: string }[] = [
  { 
    value: 'preserve', 
    label: 'Original', 
    icon: '📄', 
    desc: 'Keep as-is',
    detail: 'Import document without changes. Best for printing with booklet/signature layouts. Cannot edit content.'
  },
  { 
    value: 'layers', 
    label: 'Edit', 
    icon: '✏️', 
    desc: 'Extract layers',
    detail: 'Parse document into editable layers (text, images, shapes). Full editing capabilities.'
  },
  { 
    value: 'ocr', 
    label: 'OCR', 
    icon: '🔍', 
    desc: 'Text recognition',
    detail: 'Run OCR to extract text from scanned/image documents. Creates editable text layers.'
  },
  { 
    value: 'print', 
    label: 'Print', 
    icon: '🖨️', 
    desc: 'Book layout',
    detail: 'Configure page imposition for booklet printing. Supports saddle-stitch, 2-up, 4-up layouts.'
  },
  { 
    value: 'combined', 
    label: 'Combined', 
    icon: '⚡', 
    desc: 'Multiple options',
    detail: 'Combine multiple processing options: edit + OCR, edit + print layout, or all together.'
  },
]

const layouts: { value: ImpositionLayout; label: string; desc: string; icon: string }[] = [
  { value: 'booklet', label: 'Booklet', desc: 'Dobrar & grampear na lombada', icon: '📖' },
  { value: '2-up', label: '2-Up', desc: '2 páginas lado a lado', icon: '📑' },
  { value: '4-up', label: '4-Up', desc: '4 páginas (grade 2×2)', icon: '📋' },
  { value: 'n-up', label: 'N-Up', desc: 'Grade personalizada', icon: '⊞' },
]

const papers: { value: PaperSize; label: string; size: string }[] = [
  { value: 'a4', label: 'A4', size: '210×297mm' },
  { value: 'letter', label: 'Letter', size: '8.5×11"' },
  { value: 'a3', label: 'A3', size: '297×420mm' },
  { value: 'legal', label: 'Legal', size: '8.5×14"' },
]

const languages = [
  { value: 'eng', label: '🇺🇸 English' },
  { value: 'por', label: '🇧🇷 Portuguese' },
  { value: 'spa', label: '🇪🇸 Spanish' },
  { value: 'fra', label: '🇫🇷 French' },
  { value: 'deu', label: '🇩🇪 German' },
  { value: 'ita', label: '🇮🇹 Italian' },
  { value: 'jpn', label: '🇯🇵 Japanese' },
  { value: 'chi_sim', label: '🇨🇳 Chinese (Simplified)' },
]

const impositionOptions = computed<ImpositionOptions>(() => ({
  layout: impositionLayout.value,
  paperSize: paperSize.value,
  landscape: landscape.value,
  creepAdjustment: creepAdjustment.value,
  nUpColumns: nUpCols.value,
  nUpRows: nUpRows.value,
}))

const impositionResult = computed(() => {
  if (!props.totalPages) return null
  return calculateImposition(props.totalPages, impositionOptions.value)
})

const impositionPreview = computed(() => {
  if (!impositionResult.value) return null
  return getImpositionDescription(impositionResult.value, impositionLayout.value)
})

const pageOrderPreview = computed(() => {
  if (!props.totalPages || impositionLayout.value !== 'booklet') return []
  return getBookletPageOrder(props.totalPages)
})

const foldingInstructions = computed(() => {
  if (!impositionResult.value) return []
  return getFoldingInstructions(impositionLayout.value, impositionResult.value.totalSheets)
})

const showPrintOptions = computed(() => 
  mode.value === 'print' || mode.value === 'preserve' || (mode.value === 'combined' && combinedPrint.value)
)

const showOcrOptions = computed(() => 
  mode.value === 'ocr' || (mode.value === 'combined' && combinedOcr.value)
)

const currentModeDetail = computed(() => 
  modes.find(m => m.value === mode.value)?.detail || ''
)

function confirm() {
  const options: ImportOptions = { mode: mode.value }
  
  if (mode.value === 'ocr' || (mode.value === 'combined' && combinedOcr.value)) {
    options.ocrLanguage = ocrLanguage.value
  }
  
  if (mode.value === 'print' || mode.value === 'preserve' || (mode.value === 'combined' && combinedPrint.value)) {
    options.imposition = impositionOptions.value
  }
  
  // For combined mode, pass additional flags
  if (mode.value === 'combined') {
    options.extractImages = true
    if (combinedOcr.value) options.ocrLanguage = ocrLanguage.value
    if (combinedPrint.value) options.imposition = impositionOptions.value
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
        style="background: rgba(0,0,0,0.85); backdrop-filter: blur(16px)"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-2xl glass-panel-strong rounded-2xl overflow-hidden shadow-2xl">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
            <div>
              <h2 class="text-lg font-bold text-white flex items-center gap-2">
                📥 Import Options
              </h2>
              <p
                v-if="fileName"
                class="text-xs text-white/50 mt-0.5"
              >
                {{ fileName }}
              </p>
            </div>
            <button
              class="text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              @click="emit('close')"
            >
              <svg
                class="w-5 h-5"
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

          <div class="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <!-- Mode Selection -->
            <div>
              <label class="text-xs font-medium text-white/60 uppercase tracking-wider mb-2 block">Choose Import Mode</label>
              <div class="grid grid-cols-5 gap-2">
                <button
                  v-for="m in modes"
                  :key="m.value"
                  class="p-3 rounded-xl border transition-all text-center group relative"
                  :class="mode === m.value 
                    ? 'bg-violet-500/20 border-violet-500/50 text-white ring-2 ring-violet-500/30' 
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'"
                  @click="mode = m.value"
                >
                  <div class="text-2xl mb-1 transition-transform group-hover:scale-110">
                    {{ m.icon }}
                  </div>
                  <div class="text-xs font-medium">
                    {{ m.label }}
                  </div>
                </button>
              </div>
            </div>

            <!-- Mode Description -->
            <div class="p-3 rounded-xl bg-white/5 border border-white/10">
              <p class="text-sm text-white/70">
                {{ currentModeDetail }}
              </p>
            </div>

            <!-- Combined Mode Options -->
            <div
              v-if="mode === 'combined'"
              class="p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 space-y-3"
            >
              <label class="text-xs font-medium text-white/60 uppercase tracking-wider">Combine Options</label>
              <div class="flex flex-wrap gap-4">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="combinedOcr"
                    type="checkbox"
                    class="w-4 h-4 rounded accent-violet-500"
                  >
                  <span class="text-sm text-white/80">🔍 Run OCR</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="combinedPrint"
                    type="checkbox"
                    class="w-4 h-4 rounded accent-violet-500"
                  >
                  <span class="text-sm text-white/80">🖨️ Print Layout</span>
                </label>
              </div>
            </div>

            <!-- OCR Options -->
            <div
              v-if="showOcrOptions"
              class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3"
            >
              <label class="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
                🔍 OCR Settings
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs text-white/50">Language</span>
                  <select
                    v-model="ocrLanguage"
                    class="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
                  >
                    <option
                      v-for="lang in languages"
                      :key="lang.value"
                      :value="lang.value"
                    >{{ lang.label }}</option>
                  </select>
                </label>
              </div>
            </div>

            <!-- Print/Imposition Options -->
            <div
              v-if="showPrintOptions"
              class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4"
            >
              <label class="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
                🖨️ Print Layout Settings
              </label>
              
              <!-- Layout Selection -->
              <div>
                <span class="text-xs text-white/50 mb-2 block">Imposition Layout</span>
                <div class="grid grid-cols-4 gap-2">
                  <button
                    v-for="l in layouts"
                    :key="l.value"
                    class="p-2.5 rounded-lg text-center transition-all"
                    :class="impositionLayout === l.value 
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30' 
                      : 'bg-white/10 text-white/60 hover:bg-white/20'"
                    @click="impositionLayout = l.value"
                  >
                    <div class="text-lg">
                      {{ l.icon }}
                    </div>
                    <div class="text-xs font-medium mt-0.5">
                      {{ l.label }}
                    </div>
                  </button>
                </div>
                <p class="text-xs text-white/40 mt-2">
                  {{ layouts.find(l => l.value === impositionLayout)?.desc }}
                </p>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <!-- Paper Size -->
                <label class="block">
                  <span class="text-xs text-white/50">Paper Size</span>
                  <select
                    v-model="paperSize"
                    class="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm"
                  >
                    <option
                      v-for="p in papers"
                      :key="p.value"
                      :value="p.value"
                    >{{ p.label }} ({{ p.size }})</option>
                  </select>
                </label>

                <!-- Orientation -->
                <label class="block">
                  <span class="text-xs text-white/50">Orientation</span>
                  <div class="mt-1 flex rounded-lg overflow-hidden border border-white/10">
                    <button 
                      class="flex-1 px-3 py-2.5 text-xs font-medium transition-colors"
                      :class="!landscape ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'"
                      @click="landscape = false"
                    >Portrait</button>
                    <button 
                      class="flex-1 px-3 py-2.5 text-xs font-medium transition-colors"
                      :class="landscape ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'"
                      @click="landscape = true"
                    >Landscape</button>
                  </div>
                </label>

                <!-- Booklet creep -->
                <label
                  v-if="impositionLayout === 'booklet'"
                  class="block"
                >
                  <span class="text-xs text-white/50">Creep (mm)</span>
                  <input
                    v-model.number="creepAdjustment"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    class="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm"
                  >
                </label>
              </div>

              <!-- N-up grid -->
              <div
                v-if="impositionLayout === 'n-up'"
                class="flex gap-3"
              >
                <label class="flex-1">
                  <span class="text-xs text-white/50">Columns</span>
                  <input
                    v-model.number="nUpCols"
                    type="number"
                    min="1"
                    max="6"
                    class="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm"
                  >
                </label>
                <label class="flex-1">
                  <span class="text-xs text-white/50">Rows</span>
                  <input
                    v-model.number="nUpRows"
                    type="number"
                    min="1"
                    max="6"
                    class="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm"
                  >
                </label>
              </div>

              <!-- Preview -->
              <div
                v-if="impositionPreview"
                class="flex items-center gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20"
              >
                <span class="text-violet-400">📊</span>
                <span class="text-sm text-violet-300">{{ impositionPreview }}</span>
              </div>

              <!-- Page Order Preview (Booklet only) -->
              <div v-if="impositionLayout === 'booklet' && pageOrderPreview.length > 0">
                <button 
                  class="w-full flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  @click="showPageOrder = !showPageOrder"
                >
                  <span class="text-xs text-white/60">📋 Ver ordem das páginas</span>
                  <svg
                    class="w-4 h-4 text-white/40 transition-transform"
                    :class="showPageOrder && 'rotate-180'"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <Transition
                  enter-active-class="transition-all duration-200"
                  enter-from-class="opacity-0 max-h-0"
                  enter-to-class="opacity-100 max-h-96"
                  leave-active-class="transition-all duration-150"
                  leave-from-class="opacity-100 max-h-96"
                  leave-to-class="opacity-0 max-h-0"
                >
                  <div
                    v-if="showPageOrder"
                    class="mt-2 p-3 rounded-lg bg-black/20 border border-white/5 overflow-hidden"
                  >
                    <div class="text-xs text-white/50 mb-2">
                      Ordem de impressão (frente e verso):
                    </div>
                    <div class="space-y-1 font-mono text-xs">
                      <div
                        v-for="(line, i) in pageOrderPreview"
                        :key="i"
                        class="text-white/70"
                      >
                        {{ line }}
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Folding Instructions -->
              <div
                v-if="foldingInstructions.length > 0"
                class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <div class="text-xs font-medium text-amber-400 mb-2">
                  📐 Como dobrar:
                </div>
                <ol class="space-y-1 text-xs text-amber-300/80 list-decimal list-inside">
                  <li
                    v-for="(step, i) in foldingInstructions"
                    :key="i"
                  >
                    {{ step }}
                  </li>
                </ol>
              </div>
            </div>

            <!-- Info for Preserve mode -->
            <div
              v-if="mode === 'preserve' && !showPrintOptions"
              class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20"
            >
              <p class="text-sm text-amber-300 flex items-start gap-2">
                <span>💡</span>
                <span>Original mode keeps the document unchanged. Configure print layout above to prepare for booklet printing.</span>
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/20">
            <div class="text-xs text-white/40">
              <span v-if="totalPages">{{ totalPages }} pages</span>
            </div>
            <div class="flex gap-3">
              <button
                class="px-5 py-2.5 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                class="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 hover:scale-105 transition-all shadow-lg shadow-violet-500/30"
                @click="confirm"
              >
                Import Document
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
