<script setup lang="ts">
import { ref } from 'vue'
import { useTypography } from '@/composables/useTypography'

const { state, applyFormat } = useTypography()

const showColorPicker = ref(false)
const presetColors = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', 
  '#ff00ff', '#00ffff', '#808080', '#800000', '#008000', '#000080'
]

function setColor(color: string) {
  applyFormat({ color })
}

function setBackgroundColor(color: string) {
  applyFormat({ backgroundColor: color })
}
</script>

<template>
  <div class="relative">
    <button
      @click="showColorPicker = !showColorPicker"
      class="glass-btn-icon flex items-center gap-2"
      title="Text Colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
      <div class="flex gap-1">
        <div class="w-3 h-2 rounded-sm border border-white/20" :style="{ backgroundColor: state.color }" />
        <div class="w-3 h-2 rounded-sm border border-white/20" :style="{ backgroundColor: state.backgroundColor }" />
      </div>
    </button>
    
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 scale-95 translate-y-2"
      leave-active-class="transition-all duration-150"
      leave-to-class="opacity-0 scale-95 translate-y-2"
    >
      <div v-if="showColorPicker" class="absolute top-full left-0 mt-2 glass-panel-strong rounded-2xl p-4 z-50 w-64">
        <div class="space-y-4">
          <!-- Text Color -->
          <div>
            <label class="block text-xs text-white/50 mb-2">Text Color</label>
            <div class="flex items-center gap-2 mb-2">
              <input
                :value="state.color"
                @input="setColor(($event.target as HTMLInputElement).value)"
                type="color"
                class="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
              />
              <input
                :value="state.color"
                @input="setColor(($event.target as HTMLInputElement).value)"
                type="text"
                class="glass-input flex-1 text-xs"
              />
            </div>
            <div class="grid grid-cols-6 gap-1">
              <button
                v-for="color in presetColors"
                :key="color"
                @click="setColor(color)"
                class="w-6 h-6 rounded border border-white/20 hover:scale-110 transition-transform"
                :style="{ backgroundColor: color }"
              />
            </div>
          </div>
          
          <!-- Background Color -->
          <div>
            <label class="block text-xs text-white/50 mb-2">Background</label>
            <div class="flex items-center gap-2 mb-2">
              <input
                :value="state.backgroundColor === 'transparent' ? '#ffffff' : state.backgroundColor"
                @input="setBackgroundColor(($event.target as HTMLInputElement).value)"
                type="color"
                class="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
              />
              <button
                @click="setBackgroundColor('transparent')"
                class="glass-btn text-xs"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
