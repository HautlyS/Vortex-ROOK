/**
 * Image Cache Composable
 * Handles images from both Tauri backend and web blob URLs
 */

import { ref, reactive } from 'vue'
import { isTauri } from '@/bridge/environment'

// Cache for image blob URLs (Tauri mode only)
const imageCache = reactive<Map<string, string>>(new Map())
const loadingImages = reactive<Set<string>>(new Set())

/**
 * Check if URL is already a usable blob/data URL
 */
export function isDirectUrl(url: string): boolean {
  if (!url) return false
  return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http')
}

/**
 * Get image URL - handles both Tauri and web modes
 */
export async function getImageUrl(imageIdOrUrl: string): Promise<string | null> {
  if (!imageIdOrUrl) return null
  
  // If it's already a blob/data URL, use it directly (web mode)
  if (isDirectUrl(imageIdOrUrl)) {
    return imageIdOrUrl
  }
  
  // Extract ID from image:// or tauri:// URL
  const imageId = extractImageId(imageIdOrUrl)
  if (!imageId) return null
  
  // Check cache first
  if (imageCache.has(imageId)) {
    return imageCache.get(imageId) || null
  }

  // Already loading
  if (loadingImages.has(imageId)) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!loadingImages.has(imageId)) {
          clearInterval(check)
          resolve(imageCache.get(imageId) || null)
        }
      }, 50)
    })
  }

  // Only fetch from Tauri backend if in Tauri mode
  if (!isTauri()) {
    console.warn(`Cannot load image ${imageId} in web mode without blob URL`)
    return null
  }

  loadingImages.add(imageId)

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const data = await invoke<ArrayBuffer>('get_image', { imageId })
    
    if (!data || data.byteLength === 0) {
      loadingImages.delete(imageId)
      return null
    }

    const blob = new Blob([data], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    
    imageCache.set(imageId, url)
    loadingImages.delete(imageId)
    
    return url
  } catch (error) {
    console.error(`Failed to load image ${imageId}:`, error)
    loadingImages.delete(imageId)
    return null
  }
}

/**
 * Extract image ID from image:// or tauri:// URL
 */
export function extractImageId(url: string): string | null {
  if (!url) return null
  
  // Already a blob/data URL - return as-is (it IS the URL)
  if (isDirectUrl(url)) return url
  
  // Handle image://{id} format (from Tauri backend)
  if (url.startsWith('image://')) {
    return url.slice(8)
  }
  
  // Handle tauri://localhost/image/{id} format
  const match = url.match(/tauri:\/\/localhost\/image\/(.+)/)
  if (match) return match[1]
  
  // Handle direct ID (no protocol)
  if (!url.includes('://')) return url
  
  return null
}

/**
 * Clear image cache (call when document is closed)
 */
export function clearImageCache(): void {
  for (const url of imageCache.values()) {
    URL.revokeObjectURL(url)
  }
  imageCache.clear()
  loadingImages.clear()
}

/**
 * Composable for image loading
 */
export function useImageLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadImage(imageUrl: string): Promise<string | null> {
    if (!imageUrl) return null
    
    // Direct URLs can be used immediately
    if (isDirectUrl(imageUrl)) return imageUrl

    loading.value = true
    error.value = null

    try {
      return await getImageUrl(imageUrl)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load image'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    loadImage,
    getImageUrl,
    extractImageId,
    clearImageCache,
    isDirectUrl
  }
}
