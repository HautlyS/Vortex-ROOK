<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTypography } from '@/composables/useTypography'
import FontSelector from './typography/FontSelector.vue'
import FontSizeControl from './typography/FontSizeControl.vue'
import TextFormatControls from './typography/TextFormatControls.vue'
import TextAlignmentControls from './typography/TextAlignmentControls.vue'
import ColorControls from './typography/ColorControls.vue'
import TextPresets from './typography/TextPresets.vue'
import AdvancedTypographyPanel from './typography/AdvancedTypographyPanel.vue'

const { hasTextLayer, handleKeyboard } = useTypography()

onMounted(() => {
  document.addEventListener('keydown', handleKeyboard)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
})
</script>

<template>
  <div 
    v-if="hasTextLayer"
    class="glass-panel rounded-2xl p-3 backdrop-blur-2xl border border-white/[0.08]"
    @click.stop
  >
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Quick Presets -->
      <TextPresets />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Font Controls -->
      <FontSelector />
      <FontSizeControl />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Format Controls -->
      <TextFormatControls />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Alignment -->
      <TextAlignmentControls />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Colors -->
      <ColorControls />
      
      <!-- Advanced -->
      <AdvancedTypographyPanel />
    </div>
  </div>
</template>

<template>
  <div 
    v-if="hasTextLayer"
    class="glass-panel rounded-2xl p-3 backdrop-blur-2xl border border-white/[0.08]"
    @click.stop
  >
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Quick Presets -->
      <TextPresets />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Font Controls -->
      <FontSelector />
      <FontSizeControl />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Format Controls -->
      <TextFormatControls />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Alignment -->
      <TextAlignmentControls />
      
      <div class="glass-divider-v h-6" />
      
      <!-- Colors -->
      <ColorControls />
      
      <!-- Advanced -->
      <AdvancedTypographyPanel />
    </div>
  </div>
</template>

<style scoped>
.glass-divider-v {
  width: 1px;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.1), transparent);
}
</style>
