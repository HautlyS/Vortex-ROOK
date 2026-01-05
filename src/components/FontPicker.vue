<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { 
  getAllFonts, 
  searchGoogleFonts, 
  loadGoogleFont, 
  onFontsChanged,
  type FontInfo, 
  type GoogleFont 
} from '@/bridge/fontService'
import FontManager from './FontManager.vue'

const props = defineProps<{
  modelValue: string
  showGoogleFonts?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const RECENT_FONTS_KEY = 'rook-recent-fonts'
const INSTALLED_KEY = 'rook-installed-fonts'
const MAX_RECENT = 5

const triggerRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const showFontManager = ref(false)
const dropdownPos = ref({ x: 0, y: 0 })
const searchQuery = ref('')
const activeTab = ref<'recent' | 'system' | 'google'>('recent')
const systemFonts = ref<FontInfo[]>([])
const googleFonts = ref<GoogleFont[]>([])
const recentFonts = ref<string[]>([])
const isLoading = ref(false)
const loadingFont = ref<string | null>(null)
const selectedCategory = ref<string>('all')

let unlistenFonts: (() => void) | null = null

const categories = ['all', 'sans-serif', 'serif', 'monospace', 'display', 'handwriting']

// Get installed fonts from storage
function getInstalledFonts(): string[] {
  try { return JSON.parse(localStorage.getItem(INSTALLED_KEY) || '[]') }
  catch { return [] }
}

const filteredSystemFonts = computed(() => {
  let fonts = systemFonts.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    fonts = fonts.filter(f => f.family.toLowerCase().includes(q))
  }
  return fonts.slice(0, 50)
})

const filteredGoogleFonts = computed(() => {
  // Show installed Google fonts
  const installed = getInstalledFonts()
  let fonts = googleFonts.value.filter(f => installed.includes(f.family))
  
  if (selectedCategory.value !== 'all') {
    fonts = fonts.filter(f => f.category === selectedCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    fonts = fonts.filter(f => f.family.toLowerCase().includes(q))
  }
  return fonts.slice(0, 40)
})

const currentFontDisplay = computed(() => props.modelValue || 'Select font')

function updateDropdownPosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const dropdownWidth = 280
  const dropdownHeight = 340
  
  let x = rect.left
  let y = rect.bottom + 6
  
  if (x + dropdownWidth > window.innerWidth - 12) x = window.innerWidth - dropdownWidth - 12
  if (x < 12) x = 12
  if (y + dropdownHeight > window.innerHeight - 12) {
    y = rect.top - dropdownHeight - 6
    if (y < 12) y = 12
  }
  
  dropdownPos.value = { x, y }
}

function loadRecentFonts() {
  try {
    const stored = localStorage.getItem(RECENT_FONTS_KEY)
    recentFonts.value = stored ? JSON.parse(stored) : []
  } catch { recentFonts.value = [] }
}

function saveRecentFont(family: string) {
  const filtered = recentFonts.value.filter(f => f !== family)
  recentFonts.value = [family, ...filtered].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(recentFonts.value))
}

async function loadFonts() {
  isLoading.value = true
  try {
    const fonts = await getAllFonts()
    systemFonts.value = fonts.system
    googleFonts.value = fonts.google
  } catch (e) {
    console.error('Failed to load fonts:', e)
  }
  isLoading.value = false
}

async function selectFont(family: string, source: 'system' | 'google' | 'recent') {
  if (source === 'google') {
    loadingFont.value = family
    try {
      await loadGoogleFont(family, ['400', '700'])
    } catch (e) {
      console.error('Failed to load Google Font:', e)
    }
    loadingFont.value = null
  }
  saveRecentFont(family)
  emit('update:modelValue', family)
  isOpen.value = false
  searchQuery.value = ''
}

function closeDropdown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.font-picker')) {
    isOpen.value = false
  }
}

function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value) nextTick(updateDropdownPosition)
}

function openFontManager() {
  isOpen.value = false
  showFontManager.value = true
}

function onFontAdded(family: string) {
  // Refresh fonts list and select the new font
  loadFonts()
  selectFont(family, 'system')
}

watch(searchQuery, (val) => {
  if (activeTab.value === 'google' && val.length >= 2) {
    searchGoogleFonts(val).then(r => { googleFonts.value = r })
  }
})

watch(isOpen, (open) => {
  if (open) {
    activeTab.value = recentFonts.value.length > 0 ? 'recent' : 'system'
    nextTick(updateDropdownPosition)
  }
})

onMounted(async () => {
  loadRecentFonts()
  await loadFonts()
  document.addEventListener('click', closeDropdown)
  window.addEventListener('resize', updateDropdownPosition)
  unlistenFonts = await onFontsChanged(loadFonts)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
  window.removeEventListener('resize', updateDropdownPosition)
  unlistenFonts?.()
})
</script>

