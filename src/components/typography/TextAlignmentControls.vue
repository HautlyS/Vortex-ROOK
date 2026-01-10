<script setup lang="ts">
import { useTypography } from '@/composables/useTypography'

const { state, applyFormat } = useTypography()

const alignments = [
  { value: 'left', icon: 'M4 6h16M4 12h8m-8 6h16', title: 'Align Left' },
  { value: 'center', icon: 'M4 6h16M8 12h8M6 18h12', title: 'Align Center' },
  { value: 'right', icon: 'M4 6h16M12 12h8M6 18h16', title: 'Align Right' },
  { value: 'justify', icon: 'M4 6h16M4 12h16M4 18h16', title: 'Justify' }
]

function setAlignment(align: string) {
  applyFormat({ textAlign: align as any })
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      v-for="alignment in alignments"
      :key="alignment.value"
      :class="[
        'glass-btn-icon',
        state.textAlign === alignment.value && 'bg-violet-500/20 text-violet-300 shadow-glow-sm'
      ]"
      :title="alignment.title"
      @click="setAlignment(alignment.value)"
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
          :d="alignment.icon"
        />
      </svg>
    </button>
  </div>
</template>
