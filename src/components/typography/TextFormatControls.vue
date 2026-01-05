<script setup lang="ts">
import { useTypography } from '@/composables/useTypography'

const { state, applyFormat, toggleDecoration } = useTypography()

function toggleBold() {
  applyFormat({ fontWeight: state.value.fontWeight >= 600 ? 400 : 700 })
}

function toggleItalic() {
  applyFormat({ fontStyle: state.value.fontStyle === 'italic' ? 'normal' : 'italic' })
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      @click="toggleBold"
      :class="[
        'glass-btn-icon font-bold text-sm',
        state.fontWeight >= 600 && 'bg-violet-500/20 text-violet-300 shadow-glow-sm'
      ]"
      title="Bold (Ctrl+B)"
    >
      B
    </button>
    
    <button
      @click="toggleItalic"
      :class="[
        'glass-btn-icon italic text-sm',
        state.fontStyle === 'italic' && 'bg-violet-500/20 text-violet-300 shadow-glow-sm'
      ]"
      title="Italic (Ctrl+I)"
    >
      I
    </button>
    
    <button
      @click="toggleDecoration('underline')"
      :class="[
        'glass-btn-icon underline text-sm',
        state.textDecoration.has('underline') && 'bg-violet-500/20 text-violet-300 shadow-glow-sm'
      ]"
      title="Underline (Ctrl+U)"
    >
      U
    </button>
    
    <button
      @click="toggleDecoration('line-through')"
      :class="[
        'glass-btn-icon line-through text-sm',
        state.textDecoration.has('line-through') && 'bg-violet-500/20 text-violet-300 shadow-glow-sm'
      ]"
      title="Strikethrough"
    >
      S
    </button>
  </div>
</template>
