<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '@/stores/themeStore'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const theme = useThemeStore()

const presets = [
  { name: 'Lavender', colors: ['#a78bfa', '#f472b6', '#67e8f9'] },
  { name: 'Ocean', colors: ['#38bdf8', '#818cf8', '#34d399'] },
  { name: 'Sunset', colors: ['#fb923c', '#f472b6', '#fbbf24'] },
  { name: 'Forest', colors: ['#4ade80', '#2dd4bf', '#a3e635'] },
  { name: 'Rose', colors: ['#fb7185', '#c084fc', '#fda4af'] },
  { name: 'Mono', colors: ['#a1a1aa', '#71717a', '#d4d4d8'] }
]

const colorItems = computed(() => [
  { key: 'accent' as const, label: 'Accent', desc: 'Buttons & highlights' },
  { key: 'secondary' as const, label: 'Secondary', desc: 'Gradients & accents' },
  { key: 'tertiary' as const, label: 'Tertiary', desc: 'Info & links' }
])

function applyPreset(p: typeof presets[0]) {
  theme.setColor('accent', p.colors[0])
  theme.setColor('secondary', p.colors[1])
  theme.setColor('tertiary', p.colors[2])
}

const previewSelectionStyle = computed(() => ({
  background: theme.selectionColor,
  color: theme.invertSelection ? theme.colors.accent : '#fff'
}))
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
        <div class="w-full max-w-md glass-panel-strong rounded-2xl overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 class="text-lg font-bold text-white">
              🎨 Theme
            </h2>
            <button
              class="text-white/40 hover:text-white p-1"
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

          <!-- Content -->
          <div class="p-5 space-y-5">
            <!-- Presets -->
            <div class="grid grid-cols-6 gap-2">
              <button
                v-for="p in presets"
                :key="p.name"
                :title="p.name"
                class="group aspect-square rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all flex items-center justify-center"
                @click="applyPreset(p)"
              >
                <div class="flex flex-col gap-0.5">
                  <div
                    class="w-3 h-3 rounded-full"
                    :style="{ background: p.colors[0] }"
                  />
                  <div class="flex gap-0.5">
                    <div
                      class="w-1.5 h-1.5 rounded-full"
                      :style="{ background: p.colors[1] }"
                    />
                    <div
                      class="w-1.5 h-1.5 rounded-full"
                      :style="{ background: p.colors[2] }"
                    />
                  </div>
                </div>
              </button>
            </div>

            <!-- Colors -->
            <div class="flex gap-3">
              <div
                v-for="item in colorItems"
                :key="item.key"
                class="flex-1"
              >
                <label class="block">
                  <div class="relative mb-2">
                    <input
                      type="color"
                      :value="theme.colors[item.key]"
                      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      @input="theme.setColor(item.key, ($event.target as HTMLInputElement).value)"
                    >
                    <div
                      class="w-full h-12 rounded-xl ring-2 ring-white/10 hover:ring-white/20 cursor-pointer transition-all"
                      :style="{ background: theme.colors[item.key] }"
                    />
                  </div>
                  <p class="text-xs font-medium text-white/70 text-center">{{ item.label }}</p>
                </label>
              </div>
            </div>

            <!-- Selection -->
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <label class="relative flex-shrink-0">
                <input
                  type="color"
                  :value="theme.colors.selection"
                  :disabled="theme.invertSelection"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  @input="theme.setColor('selection', ($event.target as HTMLInputElement).value)"
                >
                <div
                  class="w-10 h-10 rounded-lg ring-2 ring-white/10"
                  :class="theme.invertSelection ? 'opacity-40' : 'cursor-pointer hover:ring-white/20'"
                  :style="{ background: theme.selectionColor }"
                />
              </label>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-white/80">
                  Selection
                </p>
                <label class="flex items-center gap-2 mt-1 cursor-pointer">
                  <input
                    v-model="theme.invertSelection"
                    type="checkbox"
                    class="w-4 h-4 rounded border-white/20 bg-white/5 accent-violet-500"
                  >
                  <span class="text-xs text-white/50">Auto contrast</span>
                </label>
              </div>
            </div>

            <!-- Live Preview -->
            <div class="p-4 rounded-xl bg-black/30 border border-white/10 space-y-3">
              <div class="flex gap-2 flex-wrap">
                <button
                  class="px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                  :style="{ background: `linear-gradient(135deg, ${theme.colors.accent}, ${theme.colors.secondary})` }"
                >
                  Primary
                </button>
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium border"
                  :style="{ borderColor: theme.colors.accent, color: theme.colors.accent }"
                >
                  Secondary
                </button>
                <span
                  class="px-3 py-1.5 rounded-lg text-xs"
                  :style="{ background: theme.colors.tertiary + '20', color: theme.colors.tertiary }"
                >Badge</span>
              </div>
              <p class="text-xs text-white/60 leading-relaxed">
                Text with <span :style="{ color: theme.colors.accent }">accent</span>,
                <span :style="{ color: theme.colors.secondary }">secondary</span>, and
                <span :style="{ color: theme.colors.tertiary }">tertiary</span> colors.
                <span
                  class="px-1 rounded"
                  :style="previewSelectionStyle"
                >Selected text</span>
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 py-4 border-t border-white/10 flex justify-between">
            <button
              class="text-xs text-white/40 hover:text-white/70 transition-colors"
              @click="theme.resetColors()"
            >
              Reset
            </button>
            <button
              class="px-5 py-2 rounded-xl text-sm font-bold text-white hover:scale-105 transition-all"
              :style="{ background: `linear-gradient(135deg, ${theme.colors.accent}, ${theme.colors.secondary})` }"
              @click="emit('close')"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
