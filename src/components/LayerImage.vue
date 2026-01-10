<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getImageUrl, extractImageId } from '@/composables/useImageLoader'

const props = defineProps<{
  src: string
  width: number
  height: number
}>()

const blobUrl = ref<string | null>(null)
const loading = ref(true)
const error = ref(false)

async function loadImage() {
  const imageId = extractImageId(props.src)
  if (!imageId) {
    error.value = true
    loading.value = false
    return
  }

  loading.value = true
  error.value = false

  try {
    const url = await getImageUrl(imageId)
    blobUrl.value = url
    error.value = !url
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadImage)

watch(() => props.src, loadImage)
</script>

<template>
  <div 
    class="relative overflow-hidden"
    :style="{ width: `${width}px`, height: `${height}px` }"
  >
    <!-- Loading state -->
    <div 
      v-if="loading" 
      class="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center"
    >
      <svg
        class="w-6 h-6 text-gray-300 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
    
    <!-- Error state -->
    <div 
      v-else-if="error || !blobUrl" 
      class="absolute inset-0 bg-gray-200 flex items-center justify-center border border-gray-300"
    >
      <svg
        class="w-6 h-6 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
    
    <!-- Image -->
    <img 
      v-else
      :src="blobUrl"
      :style="{ width: `${width}px`, height: `${height}px`, objectFit: 'contain' }"
      class="block"
    >
  </div>
</template>
