<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { useDocumentStore } from '@/stores/documentStore'
  import { useUIStore } from '@/stores/uiStore'
  import { exportDocument, isTauri, pickFile } from '@/bridge'
  import type { ExportOptions, ImportOptions } from '@/bridge'
  import { DecryptedText } from './extra'
  import SettingsDialog from './SettingsDialog.vue'
  import ImportOptionsDialog from './ImportOptionsDialog.vue'

  defineProps<{
    isMobile?: boolean
  }>()

  defineEmits<{
    (e: 'toggle-drawer', drawer: 'pages' | 'layers' | 'properties'): void
  }>()

  const documentStore = useDocumentStore()
  const uiStore = useUIStore()

  const canUndo = computed(() => documentStore.canUndo)
  const canRedo = computed(() => documentStore.canRedo)
  const hasDocument = computed(() => documentStore.hasDocument)
  const zoomPercent = computed(() => uiStore.zoomPercent)
  const totalPages = computed(() => documentStore.totalPages)

  const showExportDialog = ref(false)
  const showImportDialog = ref(false)
  const pendingImportFile = ref<{ name: string; data: Uint8Array } | null>(null)
  const showMobileMenu = ref(false)
  const showSettings = ref(false)
  const exportFormat = ref<'pdf' | 'docx' | 'png'>('docx')
  const exportFilename = ref('')
  const exportQuality = ref(0.92)
  const pngScale = ref(2)
  const pageRangeEnabled = ref(false)
  const pageStart = ref(1)
  const pageEnd = ref(1)

  // Reset filename when dialog opens
  watch(showExportDialog, (open) => {
    if (open) {
      exportFilename.value = documentStore.document?.metadata?.title || 'document'
      pageEnd.value = totalPages.value
    }
  })

  async function handleImport() {
    // Pick file first, then show options dialog
    const file = await pickFile({ accept: ['.pdf', '.docx'] })
    if (!file) return
    
    pendingImportFile.value = file
    showImportDialog.value = true
  }

  async function handleImportConfirm(options: ImportOptions) {
    showImportDialog.value = false
    const file = pendingImportFile.value
    pendingImportFile.value = null
    
    if (!file) return
    
    uiStore.setLoading(true, 'Importing document...')
    const success = await documentStore.importDocument(options, file, (current, total, status) => {
      uiStore.updateImportProgress({ currentPage: current, totalPages: total, status })
    })
    uiStore.updateImportProgress(null)
    uiStore.setLoading(false)
    if (success) {
      uiStore.setStatus('Document imported')
    } else {
      uiStore.setStatus('Import failed')
      if (documentStore.error) {
        uiStore.showNotification('error', documentStore.error)
      }
    }
  }

  async function handleOpenProject() {
    uiStore.setLoading(true, 'Loading project...')
    const success = await documentStore.openProject()
    uiStore.setLoading(false)
    if (success) {
      uiStore.setStatus(`Loaded: ${documentStore.sourceFile?.name}`)
    } else if (documentStore.error) {
      uiStore.showNotification('error', documentStore.error)
    }
  }

  async function handleSaveProject() {
    if (!hasDocument.value) return
    uiStore.setLoading(true, 'Saving project...')
    const result = await documentStore.saveProject()
    uiStore.setLoading(false)
    if (result.success) {
      uiStore.showNotification('success', 'Project saved')
    } else {
      uiStore.showNotification('error', result.message)
    }
  }

  function openExportDialog() {
    if (!hasDocument.value) return
    showExportDialog.value = true
  }

  async function handleExport() {
    if (!hasDocument.value || !documentStore.document) return

    showExportDialog.value = false
    uiStore.setLoading(true, `Exporting to ${exportFormat.value.toUpperCase()}...`)

    const options: ExportOptions = {
      format: exportFormat.value,
      filename: exportFilename.value || 'document',
      imageQuality: exportQuality.value,
      pngScale: pngScale.value,
      zipMultiple: true
    }

    if (pageRangeEnabled.value) {
      options.pageRange = [pageStart.value - 1, pageEnd.value - 1]
    }

    const result = await exportDocument(
      documentStore.document.document.pages as Parameters<typeof exportDocument>[0],
      documentStore.document.metadata as Parameters<typeof exportDocument>[1],
      options,
      (current, total, status) => {
        uiStore.updateImportProgress({ currentPage: current, totalPages: total, status })
      }
    )

    uiStore.updateImportProgress(null)
    uiStore.setLoading(false)

    if (result.success) {
      uiStore.showNotification('success', result.message || 'Export completed')
    } else {
      uiStore.showNotification('error', result.message)
    }
  }

  const formatOptions = computed(() => [
    { id: 'docx', label: 'DOCX', desc: 'Word Document', color: 'cyan', available: true },
    {
      id: 'png',
      label: 'PNG',
      desc: totalPages.value > 1 ? 'ZIP Archive' : 'Image',
      color: 'emerald',
      available: true
    },
    {
      id: 'pdf',
      label: 'PDF',
      desc: isTauri() ? 'Document' : 'Desktop only',
      color: 'violet',
      available: isTauri()
    }
  ])

  async function handleAddWatermark() {
    if (!hasDocument.value) return

    uiStore.setLoading(true, 'Creating watermark layer...')
    try {
      const pageWidth = documentStore.document?.document.pageWidth || 612
      const pageHeight = documentStore.document?.document.pageHeight || 792
      const newLayer = {
        id: `watermark-${Date.now()}`,
        type: 'watermark' as const,
        bounds: { x: pageWidth / 2 - 50, y: pageHeight / 2 - 50, width: 100, height: 100 },
        visible: true,
        locked: false,
        zIndex: Math.max(0, ...(documentStore.currentPage?.layers.map((l) => l.zIndex) || [])) + 1,
        opacity: 0.5,
        blendMode: 'normal' as const,
        watermarkPosition: 'center' as const,
        watermarkScale: 1,
        watermarkRotation: 0,
        watermarkTileSpacing: 80,
        sourceType: 'manual' as const,
        role: 'annotation' as const
      }
      documentStore.addLayer(documentStore.currentPageIndex, newLayer)
      documentStore.selectLayer(newLayer.id)
      uiStore.showNotification('success', 'Watermark layer added - upload an image in the panel')
    } catch (e) {
      uiStore.showNotification('error', `Failed to add watermark: ${e}`)
    } finally {
      uiStore.setLoading(false)
    }
  }
