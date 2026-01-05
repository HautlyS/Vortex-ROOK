/**
 * Document Store
 *
 * Pinia store for managing document state using Composition API (Setup Store syntax).
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  importDocumentWithAnalysis,
  saveProject as bridgeSave,
  loadProject as bridgeLoad,
  isTauri
} from '@/bridge'
import type { BookProjectData as BridgeBookProject, PdfAnalysis } from '@/bridge'
import type {
  BookProjectData,
  PageData,
  LayerObject,
  LayerUpdates,
  HistoryEntry,
  SourceInfo,
  LayerRole,
  DocumentData
} from '@/models'
import { createEmptyProject, createDefaultMetadata } from '@/models'

/** Maximum history entries to prevent memory issues */
const MAX_HISTORY_ENTRIES = 50

export const useDocumentStore = defineStore('document', () => {
  // State
  const document = ref<BookProjectData | null>(null)
  const currentPageIndex = ref(0)
  const selectedLayerIds = ref<string[]>([])
  const undoStack = ref<HistoryEntry[]>([])
  const redoStack = ref<HistoryEntry[]>([])
  const sourceFile = ref<SourceInfo | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  // PDF Analysis state
  const pdfAnalysis = ref<PdfAnalysis | null>(null)
  const isAnalysisDismissed = ref(false)

  // Getters
  const currentPage = computed<PageData | null>(() => {
    if (!document.value) return null
    return document.value.document.pages[currentPageIndex.value] ?? null
  })

  const totalPages = computed(() => document.value?.document.pages.length ?? 0)
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  const selectedLayers = computed<LayerObject[]>(() => {
    if (!currentPage.value) return []
    return currentPage.value.layers.filter((layer) => selectedLayerIds.value.includes(layer.id))
  })

  const hasDocument = computed(() => document.value !== null)
  
  /** Whether to show PDF analysis bar */
  const showAnalysisBar = computed(() => 
    pdfAnalysis.value !== null && 
    !isAnalysisDismissed.value &&
    pdfAnalysis.value.recommendation !== 'none'
  )

  // Actions

  function clearDocumentState(): void {
    selectedLayerIds.value = []
    undoStack.value = []
    redoStack.value = []
    pdfAnalysis.value = null
    isAnalysisDismissed.value = false
  }

  function transformToBookProject(
    data: DocumentData,
    fileName: string
  ): BookProjectData {
    const project = createEmptyProject()
    project.document = data
    project.metadata = {
      ...createDefaultMetadata(),
      title: fileName.replace(/\.[^/.]+$/, '') ?? 'Untitled'
    }
    return project
  }

  /**
   * Import a document with PDF analysis (works in both Tauri and Web)
   */
  async function importDocument(
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<boolean> {
    isLoading.value = true
    error.value = null
    clearDocumentState()

    try {
      const result = await importDocumentWithAnalysis(onProgress)

      if (result.success && result.data) {
        document.value = transformToBookProject(result.data as unknown as DocumentData, 'Imported Document')
        currentPageIndex.value = 0
        sourceFile.value = {
          path: '',
          type: 'pdf',
          name: 'Imported Document'
        }
        
        // Store PDF analysis if available
        if ('analysis' in result && result.analysis) {
          pdfAnalysis.value = result.analysis
        }
        
        return true
      } else {
        error.value = result.message
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }
  
  /** Dismiss the PDF analysis bar */
  function dismissAnalysis(): void {
    isAnalysisDismissed.value = true
  }
  
  /** Get current PDF analysis */
  function getAnalysis(): PdfAnalysis | null {
    return pdfAnalysis.value
  }

  /**
   * Save project using bridge
   */
  async function saveProject(): Promise<{ success: boolean; message: string }> {
    if (!document.value) return { success: false, message: 'No document to save' }

    isLoading.value = true
    try {
      const result = await bridgeSave(document.value as unknown as BridgeBookProject)
      return result
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Load project using bridge
   */
  async function openProject(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const project = await bridgeLoad()
      if (project) {
        closeDocument()
        // Cast bridge types to model types
        document.value = project as unknown as BookProjectData
        currentPageIndex.value = 0
        sourceFile.value = {
          path: '',
          type: 'pdf',
          name: project.metadata?.title || 'Loaded Project'
        }
        return true
      }
      return false
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  function updateLayer(pageIndex: number, layerId: string, updates: LayerUpdates): void {
    if (!document.value) return

    const page = document.value.document.pages[pageIndex]
    if (!page) return

    const layerIndex = page.layers.findIndex((l) => l.id === layerId)
    if (layerIndex === -1) return

    const layer = page.layers[layerIndex]
    if (layer.locked && !('locked' in updates)) return

    pushHistory({
      type: 'layer_update',
      timestamp: new Date().toISOString(),
      pageIndex,
      layerId,
      previousState: { ...layer },
      newState: { ...layer, ...updates }
    })

    Object.assign(layer, updates)
    if (document.value.metadata) {
      document.value.metadata.modified = new Date().toISOString()
    }
  }

  function addLayer(pageIndex: number, layer: LayerObject): void {
    if (!document.value) return

    const page = document.value.document.pages[pageIndex]
    if (!page) return

    pushHistory({
      type: 'layer_add',
      timestamp: new Date().toISOString(),
      pageIndex,
      layerId: layer.id,
      previousState: null,
      newState: { ...layer }
    })

    page.layers.push(layer)
  }

  function deleteLayer(pageIndex: number, layerId: string): void {
    if (!document.value) return

    const page = document.value.document.pages[pageIndex]
    if (!page) return

    const layerIndex = page.layers.findIndex((l) => l.id === layerId)
    if (layerIndex === -1) return

    const layer = page.layers[layerIndex]
    if (layer.locked) return

    pushHistory({
      type: 'layer_delete',
      timestamp: new Date().toISOString(),
      pageIndex,
      layerId,
      previousState: { ...layer },
      newState: null
    })

    page.layers.splice(layerIndex, 1)
    selectedLayerIds.value = selectedLayerIds.value.filter((id) => id !== layerId)
  }

  function selectLayer(layerId: string, addToSelection = false): void {
    if (addToSelection) {
      if (!selectedLayerIds.value.includes(layerId)) {
        selectedLayerIds.value.push(layerId)
      }
    } else {
      selectedLayerIds.value = [layerId]
    }
  }

  function selectLayers(layerIds: string[]): void {
    selectedLayerIds.value = [...layerIds]
  }

  function deselectAll(): void {
    selectedLayerIds.value = []
  }

  function goToPage(pageIndex: number): void {
    if (!document.value) return
    
    const maxPage = document.value.document.pages.length - 1
    const clampedIndex = Math.max(0, Math.min(pageIndex, maxPage))
    
    currentPageIndex.value = clampedIndex
    selectedLayerIds.value = []
  }

  function pushHistory(entry: HistoryEntry): void {
    undoStack.value.push(entry)
    redoStack.value = []

    while (undoStack.value.length > MAX_HISTORY_ENTRIES) {
      undoStack.value.shift()
    }
  }

  function undo(): void {
    if (!canUndo.value || !document.value) return

    const entry = undoStack.value.pop()!
    redoStack.value.push(entry)
    applyHistoryEntry(entry, 'undo')
  }

  function redo(): void {
    if (!canRedo.value || !document.value) return

    const entry = redoStack.value.pop()!
    undoStack.value.push(entry)
    applyHistoryEntry(entry, 'redo')
  }

  function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo'): void {
    if (!document.value || entry.pageIndex === undefined) return

    const page = document.value.document.pages[entry.pageIndex]
    if (!page) return

    const state = direction === 'undo' ? entry.previousState : entry.newState

    switch (entry.type) {
      case 'layer_update':
        if (entry.layerId && state) {
          const layerIndex = page.layers.findIndex((l) => l.id === entry.layerId)
          if (layerIndex !== -1) {
            page.layers[layerIndex] = state as LayerObject
          }
        }
        break

      case 'layer_add':
        if (direction === 'undo') {
          const idx = page.layers.findIndex((l) => l.id === entry.layerId)
          if (idx !== -1) page.layers.splice(idx, 1)
        } else {
          if (state) page.layers.push(state as LayerObject)
        }
        break

      case 'layer_delete':
        if (direction === 'undo') {
          if (entry.previousState) page.layers.push(entry.previousState as LayerObject)
        } else {
          const idx = page.layers.findIndex((l) => l.id === entry.layerId)
          if (idx !== -1) page.layers.splice(idx, 1)
        }
        break
    }
  }

  function newDocument(): void {
    closeDocument()
    document.value = createEmptyProject()
  }

  function closeDocument(): void {
    // Clear image cache on backend (Tauri only)
    if (isTauri()) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('clear_image_cache').catch(() => {})
      })
    }

    document.value = null
    currentPageIndex.value = 0
    selectedLayerIds.value = []
    undoStack.value = []
    redoStack.value = []
    sourceFile.value = null
    error.value = null
  }

  function loadProject(project: BookProjectData, filePath: string): void {
    closeDocument()
    document.value = project
    currentPageIndex.value = 0
    sourceFile.value = {
      path: filePath,
      type: 'pdf',
      name: filePath.split('/').pop() ?? filePath
    }
    error.value = null
  }

  function addPage(atIndex?: number): void {
    if (!document.value) return

    const pages = document.value.document.pages
    const insertAt = atIndex ?? pages.length
    const newPage: PageData = {
      pageIndex: insertAt,
      width: document.value.document.pageWidth,
      height: document.value.document.pageHeight,
      layers: []
    }

    pushHistory({
      type: 'page_add',
      timestamp: new Date().toISOString(),
      pageIndex: insertAt,
      previousState: null,
      newState: { ...newPage }
    })

    pages.splice(insertAt, 0, newPage)
    pages.forEach((p, i) => (p.pageIndex = i))
    currentPageIndex.value = insertAt
  }

  function duplicatePage(pageIndex: number): void {
    if (!document.value) return

    const pages = document.value.document.pages
    const sourcePage = pages[pageIndex]
    if (!sourcePage) return

    const newPage: PageData = {
      pageIndex: pageIndex + 1,
      width: sourcePage.width,
      height: sourcePage.height,
      layers: sourcePage.layers.map((layer, i) => ({
        ...layer,
        id: `${layer.type}-${pageIndex + 1}-${i}`
      }))
    }

    pushHistory({
      type: 'page_add',
      timestamp: new Date().toISOString(),
      pageIndex: pageIndex + 1,
      previousState: null,
      newState: { ...newPage }
    })

    pages.splice(pageIndex + 1, 0, newPage)
    pages.forEach((p, i) => (p.pageIndex = i))
    currentPageIndex.value = pageIndex + 1
  }

  function deletePage(pageIndex: number): void {
    if (!document.value) return
    if (document.value.document.pages.length <= 1) return

    const pages = document.value.document.pages
    const deletedPage = pages[pageIndex]

    pushHistory({
      type: 'page_delete',
      timestamp: new Date().toISOString(),
      pageIndex,
      previousState: { ...deletedPage },
      newState: null
    })

    pages.splice(pageIndex, 1)
    pages.forEach((p, i) => (p.pageIndex = i))

    if (currentPageIndex.value >= pages.length) {
      currentPageIndex.value = pages.length - 1
    }
    selectedLayerIds.value = []
  }

  function reorderPage(fromIndex: number, toIndex: number): void {
    if (!document.value) return

    const pages = document.value.document.pages
    if (fromIndex < 0 || fromIndex >= pages.length) return
    if (toIndex < 0 || toIndex >= pages.length) return
    if (fromIndex === toIndex) return

    const previousOrder = pages.map((p) => p.pageIndex)

    const [movedPage] = pages.splice(fromIndex, 1)
    pages.splice(toIndex, 0, movedPage)
    pages.forEach((p, i) => (p.pageIndex = i))

    pushHistory({
      type: 'page_reorder',
      timestamp: new Date().toISOString(),
      previousState: previousOrder,
      newState: pages.map((p) => p.pageIndex)
    })

    if (currentPageIndex.value === fromIndex) {
      currentPageIndex.value = toIndex
    } else if (fromIndex < currentPageIndex.value && toIndex >= currentPageIndex.value) {
      currentPageIndex.value--
    } else if (fromIndex > currentPageIndex.value && toIndex <= currentPageIndex.value) {
      currentPageIndex.value++
    }
  }

  function setLayerRole(pageIndex: number, layerId: string, role: LayerRole): void {
    if (!document.value) return

    const page = document.value.document.pages[pageIndex]
    if (!page) return

    const layer = page.layers.find((l) => l.id === layerId)
    if (!layer) return

    pushHistory({
      type: 'layer_update',
      timestamp: new Date().toISOString(),
      pageIndex,
      layerId,
      previousState: { ...layer },
      newState: { ...layer, role }
    })

    layer.role = role
  }

  function applyHeaderFooterToRange(
    sourcePageIndex: number,
    layerId: string,
    startPage: number,
    endPage: number
  ): void {
    if (!document.value) return

    const sourcePage = document.value.document.pages[sourcePageIndex]
    if (!sourcePage) return

    const sourceLayer = sourcePage.layers.find((l) => l.id === layerId)
    if (!sourceLayer || (sourceLayer.role !== 'header' && sourceLayer.role !== 'footer')) return

    for (let i = startPage; i <= endPage && i < document.value.document.pages.length; i++) {
      if (i === sourcePageIndex) continue

      const targetPage: PageData = document.value.document.pages[i]
      const existingIndex = targetPage.layers.findIndex(
        (l: LayerObject) => l.role === sourceLayer.role && l.sourceType === 'imported'
      )

      const newLayer: LayerObject = {
        ...sourceLayer,
        id: `${sourceLayer.type}-${i}-hf-${Date.now()}`,
        sourceType: 'imported' as const
      }

      if (existingIndex >= 0) {
        targetPage.layers[existingIndex] = newLayer
      } else {
        targetPage.layers.push(newLayer)
      }
    }
  }

  // Additional navigation methods
  function nextPage(): void {
    if (!document.value) return
    if (currentPageIndex.value < document.value.document.pages.length - 1) {
      currentPageIndex.value++
      selectedLayerIds.value = []
    }
  }

  function previousPage(): void {
    if (!document.value) return
    if (currentPageIndex.value > 0) {
      currentPageIndex.value--
      selectedLayerIds.value = []
    }
  }

  // Layer selection helpers
  function deselectLayer(layerId: string): void {
    selectedLayerIds.value = selectedLayerIds.value.filter(id => id !== layerId)
  }

  function clearSelection(): void {
    selectedLayerIds.value = []
  }

  // Layer manipulation
  function duplicateLayer(pageIndex: number, layerId: string): LayerObject | null {
    if (!document.value) return null

    const page = document.value.document.pages[pageIndex]
    if (!page) return null

    const layer = page.layers.find(l => l.id === layerId)
    if (!layer) return null

    const newLayer: LayerObject = {
      ...layer,
      id: `${layer.type}-${pageIndex}-${Date.now()}`,
      bounds: {
        ...layer.bounds,
        x: layer.bounds.x + 10,
        y: layer.bounds.y + 10
      }
    }

    pushHistory({
      type: 'layer_add',
      timestamp: new Date().toISOString(),
      pageIndex,
      layerId: newLayer.id,
      previousState: null,
      newState: { ...newLayer }
    })

    page.layers.push(newLayer)
    return newLayer
  }

  function moveLayerUp(pageIndex: number, layerId: string): void {
    if (!document.value) return

    const page = document.value.document.pages[pageIndex]
    if (!page) return

    const layerIndex = page.layers.findIndex(l => l.id === layerId)
    if (layerIndex === -1 || layerIndex >= page.layers.length - 1) return

    const layer = page.layers[layerIndex]
    const nextLayer = page.layers[layerIndex + 1]

    // Swap zIndex
    const tempZ = layer.zIndex
    layer.zIndex = nextLayer.zIndex
    nextLayer.zIndex = tempZ

    // Swap positions in array
    page.layers[layerIndex] = nextLayer
    page.layers[layerIndex + 1] = layer
  }

  function moveLayerDown(pageIndex: number, layerId: string): void {
    if (!document.value) return

    const page = document.value.document.pages[pageIndex]
    if (!page) return

    const layerIndex = page.layers.findIndex(l => l.id === layerId)
    if (layerIndex <= 0) return

    const layer = page.layers[layerIndex]
    const prevLayer = page.layers[layerIndex - 1]

    // Swap zIndex
    const tempZ = layer.zIndex
    layer.zIndex = prevLayer.zIndex
    prevLayer.zIndex = tempZ

    // Swap positions in array
    page.layers[layerIndex] = prevLayer
    page.layers[layerIndex - 1] = layer
  }

  return {
    // State
    document,
    currentPageIndex,
    selectedLayerIds,
    undoStack,
    redoStack,
    sourceFile,
    isLoading,
    error,
    pdfAnalysis,

    // Getters
    currentPage,
    totalPages,
    canUndo,
    canRedo,
    selectedLayers,
    hasDocument,
    showAnalysisBar,

    // Actions
    importDocument,
    saveProject,
    openProject,
    updateLayer,
    addLayer,
    deleteLayer,
    selectLayer,
    selectLayers,
    deselectAll,
    deselectLayer,
    clearSelection,
    goToPage,
    nextPage,
    previousPage,
    undo,
    redo,
    newDocument,
    closeDocument,
    loadProject,
    addPage,
    duplicatePage,
    duplicateLayer,
    deletePage,
    reorderPage,
    setLayerRole,
    applyHeaderFooterToRange,
    dismissAnalysis,
    getAnalysis,
    moveLayerUp,
    moveLayerDown
  }
})
