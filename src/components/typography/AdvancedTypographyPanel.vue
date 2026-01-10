<script setup lang="ts">
import { ref } from 'vue'
import { useTypography } from '@/composables/useTypography'

const { state, applyFormat } = useTypography()

const showPanel = ref(false)

const fontWeights = [
  { label: 'Thin', value: 100 },
  { label: 'Light', value: 300 },
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'Black', value: 900 }
]

const textTransforms = [
  { label: 'None', value: 'none' },
  { label: 'ABC', value: 'uppercase' },
  { label: 'abc', value: 'lowercase' },
  { label: 'Abc', value: 'capitalize' }
]
</script>

<template>
  <div>
    <button
      :class="[
        'glass-btn-icon',
        showPanel && 'bg-violet-500/20 text-violet-300'
      ]"
      title="Advanced Typography"
      @click="showPanel = !showPanel"
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
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
        />
      </svg>
    </button>

    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0 max-h-0"
      leave-active-class="transition-all duration-200"
      leave-to-class="opacity-0 max-h-0"
    >
      <div
        v-if="showPanel"
        class="absolute top-full left-0 mt-2 w-80 glass-panel-strong rounded-2xl p-4 z-50 overflow-hidden"
      >
        <h4 class="text-sm font-medium text-white/70 mb-4">
          Advanced Typography
        </h4>
        
        <div class="space-y-4">
          <!-- Line Height -->
          <div>
            <label class="block text-xs text-white/50 mb-2">Line Height</label>
            <div class="flex items-center gap-3">
              <input
                :value="state.lineHeight"
                type="range"
                min="0.8"
                max="3"
                step="0.1"
                class="flex-1 accent-violet-500"
                @input="applyFormat({ lineHeight: Number(($event.target as HTMLInputElement).value) })"
              >
              <span class="text-xs text-white/60 w-10">{{ state.lineHeight.toFixed(1) }}</span>
            </div>
          </div>
          
          <!-- Letter Spacing -->
          <div>
            <label class="block text-xs text-white/50 mb-2">Letter Spacing</label>
            <div class="flex items-center gap-3">
              <input
                :value="state.letterSpacing"
                type="range"
                min="-2"
                max="5"
                step="0.1"
                class="flex-1 accent-violet-500"
                @input="applyFormat({ letterSpacing: Number(($event.target as HTMLInputElement).value) })"
              >
              <span class="text-xs text-white/60 w-10">{{ state.letterSpacing.toFixed(1) }}px</span>
            </div>
          </div>
          
          <!-- Font Weight -->
          <div>
            <label class="block text-xs text-white/50 mb-2">Font Weight</label>
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="weight in fontWeights"
                :key="weight.value"
                :class="[
                  'glass-btn text-xs py-1',
                  state.fontWeight === weight.value && 'bg-violet-500/20 text-violet-300'
                ]"
                @click="applyFormat({ fontWeight: weight.value })"
              >
                {{ weight.label }}
              </button>
            </div>
          </div>
          
          <!-- Text Transform -->
          <div>
            <label class="block text-xs text-white/50 mb-2">Text Transform</label>
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="transform in textTransforms"
                :key="transform.value"
                :class="[
                  'glass-btn text-xs py-1',
                  state.textTransform === transform.value && 'bg-violet-500/20 text-violet-300'
                ]"
                @click="applyFormat({ textTransform: transform.value as any })"
              >
                {{ transform.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