</script>

<template>
  <div
    data-testid="main-toolbar"
    class="glass-panel-floating rounded-2xl md:rounded-2xl"
    :class="{ 'mobile-toolbar rounded-none': $props.isMobile }"
  >
    <div class="flex h-12 md:h-14 items-center gap-1 md:gap-2 px-2 md:px-4">
      <!-- Logo/Brand -->
      <div class="flex items-center gap-2 md:gap-3 mr-1 md:mr-3">
        <div class="relative group">
          <div
            class="absolute inset-0 rounded-lg md:rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 blur-lg opacity-50 group-hover:opacity-70 transition-opacity hidden md:block"
          />
          <div
            class="relative w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-glow-sm"
          >
            <span class="text-white font-bold text-sm md:text-base">R</span>
          </div>
        </div>
        <div class="hidden lg:flex items-baseline gap-1.5">
          <DecryptedText
            text="ROOK"
            :speed="30"
            :max-iterations="6"
            animate-on="hover"
            class-name="text-white font-semibold tracking-tight"
            encrypted-class-name="text-violet-400/80 font-semibold tracking-tight"
            characters="ROOK█▓▒░"
          />
          <span class="text-white/30 text-xs">Editor</span>
        </div>
      </div>

      <div class="glass-divider-v h-6 md:h-8 hidden sm:block" />

      <!-- File Actions - Desktop -->
      <div class="hidden sm:flex items-center gap-1 px-1 md:px-2">
        <button
          class="glass-btn-icon group relative"
          title="Import (Ctrl+O)"
          @click="handleImport"
        >
          <svg
            class="h-4 w-4 md:h-[18px] md:w-[18px] transition-all duration-300 group-hover:scale-110 group-hover:text-violet-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </button>

        <button
          class="glass-btn-icon group hidden md:flex"
          title="Open Project"
          @click="handleOpenProject"
        >
          <svg
            class="h-[18px] w-[18px] transition-all duration-300 group-hover:scale-110 group-hover:text-violet-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
            />
          </svg>
        </button>

        <button
          :disabled="!hasDocument"
          :class="[
            'glass-btn-icon group hidden md:flex',
            !hasDocument && 'opacity-30 cursor-not-allowed'
          ]"
          title="Save Project"
          @click="handleSaveProject"
        >
          <svg
            class="h-[18px] w-[18px] transition-all duration-300 group-hover:scale-110 group-hover:text-emerald-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
        </button>

        <button
          :disabled="!hasDocument"
          :class="['glass-btn-icon group', !hasDocument && 'opacity-30 cursor-not-allowed']"
          title="Export"
          @click="openExportDialog"
        >
          <svg
            class="h-4 w-4 md:h-[18px] md:w-[18px] transition-all duration-300 group-hover:scale-110 group-hover:text-cyan-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>

        <button
          :disabled="!hasDocument"
          :class="['glass-btn-icon group', !hasDocument && 'opacity-30 cursor-not-allowed']"
          title="Add Watermark"
          @click="handleAddWatermark"
        >
          <svg
            class="h-4 w-4 md:h-[18px] md:w-[18px] transition-all duration-300 group-hover:scale-110 group-hover:text-fuchsia-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        </button>
      </div>

      <!-- Mobile: Compact Actions -->
      <div class="flex sm:hidden items-center gap-1">
        <button
          class="glass-btn-icon"
          title="Import"
          @click="handleImport"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </button>
        <button
          :disabled="!hasDocument"
          :class="['glass-btn-icon', !hasDocument && 'opacity-30']"
          title="Export"
          @click="openExportDialog"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>
        <button
          class="glass-btn-icon"
          title="More"
          @click="showMobileMenu = !showMobileMenu"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>

      <div class="glass-divider-v h-6 md:h-8 hidden md:block" />

      <!-- Edit Actions - Desktop only -->
      <div class="hidden md:flex items-center gap-1 px-2">
        <button
          :disabled="!canUndo"
          :class="['glass-btn-icon group', !canUndo && 'opacity-30 cursor-not-allowed']"
          title="Undo (Ctrl+Z)"
          @click="documentStore.undo()"
        >
          <svg
            class="h-[18px] w-[18px] transition-all duration-300 group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </button>

        <button
          :disabled="!canRedo"
          :class="['glass-btn-icon group', !canRedo && 'opacity-30 cursor-not-allowed']"
          title="Redo (Ctrl+Shift+Z)"
          @click="documentStore.redo()"
        >
          <svg
            class="h-[18px] w-[18px] transition-all duration-300 group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
            />
          </svg>
        </button>
      </div>

      <div class="glass-divider-v h-6 md:h-8 hidden sm:block" />

      <!-- Zoom Controls -->
      <div class="flex items-center gap-1 px-1 md:px-2">
        <button
          class="glass-btn-icon group hidden sm:flex"
          title="Zoom Out"
          @click="uiStore.zoomOut(0.1)"
        >
          <svg
            class="h-4 w-4 md:h-[18px] md:w-[18px] transition-all duration-300 group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
            />
          </svg>
        </button>

        <button
          class="min-w-[3rem] md:min-w-[4rem] px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-semibold text-white/70 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300"
          title="Reset Zoom"
          @click="uiStore.resetZoom()"
        >
          {{ zoomPercent }}%
        </button>

        <button
          class="glass-btn-icon group hidden sm:flex"
          title="Zoom In"
          @click="uiStore.zoomIn(0.1)"
        >
          <svg
            class="h-4 w-4 md:h-[18px] md:w-[18px] transition-all duration-300 group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
            />
          </svg>
        </button>
      </div>

      <div class="flex-1" />

      <!-- Document Info -->
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0 translate-x-4"
        enter-to-class="opacity-100 translate-x-0"
      >
        <div
          v-if="hasDocument"
          class="flex items-center gap-2 md:gap-4"
        >
          <!-- Desktop -->
          <div
            class="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.04]"
          >
            <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span class="text-white/50 text-xs font-medium truncate max-w-[160px]">{{
              documentStore.sourceFile?.name
            }}</span>
          </div>
          <div class="hidden md:flex glass-badge-accent">
            <svg
              class="w-3 h-3 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {{ totalPages }}
          </div>
          <!-- Mobile -->
          <div class="flex md:hidden items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span class="text-white/50 text-[10px] font-medium truncate max-w-[80px]">{{
              documentStore.sourceFile?.name
            }}</span>
          </div>
        </div>
      </Transition>

      <!-- Settings Button -->
      <button
        class="glass-btn-icon group ml-2"
        title="Settings"
        @click="showSettings = true"
      >
        <svg
          class="h-4 w-4 md:h-[18px] md:w-[18px] transition-all duration-300 group-hover:scale-110 group-hover:rotate-45 group-hover:text-violet-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.75"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.75"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </div>
  </div>

  <!-- Settings Dialog -->
  <SettingsDialog
    :show="showSettings"
    @close="showSettings = false"
  />

  <!-- Import Options Dialog -->
  <ImportOptionsDialog 
    :show="showImportDialog"
    :file-name="pendingImportFile?.name"
    @close="showImportDialog = false; pendingImportFile = null" 
    @confirm="handleImportConfirm" 
  />

  <!-- Mobile Menu Dropdown -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 scale-95"
      leave-active-class="transition-all duration-150"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showMobileMenu"
        class="fixed inset-0 z-50"
        @click="showMobileMenu = false"
      >
        <div
          class="absolute top-14 right-2 w-48 glass-panel-strong rounded-2xl py-2 overflow-hidden"
          @click.stop
        >
          <button
            class="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:bg-white/[0.06]"
            @click="handleOpenProject(); showMobileMenu = false"
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
                d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
              />
            </svg>
            <span class="text-sm">Open Project</span>
          </button>
          <button
            :disabled="!hasDocument"
            :class="[
              'w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:bg-white/[0.06]',
              !hasDocument && 'opacity-30'
            ]"
            @click="handleSaveProject(); showMobileMenu = false"
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
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
              />
            </svg>
            <span class="text-sm">Save Project</span>
          </button>
          <div class="mx-3 my-1 h-px bg-white/[0.06]" />
          <button
            :disabled="!canUndo"
            :class="[
              'w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:bg-white/[0.06]',
              !canUndo && 'opacity-30'
            ]"
            @click="documentStore.undo(); showMobileMenu = false"
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
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            <span class="text-sm">Undo</span>
          </button>
          <button
            :disabled="!canRedo"
            :class="[
              'w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:bg-white/[0.06]',
              !canRedo && 'opacity-30'
            ]"
            @click="documentStore.redo(); showMobileMenu = false"
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
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
              />
            </svg>
            <span class="text-sm">Redo</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Export Dialog -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-all duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showExportDialog"
        class="fixed inset-0 z-50 flex items-end md:items-center justify-center"
        style="background: rgba(3, 3, 5, 0.85); backdrop-filter: blur(20px)"
        @click.self="showExportDialog = false"
      >
        <div
          class="w-full md:w-[480px] glass-panel-strong rounded-t-3xl md:rounded-3xl p-6 md:p-8 relative overflow-hidden max-h-[85vh] overflow-y-auto safe-padding-bottom"
        >
          <div class="drawer-handle md:hidden" />
          <div
            class="absolute -top-20 -right-20 w-40 h-40 bg-violet-500/20 rounded-full blur-3xl hidden md:block"
          />
          <div
            class="absolute -bottom-20 -left-20 w-40 h-40 bg-cyan-500/15 rounded-full blur-3xl hidden md:block"
          />

          <div class="relative">
            <h3 class="mb-2 text-lg md:text-xl font-semibold text-white">
              Export Document
            </h3>
            <p class="mb-4 md:mb-6 text-sm text-white/40">
              Configure export settings
            </p>

            <!-- Filename -->
            <div class="mb-4 md:mb-6">
              <label class="block text-xs text-white/50 mb-2">Filename</label>
              <input
                v-model="exportFilename"
                type="text"
                class="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:outline-none focus:border-violet-500/50"
                placeholder="document"
              >
            </div>

            <!-- Format Selection -->
            <div class="mb-6">
              <label class="block text-xs text-white/50 mb-3">Format</label>
              <div class="grid grid-cols-3 gap-3">
                <button
                  v-for="fmt in formatOptions"
                  :key="fmt.id"
                  :disabled="!fmt.available"
                  :class="[
                    'relative rounded-xl border-2 p-4 transition-all duration-300 text-center',
                    exportFormat === fmt.id
                      ? `border-${fmt.color}-500/50 bg-${fmt.color}-500/10`
                      : fmt.available
                        ? 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                        : 'border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed'
                  ]"
                  @click="fmt.available && (exportFormat = fmt.id as 'pdf' | 'docx' | 'png')"
                >
                  <span
                    :class="[
                      'text-sm font-semibold',
                      exportFormat === fmt.id ? `text-${fmt.color}-300` : 'text-white/60'
                    ]"
                  >
                    {{ fmt.label }}
                  </span>
                  <p class="text-[10px] text-white/30 mt-1">
                    {{ fmt.desc }}
                  </p>
                </button>
              </div>
            </div>

            <!-- PNG Options -->
            <div
              v-if="exportFormat === 'png'"
              class="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <label class="block text-xs text-white/50 mb-3">PNG Quality</label>
              <div class="flex items-center gap-4">
                <input
                  v-model.number="pngScale"
                  type="range"
                  min="1"
                  max="4"
                  step="0.5"
                  class="flex-1 accent-emerald-500"
                >
                <span class="text-sm text-white/60 w-16">{{ pngScale }}x ({{ Math.round(72 * pngScale) }} DPI)</span>
              </div>
            </div>

            <!-- Page Range -->
            <div class="mb-6">
              <label class="flex items-center gap-2 text-xs text-white/50 mb-3 cursor-pointer">
                <input
                  v-model="pageRangeEnabled"
                  type="checkbox"
                  class="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/50"
                >
                <span>Export page range</span>
              </label>
              <div
                v-if="pageRangeEnabled"
                class="flex items-center gap-3"
              >
                <input
                  v-model.number="pageStart"
                  type="number"
                  :min="1"
                  :max="totalPages"
                  class="w-20 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm text-center focus:outline-none focus:border-violet-500/50"
                >
                <span class="text-white/30">to</span>
                <input
                  v-model.number="pageEnd"
                  type="number"
                  :min="pageStart"
                  :max="totalPages"
                  class="w-20 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm text-center focus:outline-none focus:border-violet-500/50"
                >
                <span class="text-white/30 text-xs">of {{ totalPages }}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 pt-2">
              <button
                class="glass-btn"
                @click="showExportDialog = false"
              >
                Cancel
              </button>
              <button
                class="btn-accent"
                @click="handleExport"
              >
                <svg
                  class="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
