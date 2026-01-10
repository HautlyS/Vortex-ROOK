<script setup lang="ts">
import { useTypography } from '@/composables/useTypography'

const { applyPreset, state } = useTypography()

const quickStyles = [
  { name: 'H1', style: { fontSize: 32, fontWeight: 700, lineHeight: 1.2 } },
  { name: 'H2', style: { fontSize: 24, fontWeight: 600, lineHeight: 1.3 } },
  { name: 'H3', style: { fontSize: 20, fontWeight: 600, lineHeight: 1.4 } },
  { name: 'Body', style: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 } },
  { name: 'Small', style: { fontSize: 12, fontWeight: 400, lineHeight: 1.4 } }
]
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      v-for="preset in quickStyles"
      :key="preset.name"
      :class="[
        'glass-btn text-xs px-2 py-1',
        state.fontSize === preset.style.fontSize && 
          state.fontWeight === preset.style.fontWeight && 
          'bg-violet-500/20 text-violet-300'
      ]"
      :title="`Apply ${preset.name} style`"
      @click="applyPreset(preset.style)"
    >
      {{ preset.name }}
    </button>
  </div>
</template>
