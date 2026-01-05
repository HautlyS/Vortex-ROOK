/**
 * UI Store
 *
 * Pinia store for managing UI state using Composition API (Setup Store syntax).
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/** Panel visibility state */
export interface PanelVisibility {
  pages: boolean
  layers: boolean
  properties: boolean
}

/** Dialog types */
export type DialogType = 'import' | 'export' | 'pageProperties' | 'settings' | null

/** Import progress state */
export interface ImportProgress {
  currentPage: number
  totalPages: number
  status: string
}

/** Notification type */
export interface Notification {
  id: number
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

/** Zoom constraints */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5.0
const DEFAULT_ZOOM = 2.6

let notificationId = 0

export const useUIStore = defineStore('ui', () => {
  // State
  const zoom = ref(DEFAULT_ZOOM)
  const panelVisibility = ref<PanelVisibility>({
    pages: true,
    layers: true,
    properties: true
  })
  const activeDialog = ref<DialogType>(null)
  const isLoading = ref(false)
  const loadingMessage = ref('')
  const importProgress = ref<ImportProgress | null>(null)
  const statusMessage = ref('Ready')
  const notifications = ref<Notification[]>([])

  // Getters
  const zoomPercent = computed(() => Math.round((zoom.value / DEFAULT_ZOOM) * 100))

  const isPagesVisible = computed(() => panelVisibility.value.pages)
  const isLayersVisible = computed(() => panelVisibility.value.layers)
  const isPropertiesVisible = computed(() => panelVisibility.value.properties)

  // Actions

  /**
   * Set zoom level with clamping
   */
  function setZoom(level: number): void {
    zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level))
  }

  /**
   * Zoom in by a step
   */
  function zoomIn(step = 0.1): void {
    setZoom(zoom.value + step)
  }

  /**
   * Zoom out by a step
   */
  function zoomOut(step = 0.1): void {
    setZoom(zoom.value - step)
  }

  /**
   * Reset zoom to default
   */
  function resetZoom(): void {
    zoom.value = DEFAULT_ZOOM
  }

  /**
   * Toggle a panel's visibility
   */
  function togglePanel(panel: keyof PanelVisibility): void {
    panelVisibility.value[panel] = !panelVisibility.value[panel]
  }

  /**
   * Set a panel's visibility
   */
  function setPanel(panel: keyof PanelVisibility, visible: boolean): void {
    panelVisibility.value[panel] = visible
  }

  /**
   * Open a dialog
   */
  function openDialog(dialog: DialogType): void {
    activeDialog.value = dialog
  }

  /**
   * Close the active dialog
   */
  function closeDialog(): void {
    activeDialog.value = null
  }

  /**
   * Set loading state
   */
  function setLoading(loading: boolean, message = ''): void {
    isLoading.value = loading
    loadingMessage.value = message
  }

  /**
   * Update import progress
   */
  function updateImportProgress(progress: ImportProgress | null): void {
    importProgress.value = progress
  }

  /**
   * Set status bar message
   */
  function setStatus(message: string): void {
    statusMessage.value = message
  }

  /**
   * Show a notification
   */
  function showNotification(type: Notification['type'], message: string, duration = 4000): void {
    const id = ++notificationId
    notifications.value.push({ id, type, message })

    if (duration > 0) {
      setTimeout(() => {
        dismissNotification(id)
      }, duration)
    }
  }

  /**
   * Dismiss a notification
   */
  function dismissNotification(id: number): void {
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  return {
    // State
    zoom,
    panelVisibility,
    activeDialog,
    isLoading,
    loadingMessage,
    importProgress,
    statusMessage,
    notifications,

    // Getters
    zoomPercent,
    isPagesVisible,
    isLayersVisible,
    isPropertiesVisible,

    // Actions
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    togglePanel,
    setPanel,
    openDialog,
    closeDialog,
    setLoading,
    updateImportProgress,
    setStatus,
    showNotification,
    dismissNotification
  }
})
