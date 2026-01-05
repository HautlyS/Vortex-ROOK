<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { 
  getAllFonts, 
  loadGoogleFont, 
  fetchGoogleFontsApi,
  installCustomFont,
  clearFontCache,
  type FontInfo, 
  type GoogleFont 
} from '@/bridge/fontService'
import { isTauri } from '@/bridge/environment'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; fontAdded: [family: string] }>()

// State
const activeTab = ref<'installed' | 'google'>('google')
const searchQuery = ref('')
const selectedCategory = ref('all')
const installedFonts = ref<FontInfo[]>([])
const googleFonts = ref<GoogleFont[]>([])
const loadedFonts = ref<Set<string>>(new Set())
const loadingFonts = ref<Set<string>>(new Set())
const isLoadingList = ref(false)
const previewText = ref('The quick brown fox jumps over the lazy dog')

const categories = [
  { id: 'all', label: 'All' },
  { id: 'sans-serif', label: 'Sans Serif' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'monospace', label: 'Monospace' },
]

// Load installed fonts from localStorage
const INSTALLED_KEY = 'rook-installed-fonts'
function loadInstalledFromStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) || '[]')
  } catch { return [] }
}
function saveInstalledToStorage(fonts: string[]) {
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(fonts))
}

// Computed
const filteredGoogleFonts = computed(() => {
  let fonts = googleFonts.value
  if (selectedCategory.value !== 'all') {
    fonts = fonts.filter(f => f.category === selectedCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    fonts = fonts.filter(f => f.family.toLowerCase().includes(q))
  }
  return fonts.slice(0, 100)
})

// Actions
async function loadGoogleFontsList() {
  isLoadingList.value = true
  try {
    const fonts = await fetchGoogleFontsApi()
    googleFonts.value = fonts
    // Mark already installed fonts
    const installed = loadInstalledFromStorage()
    installed.forEach(f => loadedFonts.value.add(f))
  } catch (e) {
    console.error('Failed to load Google Fonts:', e)
  }
  isLoadingList.value = false
}

async function addGoogleFont(font: GoogleFont) {
  if (loadedFonts.value.has(font.family)) return
  
  loadingFonts.value.add(font.family)
  try {
    await loadGoogleFont(font.family, ['400', '500', '600', '700'])
    loadedFonts.value.add(font.family)
    
    // Save to storage
    const installed = loadInstalledFromStorage()
    if (!installed.includes(font.family)) {
      installed.push(font.family)
      saveInstalledToStorage(installed)
    }
    
    emit('fontAdded', font.family)
  } catch (e) {
    console.error('Failed to add font:', e)
  }
  loadingFonts.value.delete(font.family)
}

function removeFont(family: string) {
  loadedFonts.value.delete(family)
  const installed = loadInstalledFromStorage().filter(f => f !== family)
  saveInstalledToStorage(installed)
}

async function importFontFile() {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
    })
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected]
      for (const path of paths) {
        try {
          const family = await installCustomFont(path)
          loadedFonts.value.add(family)
          const installed = loadInstalledFromStorage()
          if (!installed.includes(family)) {
            installed.push(family)
            saveInstalledToStorage(installed)
          }
          emit('fontAdded', family)
        } catch (e) {
          console.error('Failed to install font:', e)
        }
      }
      clearFontCache()
    }
  } else {
    // Web: use file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ttf,.otf,.woff,.woff2'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files) return
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer()
        const fontName = file.name.replace(/\.(ttf|otf|woff2?)$/i, '')
        const fontFace = new FontFace(fontName, buffer)
        await fontFace.load()
        document.fonts.add(fontFace)
        loadedFonts.value.add(fontName)
        const installed = loadInstalledFromStorage()
        if (!installed.includes(fontName)) {
          installed.push(fontName)
          saveInstalledToStorage(installed)
        }
        emit('fontAdded', fontName)
      }
    }
    input.click()
  }
}

// Preview font on hover
function previewFont(family: string) {
  // Preload for preview
  if (!loadedFonts.value.has(family) && !loadingFonts.value.has(family)) {
    loadGoogleFont(family, ['400']).catch(() => {})
  }
}

// Initialize
watch(() => props.open, (open) => {
  if (open && googleFonts.value.length === 0) {
    loadGoogleFontsList()
  }
})