<template>
  <div class="font-picker relative">
    <!-- Trigger Button -->
    <button
      ref="triggerRef"
      @click.stop="toggleOpen"
      class="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-left flex items-center justify-between gap-1 text-xs text-white hover:bg-white/10 transition-colors"
    >
      <span class="truncate" :style="{ fontFamily: modelValue || 'inherit' }">{{ currentFontDisplay }}</span>
      <svg class="w-3 h-3 text-white/40 flex-shrink-0 transition-transform" :class="{ 'rotate-180': isOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 scale-95 -translate-y-1"
        enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div 
          v-if="isOpen"
          class="font-picker fixed z-[10000] w-[280px] bg-[#101016] rounded-xl border border-white/[0.08] shadow-2xl shadow-black/50 overflow-hidden"
          :style="{ left: `${dropdownPos.x}px`, top: `${dropdownPos.y}px` }"
          @click.stop
        >
          <!-- Add Font Button -->
          <div class="p-2 border-b border-white/[0.05]">
            <button
              @click="openFontManager"
              class="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 text-violet-300 text-[11px] font-medium flex items-center justify-center gap-2 hover:from-violet-500/30 hover:to-fuchsia-500/30 transition-all"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Fonts
            </button>
          </div>

          <!-- Search -->
          <div class="px-2 py-2 border-b border-white/[0.05]">
            <div class="relative">
              <svg class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search..."
                class="w-full pl-7 pr-2 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-white placeholder-white/25 focus:outline-none focus:border-violet-500/40"
              />
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-white/[0.05] text-[10px]">
            <button
              v-if="recentFonts.length > 0"
              @click="activeTab = 'recent'"
              :class="['flex-1 px-2 py-1.5 font-medium transition-colors', activeTab === 'recent' ? 'text-violet-300 bg-violet-500/10 border-b border-violet-500' : 'text-white/35 hover:text-white/50']"
            >Recent</button>
            <button
              @click="activeTab = 'system'"
              :class="['flex-1 px-2 py-1.5 font-medium transition-colors', activeTab === 'system' ? 'text-violet-300 bg-violet-500/10 border-b border-violet-500' : 'text-white/35 hover:text-white/50']"
            >System</button>
            <button
              v-if="showGoogleFonts !== false"
              @click="activeTab = 'google'"
              :class="['flex-1 px-2 py-1.5 font-medium transition-colors', activeTab === 'google' ? 'text-violet-300 bg-violet-500/10 border-b border-violet-500' : 'text-white/35 hover:text-white/50']"
            >Added</button>
          </div>

          <!-- Category Filter -->
          <div v-if="activeTab === 'google'" class="flex gap-1 px-2 py-1.5 border-b border-white/[0.05] overflow-x-auto scrollbar-none">
            <button
              v-for="cat in categories"
              :key="cat"
              @click="selectedCategory = cat"
              :class="['px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors', selectedCategory === cat ? 'bg-violet-500/25 text-violet-300' : 'text-white/30 hover:text-white/50']"
            >{{ cat === 'all' ? 'All' : cat }}</button>
          </div>

          <!-- Font List -->
          <div class="max-h-52 overflow-y-auto scrollbar-thin">
            <div v-if="isLoading" class="flex items-center justify-center py-6">
              <div class="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>

            <template v-else-if="activeTab === 'recent'">
              <button
                v-for="family in recentFonts"
                :key="family"
                @click="selectFont(family, 'recent')"
                :class="['w-full px-3 py-2 text-left flex items-center justify-between group transition-colors', modelValue === family ? 'bg-violet-500/15' : 'hover:bg-white/[0.04]']"
              >
                <span class="text-[12px] text-white/85 group-hover:text-white truncate" :style="{ fontFamily: family }">{{ family }}</span>
                <svg v-if="modelValue === family" class="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
            </template>

            <template v-else-if="activeTab === 'system'">
              <button
                v-for="font in filteredSystemFonts"
                :key="font.family"
                @click="selectFont(font.family, 'system')"
                :class="['w-full px-3 py-2 text-left flex items-center justify-between group transition-colors', modelValue === font.family ? 'bg-violet-500/15' : 'hover:bg-white/[0.04]']"
              >
                <span class="text-[12px] text-white/85 group-hover:text-white truncate" :style="{ fontFamily: font.family }">{{ font.family }}</span>
                <svg v-if="modelValue === font.family" class="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
              <div v-if="filteredSystemFonts.length === 0" class="px-3 py-6 text-center text-white/25 text-[11px]">No fonts found</div>
            </template>

            <template v-else>
              <button
                v-for="font in filteredGoogleFonts"
                :key="font.family"
                @click="selectFont(font.family, 'google')"
                :class="['w-full px-3 py-2 text-left flex items-center justify-between group transition-colors', modelValue === font.family ? 'bg-violet-500/15' : 'hover:bg-white/[0.04]']"
              >
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-[12px] text-white/85 group-hover:text-white truncate">{{ font.family }}</span>
                  <span class="text-[8px] text-white/30 px-1 py-0.5 rounded bg-white/[0.06] flex-shrink-0">{{ font.category }}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <div v-if="loadingFont === font.family" class="w-3.5 h-3.5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                  <svg v-else-if="modelValue === font.family" class="w-3.5 h-3.5 text-violet-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
              </button>
              <div v-if="filteredGoogleFonts.length === 0" class="px-3 py-6 text-center text-white/25 text-[11px]">
                <p>No fonts added yet</p>
                <button @click="openFontManager" class="mt-2 text-violet-400 hover:text-violet-300">Browse fonts →</button>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Font Manager Modal -->
    <FontManager 
      :open="showFontManager" 
      @close="showFontManager = false"
      @font-added="onFontAdded"
    />
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
.scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
