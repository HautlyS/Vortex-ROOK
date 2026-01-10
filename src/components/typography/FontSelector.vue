<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTypography } from '@/composables/useTypography'

const { fonts, fontsLoading, loadFonts, applyFormat, state } = useTypography()

const showDropdown = ref(false)
const searchQuery = ref('')

const filteredFonts = computed(() => {
  const query = searchQuery.value.toLowerCase()
  return fonts.value.filter(font => 
    font.family.toLowerCase().includes(query)
  ).slice(0, 50)
})

const systemFonts = computed(() => filteredFonts.value.filter(f => f.isSystem))
const googleFonts = computed(() => filteredFonts.value.filter(f => !f.isSystem))

onMounted(loadFonts)

function selectFont(family: string) {
  applyFormat({ fontFamily: family })
  showDropdown.value = false
}
</script>

<template>
  <div class="relative">
    <button
      class="glass-btn flex items-center gap-2 min-w-[140px] justify-between"
      @click="showDropdown = !showDropdown"
    >
      <span class="truncate text-sm font-medium">{{ state.fontFamily }}</span>
      <svg
        class="w-4 h-4 transition-transform"
        :class="{ 'rotate-180': showDropdown }"
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
      enter-from-class="opacity-0 scale-95 translate-y-2"
      leave-active-class="transition-all duration-150"
      leave-to-class="opacity-0 scale-95 translate-y-2"
    >
      <div
        v-if="showDropdown"
        class="absolute top-full left-0 mt-2 w-80 glass-panel-strong rounded-2xl p-4 z-50 max-h-96 overflow-hidden"
      >
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search fonts..."
          class="glass-input mb-4 text-sm"
          @click.stop
        >
        
        <div class="space-y-4 overflow-y-auto max-h-80">
          <div v-if="systemFonts.length">
            <h4 class="text-xs text-white/50 mb-2 font-medium">
              System
            </h4>
            <div class="space-y-1">
              <button
                v-for="font in systemFonts"
                :key="font.family"
                class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm transition-colors"
                :style="{ fontFamily: font.family }"
                @click="selectFont(font.family)"
              >
                {{ font.family }}
              </button>
            </div>
          </div>
          
          <div v-if="googleFonts.length">
            <h4 class="text-xs text-white/50 mb-2 font-medium">
              Google Fonts
            </h4>
            <div class="space-y-1">
              <button
                v-for="font in googleFonts"
                :key="font.family"
                class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm transition-colors"
                @click="selectFont(font.family)"
              >
                <div class="flex items-center justify-between">
                  <span>{{ font.family }}</span>
                  <span class="text-xs text-white/30">{{ font.variants?.length || 0 }}</span>
                </div>
              </button>
            </div>
          </div>
          
          <div
            v-if="fontsLoading"
            class="text-center py-4"
          >
            <div class="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