onMounted(async () => {
  const fonts = await getAllFonts()
  installedFonts.value = fonts.system
  // Load installed Google fonts
  const installed = loadInstalledFromStorage()
  installed.forEach(f => loadedFonts.value.add(f))
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />
        
        <!-- Modal -->
        <div class="relative w-full max-w-4xl h-[85vh] max-h-[700px] bg-[#0c0c10] rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
          
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16" />
                </svg>
              </div>
              <div>
                <h2 class="text-lg font-semibold text-white">Font Manager</h2>
                <p class="text-xs text-white/40">Add fonts to your library</p>
              </div>
            </div>
            <button @click="emit('close')" class="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Tabs & Search -->
          <div class="px-6 py-3 border-b border-white/[0.06] flex items-center gap-4">
            <!-- Tabs -->
            <div class="flex bg-white/[0.04] rounded-lg p-1">
              <button
                @click="activeTab = 'google'"
                :class="['px-4 py-1.5 rounded-md text-sm font-medium transition-all', activeTab === 'google' ? 'bg-violet-500 text-white shadow-lg' : 'text-white/50 hover:text-white']"
              >
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  Google Fonts
                </span>
              </button>
              <button
                @click="activeTab = 'installed'"
                :class="['px-4 py-1.5 rounded-md text-sm font-medium transition-all', activeTab === 'installed' ? 'bg-violet-500 text-white shadow-lg' : 'text-white/50 hover:text-white']"
              >
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  My Fonts ({{ loadedFonts.size }})
                </span>
              </button>
            </div>

            <!-- Search -->
            <div class="flex-1 relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="activeTab === 'google' ? 'Search 1500+ fonts...' : 'Search your fonts...'"
                class="w-full pl-10 pr-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <!-- Import Button -->
            <button
              @click="importFontFile"
              class="px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-sm text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import File
            </button>
          </div>

          <!-- Categories (Google tab only) -->
          <div v-if="activeTab === 'google'" class="px-6 py-2 border-b border-white/[0.06] flex gap-2 overflow-x-auto scrollbar-none">
            <button
              v-for="cat in categories"
              :key="cat.id"
              @click="selectedCategory = cat.id"
              :class="['px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all', selectedCategory === cat.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-white/40 hover:text-white/60 border border-transparent hover:border-white/10']"
            >{{ cat.label }}</button>
          </div>

          <!-- Font Grid -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Loading -->
            <div v-if="isLoadingList" class="flex flex-col items-center justify-center h-full gap-4">
              <div class="w-10 h-10 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <p class="text-white/40 text-sm">Loading fonts...</p>
            </div>

            <!-- Google Fonts Grid -->
            <div v-else-if="activeTab === 'google'" class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div
                v-for="font in filteredGoogleFonts"
                :key="font.family"
                @mouseenter="previewFont(font.family)"
                class="group relative p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-500/30 hover:bg-white/[0.04] transition-all cursor-pointer"
              >
                <!-- Font Preview -->
                <div class="mb-3">
                  <p 
                    class="text-xl text-white/90 truncate leading-tight"
                    :style="{ fontFamily: `'${font.family}', sans-serif` }"
                  >{{ font.family }}</p>
                  <p 
                    class="text-sm text-white/40 mt-1 line-clamp-2"
                    :style="{ fontFamily: `'${font.family}', sans-serif` }"
                  >{{ previewText }}</p>
                </div>

                <!-- Meta -->
                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-white/30 px-2 py-0.5 rounded bg-white/[0.06]">{{ font.category }}</span>
                  
                  <!-- Add/Added Button -->
                  <button
                    v-if="loadedFonts.has(font.family)"
                    class="flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/20 text-green-400 text-xs"
                    disabled
                  >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    Added
                  </button>
                  <button
                    v-else-if="loadingFonts.has(font.family)"
                    class="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/20 text-violet-300 text-xs"
                    disabled
                  >
                    <div class="w-3 h-3 border-2 border-violet-300/30 border-t-violet-300 rounded-full animate-spin" />
                    Adding...
                  </button>
                  <button
                    v-else
                    @click.stop="addGoogleFont(font)"
                    class="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/20 text-violet-300 text-xs opacity-0 group-hover:opacity-100 hover:bg-violet-500/30 transition-all"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </button>
                </div>
              </div>

              <!-- Empty State -->
              <div v-if="filteredGoogleFonts.length === 0" class="col-span-full flex flex-col items-center justify-center py-12">
                <svg class="w-12 h-12 text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-white/40 text-sm">No fonts found</p>
              </div>
            </div>

            <!-- Installed Fonts Grid -->
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div
                v-for="family in Array.from(loadedFonts)"
                :key="family"
                class="group relative p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all"
              >
                <div class="mb-3">
                  <p 
                    class="text-xl text-white/90 truncate leading-tight"
                    :style="{ fontFamily: `'${family}', sans-serif` }"
                  >{{ family }}</p>
                  <p 
                    class="text-sm text-white/40 mt-1 line-clamp-2"
                    :style="{ fontFamily: `'${family}', sans-serif` }"
                  >{{ previewText }}</p>
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-green-400/70 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    Installed
                  </span>
                  <button
                    @click="removeFont(family)"
                    class="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove font"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Empty State -->
              <div v-if="loadedFonts.size === 0" class="col-span-full flex flex-col items-center justify-center py-12">
                <svg class="w-12 h-12 text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <p class="text-white/40 text-sm mb-2">No fonts installed yet</p>
                <p class="text-white/25 text-xs">Browse Google Fonts or import your own</p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-3 border-t border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
            <p class="text-xs text-white/30">
              <span v-if="activeTab === 'google'">{{ filteredGoogleFonts.length }} fonts available</span>
              <span v-else>{{ loadedFonts.size }} fonts in your library</span>
            </p>
            <button
              @click="emit('close')"
              class="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scrollbar-none::-webkit-scrollbar { display: none; }
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
