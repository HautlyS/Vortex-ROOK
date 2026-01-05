/**
 * Theme Store - Manages app theme customization
 */
import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'

export interface ThemeColors {
  accent: string
  secondary: string
  tertiary: string
  selection: string
}

const DEFAULT_COLORS: ThemeColors = {
  accent: '#a78bfa',
  secondary: '#f472b6', 
  tertiary: '#67e8f9',
  selection: '#a78bfa'
}

const STORAGE_KEY = 'rook-theme'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export const useThemeStore = defineStore('theme', () => {
  const colors = ref<ThemeColors>({ ...DEFAULT_COLORS })
  const invertSelection = ref(false)

  // Load from localStorage
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      colors.value = { ...DEFAULT_COLORS, ...parsed.colors }
      invertSelection.value = parsed.invertSelection ?? false
    } catch { /* ignore */ }
  }

  const selectionColor = computed(() => {
    if (invertSelection.value) {
      return getContrastColor(colors.value.accent)
    }
    return colors.value.selection
  })

  const selectionRgb = computed(() => {
    const rgb = hexToRgb(selectionColor.value)
    return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '167, 139, 250'
  })

  const cssVariables = computed(() => ({
    '--theme-accent': colors.value.accent,
    '--theme-secondary': colors.value.secondary,
    '--theme-tertiary': colors.value.tertiary,
    '--theme-selection': selectionColor.value,
    '--theme-selection-rgb': selectionRgb.value,
    '--theme-accent-rgb': hexToRgb(colors.value.accent) 
      ? `${hexToRgb(colors.value.accent)!.r}, ${hexToRgb(colors.value.accent)!.g}, ${hexToRgb(colors.value.accent)!.b}` 
      : '167, 139, 250',
    '--theme-secondary-rgb': hexToRgb(colors.value.secondary)
      ? `${hexToRgb(colors.value.secondary)!.r}, ${hexToRgb(colors.value.secondary)!.g}, ${hexToRgb(colors.value.secondary)!.b}`
      : '244, 114, 182',
    '--theme-tertiary-rgb': hexToRgb(colors.value.tertiary)
      ? `${hexToRgb(colors.value.tertiary)!.r}, ${hexToRgb(colors.value.tertiary)!.g}, ${hexToRgb(colors.value.tertiary)!.b}`
      : '103, 232, 249'
  }))

  function setColor(key: keyof ThemeColors, value: string) {
    colors.value[key] = value
  }

  function resetColors() {
    colors.value = { ...DEFAULT_COLORS }
    invertSelection.value = false
  }

  // Persist to localStorage
  watch([colors, invertSelection], () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      colors: colors.value,
      invertSelection: invertSelection.value
    }))
  }, { deep: true })

  // Apply CSS variables to document
  watch(cssVariables, (vars) => {
    Object.entries(vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value)
    })
  }, { immediate: true })

  return {
    colors,
    invertSelection,
    selectionColor,
    cssVariables,
    setColor,
    resetColors
  }
})
