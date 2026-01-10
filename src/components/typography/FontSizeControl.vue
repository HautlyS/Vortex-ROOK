<script setup lang="ts">
import { useTypography } from '@/composables/useTypography'

const { state, applyFormat } = useTypography()

const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96]

function adjustSize(delta: number) {
  const newSize = Math.max(8, Math.min(200, state.value.fontSize + delta))
  applyFormat({ fontSize: newSize })
}

function setSize(size: number) {
  applyFormat({ fontSize: size })
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      class="glass-btn-icon group"
      title="Decrease size"
      @click="adjustSize(-1)"
    >
      <svg
        class="w-4 h-4 group-hover:scale-110 transition-transform"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20 12H4"
        />
      </svg>
    </button>
    
    <select
      :value="state.fontSize"
      class="glass-select w-16 text-center text-sm"
      @change="setSize(Number(($event.target as HTMLSelectElement).value))"
    >
      <option
        v-for="size in sizes"
        :key="size"
        :value="size"
      >
        {{ size }}
      </option>
    </select>
    
    <button
      class="glass-btn-icon group"
      title="Increase size"
      @click="adjustSize(1)"
    >
      <svg
        class="w-4 h-4 group-hover:scale-110 transition-transform"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 4v16m8-8H4"
        />
      </svg>
    </button>
  </div>
</template>
