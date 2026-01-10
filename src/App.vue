<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch, nextTick } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { reconstructPdfWithOcr, isTauri, pickFile } from '@/bridge'
import type { ImportOptions } from '@/bridge'
import Toolbar from '@/components/Toolbar.vue'
import PagesPanel from '@/components/PagesPanel.vue'
import CanvasComponent from '@/components/CanvasComponent.vue'
import LayersPanel from '@/components/LayersPanel.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import PdfStatusBar from '@/components/PdfStatusBar.vue'
import ImportOptionsDialog from '@/components/ImportOptionsDialog.vue'
import { ClickSpark, RotatingText, DecryptedText, BackgroundTexture } from '@/components/extra'

const documentStore = useDocumentStore()
const uiStore = useUIStore()

// Welcome & Onboarding
const showWelcome = ref(true)
const onboardingStep = ref(0)
const showOnboarding = ref(false)
const isOcrProcessing = ref(false)
const showImportDialog = ref(false)
const pendingImportFile = ref<{ name: string; data: Uint8Array } | null>(null)

// Mobile responsive state
const isMobile = ref(false)
const activeDrawer = ref<'pages' | 'layers' | 'properties' | null>(null)
const mobileNavTab = ref<'canvas' | 'pages' | 'layers' | 'properties'>('canvas')

// Check screen size
function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) activeDrawer.value = null
}

// Toggle mobile drawer
function toggleDrawer(drawer: 'pages' | 'layers' | 'properties') {
  activeDrawer.value = activeDrawer.value === drawer ? null : drawer
}

function closeDrawer() {
  activeDrawer.value = null
}

// Watch mobile nav tab changes
watch(mobileNavTab, (tab) => {
  if (tab !== 'canvas' && isMobile.value) {
    activeDrawer.value = tab as 'pages' | 'layers' | 'properties'
  } else {
    activeDrawer.value = null
  }
})

const onboardingSteps = [
  { title: 'Import', desc: 'Open PDF or DOCX files', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { title: 'Edit Layers', desc: 'Select and modify elements', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { title: 'Properties', desc: 'Adjust fonts, colors, sizes', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  { title: 'Export', desc: 'Save as PDF or DOCX', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' }
]

function startApp() {
  showWelcome.value = false
  showOnboarding.value = true
}

function finishOnboarding() {
  showOnboarding.value = false
  localStorage.setItem('rook-onboarded', '1')
}

function skipOnboarding() {
  showWelcome.value = false
  showOnboarding.value = false
  localStorage.setItem('rook-onboarded', '1')
}

const isPagesVisible = computed(() => uiStore.isPagesVisible)
const isLayersVisible = computed(() => uiStore.isLayersVisible)
const isPropertiesVisible = computed(() => uiStore.isPropertiesVisible)
const isLoading = computed(() => uiStore.isLoading)
const loadingMessage = computed(() => uiStore.loadingMessage)
const importProgress = computed(() => uiStore.importProgress)
const notifications = computed(() => uiStore.notifications)

const progressPercent = computed(() => {
  if (!importProgress.value || importProgress.value.totalPages === 0) return 0
  return Math.round((importProgress.value.currentPage / importProgress.value.totalPages) * 100)
})

const statusMessages = computed(() => {
  if (documentStore.hasDocument) {
    return [`${documentStore.totalPages} pages`, `${documentStore.selectedLayerIds.length || 'No'} selected`, 'Ready']
  }
  return ['Ctrl+O to import', 'Drop PDF or DOCX', 'Ready']
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
  
  console.log('[Import] Starting import with options:', options);
  
  const result = await documentStore.importDocument(options, file, async (current, total, status) => {
    console.log(`[Import] Progress: ${current}/${total} - ${status}`);
    
    // Show loading overlay
    uiStore.setLoading(true, status)
    uiStore.updateImportProgress({ currentPage: current, totalPages: total, status })
    
    // Force Vue to process the update
    await nextTick()
  })
  
  console.log('[Import] Complete, result:', result);
  uiStore.updateImportProgress(null)
  uiStore.setLoading(false)
  
  if (result) {
    uiStore.setStatus(`Loaded: ${documentStore.sourceFile?.name}`)
    uiStore.showNotification('success', 'Document imported!')
  } else if (documentStore.error) {
    uiStore.showNotification('error', documentStore.error)
  }
}

// PDF Analysis handlers
async function handleRunOcr() {
  if (!documentStore.hasDocument || !documentStore.document) {
    uiStore.showNotification('error', 'No document loaded')
    return
  }

  isOcrProcessing.value = true
  uiStore.setLoading(true, 'Initializing OCR...')
  
  try {
    if (isTauri()) {
      // Tauri: Use native OCR
      const filePath = documentStore.sourceFile?.path
      if (!filePath) {
        uiStore.showNotification('error', 'No file path available for OCR')
        return
      }
      
      const result = await reconstructPdfWithOcr(
        filePath,
        { renderDpi: 150, minConfidence: 0.5 },
        (_current, _total, status) => {
          uiStore.setLoading(true, status)
        }
      )
      
      if (result.success) {
        uiStore.showNotification('success', `OCR complete: ${result.textLayersAdded} text layers added`)
        await documentStore.importDocument()
      } else {
        uiStore.showNotification('error', result.message)
      }
    } else {
      // Web: Use WASM Tesseract.js
      const { initOcr, ocrPageToLayers, renderPageToCanvas } = await import('@/bridge/ocrService')
      const { getCachedPage } = await import('@/bridge/pdfParser')
      
      await initOcr()
      
      const pages = documentStore.document.document.pages
      let totalLayersAdded = 0
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        uiStore.setLoading(true, `OCR page ${i + 1} of ${pages.length}...`)
        
        // Only OCR pages with images but no/minimal text
        const textLayers = page.layers.filter(l => l.type === 'text')
        const imageLayers = page.layers.filter(l => l.type === 'image')
        
        if (imageLayers.length > 0 && textLayers.length < 3) {
          const pdfPage = await getCachedPage(i + 1)
          if (pdfPage) {
            const canvas = await renderPageToCanvas(pdfPage, 2.0)
            const ocrLayers = await ocrPageToLayers(canvas, i, page.height, (progress, status) => {
              uiStore.setLoading(true, `Page ${i + 1}: ${status} (${Math.round(progress * 100)}%)`)
            })
            
            // Add OCR layers to page (cast to model type)
            for (const layer of ocrLayers) {
              layer.zIndex = page.layers.length
              page.layers.push(layer as unknown as typeof page.layers[0])
              totalLayersAdded++
            }
          }
        }
      }
      
      uiStore.showNotification('success', `OCR complete: ${totalLayersAdded} text layers added`)
    }
  } catch (e) {
    uiStore.showNotification('error', `OCR failed: ${e}`)
  } finally {
    isOcrProcessing.value = false
    uiStore.setLoading(false)
  }
}

async function handleVerifyText() {
  if (!documentStore.hasDocument || !documentStore.document) {
    uiStore.showNotification('error', 'No document loaded')
    return
  }
  
  isOcrProcessing.value = true
  uiStore.setLoading(true, 'Verifying text with OCR...')
  
  try {
    if (isTauri()) {
      const filePath = documentStore.sourceFile?.path
      if (!filePath) {
        uiStore.showNotification('error', 'No file path available for verification')
        return
      }
      
      const result = await reconstructPdfWithOcr(
        filePath,
        { renderDpi: 150, minConfidence: 0.7 },
        (_current, _total, status) => {
          uiStore.setLoading(true, status)
        }
      )
      
      if (result.success) {
        const confidence = Math.round(result.confidence * 100)
        uiStore.showNotification('success', `Text verified: ${confidence}% confidence`)
      } else {
        uiStore.showNotification('warning', result.message)
      }
    } else {
      // Web: Run OCR on current page and compare
      const { initOcr, recognizeImage, renderPageToCanvas } = await import('@/bridge/ocrService')
      const { getCachedPage } = await import('@/bridge/pdfParser')
      
      await initOcr()
      
      const pageIndex = documentStore.currentPageIndex
      const pdfPage = await getCachedPage(pageIndex + 1)
      
      if (pdfPage) {
        const canvas = await renderPageToCanvas(pdfPage, 2.0)
        const result = await recognizeImage(canvas, (progress, status) => {
          uiStore.setLoading(true, `${status} (${Math.round(progress * 100)}%)`)
        })
        
        const confidence = Math.round(result.confidence * 100)
        uiStore.showNotification('success', `Text verified: ${confidence}% confidence`)
      }
    }
  } catch (e) {
    uiStore.showNotification('error', `Text verification failed: ${e}`)
  } finally {
    isOcrProcessing.value = false
    uiStore.setLoading(false)
  }
}

async function handleConvertVectors() {
  if (!documentStore.hasDocument) {
    uiStore.showNotification('warning', 'No document loaded')
    return
  }
  
  uiStore.setLoading(true, 'Converting vectors to shapes...')
  try {
    // Convert vector layers to shape layers for better editability
    const currentPage = documentStore.currentPage
    if (!currentPage) {
      uiStore.showNotification('error', 'No page selected')
      return
    }
    
    let convertedCount = 0
    for (const layer of currentPage.layers) {
      if (layer.type === 'vector' && layer.pathData) {
        // Convert vector to shape by calculating bounding box
        const bounds = layer.bounds
        documentStore.updateLayer(documentStore.currentPageIndex, layer.id, {
          type: 'shape',
          shapeType: 'rectangle',
          fillColor: layer.fillColor || 'transparent',
          strokeColor: layer.strokeColor || '#000000',
          strokeWidth: layer.strokeWidth || 1,
          bounds
        })
        convertedCount++
      }
    }
    
    if (convertedCount > 0) {
      uiStore.showNotification('success', `Converted ${convertedCount} vector(s) to shapes`)
    } else {
      uiStore.showNotification('info', 'No vectors to convert')
    }
  } catch (e) {
    uiStore.showNotification('error', `Vector conversion failed: ${e}`)
  } finally {
    uiStore.setLoading(false)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (showWelcome.value || showOnboarding.value) return
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? e.metaKey : e.ctrlKey

  if (modifier && e.key === 'o') {
    e.preventDefault()
    handleImport()
    return
  }

  if (modifier && !e.shiftKey && e.key === 'z') {
    e.preventDefault()
    documentStore.undo()
    return
  }

  if (modifier && e.shiftKey && e.key === 'z') {
    e.preventDefault()
    documentStore.redo()
    return
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (documentStore.selectedLayerIds.length > 0) {
      e.preventDefault()
      for (const id of documentStore.selectedLayerIds) {
        documentStore.deleteLayer(documentStore.currentPageIndex, id)
      }
    }
    return
  }

  if (e.key === 'Escape') {
    documentStore.deselectAll()
    return
  }

  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    uiStore.zoomIn(0.1)
    return
  }
  if (e.key === '-') {
    e.preventDefault()
    uiStore.zoomOut(0.1)
    return
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (documentStore.selectedLayerIds.length > 0) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const layer = documentStore.selectedLayers[0]
      if (layer) {
        const bounds = { ...layer.bounds }
        switch (e.key) {
          case 'ArrowUp': bounds.y -= step; break
          case 'ArrowDown': bounds.y += step; break
          case 'ArrowLeft': bounds.x -= step; break
          case 'ArrowRight': bounds.x += step; break
        }
        documentStore.updateLayer(documentStore.currentPageIndex, layer.id, { bounds })
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', checkMobile)
  checkMobile()
  if (localStorage.getItem('rook-onboarded')) {
    showWelcome.value = false
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', checkMobile)
})
</script>

<template>
  <!-- Welcome Screen -->
  <Transition
    enter-active-class="transition-all duration-500 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-all duration-300"
    leave-to-class="opacity-0 scale-95"
  >
    <BackgroundTexture
      v-if="showWelcome"
      variant="dots"
      :opacity="0.3"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950"
    >
      <!-- Ambient Background -->
      <div class="absolute inset-0 overflow-hidden">
        <div
          class="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[120px] animate-pulse"
          style="background: rgba(var(--theme-accent-rgb), 0.25)"
        />
        <div
          class="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-[100px] animate-pulse"
          style="background: rgba(var(--theme-secondary-rgb), 0.20); animation-delay: 1s"
        />
        <div
          class="absolute top-1/2 right-1/3 w-64 h-64 rounded-full blur-[80px] animate-pulse"
          style="background: rgba(var(--theme-tertiary-rgb), 0.15); animation-delay: 2s"
        />
      </div>
      
      <div class="relative text-center">
        <!-- Logo -->
        <div class="mb-8 flex justify-center">
          <div class="relative group">
            <div 
              class="absolute -inset-4 rounded-[2rem] blur-2xl opacity-40 animate-pulse group-hover:opacity-60 transition-opacity" 
              style="background: linear-gradient(135deg, var(--theme-accent), var(--theme-secondary), var(--theme-tertiary))"
            />
            <div 
              class="relative w-28 h-28 rounded-[1.75rem] flex items-center justify-center shadow-2xl ring-2 ring-white/20"
              style="background: linear-gradient(135deg, var(--theme-accent), var(--theme-secondary))"
            >
              <span class="text-white font-black text-5xl drop-shadow-lg">R</span>
            </div>
          </div>
        </div>
        
        <!-- Title -->
        <h1 class="text-5xl font-black text-white mb-3 tracking-tight">
          <DecryptedText
            text="ROOK"
            :speed="50"
            :max-iterations="10"
            animate-on="view"
            class-name="text-white"
            encrypted-class-name="text-violet-300"
            sequential
            reveal-direction="center"
          />
        </h1>
        <p class="text-white/50 text-lg mb-12 font-medium">
          Document Layer Editor ✨
        </p>
        
        <!-- CTA -->
        <div class="flex flex-col items-center gap-4">
          <button
            class="group relative px-10 py-4 rounded-2xl text-white font-bold text-lg overflow-hidden transition-all duration-300 hover:scale-105"
            style="background: linear-gradient(135deg, var(--theme-accent), var(--theme-secondary)); box-shadow: 0 4px 30px rgba(var(--theme-accent-rgb), 0.4)"
            @click="startApp"
          >
            <span class="relative z-10 flex items-center gap-2">Get Started <span class="text-xl">→</span></span>
            <div 
              class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
              style="background: linear-gradient(135deg, var(--theme-secondary), var(--theme-accent))"
            />
          </button>
          <button
            class="text-white/40 text-sm hover:text-white/70 transition-colors font-medium"
            @click="skipOnboarding"
          >
            Skip intro
          </button>
        </div>
        
        <!-- Version -->
        <p class="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/25 text-xs font-medium">
          v1.0.0
        </p>
      </div>
    </BackgroundTexture>
  </Transition>

  <!-- Onboarding Stepper -->
  <Transition
    enter-active-class="transition-all duration-400 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-all duration-300"
    leave-to-class="opacity-0"
  >
    <BackgroundTexture
      v-if="showOnboarding"
      variant="waves"
      :opacity="0.2"
      class="fixed inset-0 z-[90] flex items-center justify-center bg-dark-950/95 backdrop-blur-xl"
    >
      <div class="w-full max-w-2xl px-8">
        <!-- Stepper Progress -->
        <div class="flex items-center justify-center gap-2 mb-12">
          <template
            v-for="(_, i) in onboardingSteps"
            :key="i"
          >
            <button
              :class="['w-3.5 h-3.5 rounded-full transition-all duration-300 ring-2', i === onboardingStep ? 'scale-125' : '', i > onboardingStep ? 'bg-white/10 ring-white/5' : '']"
              :style="i === onboardingStep 
                ? { background: `linear-gradient(135deg, var(--theme-accent), var(--theme-secondary))`, boxShadow: '0 0 12px rgba(var(--theme-accent-rgb), 0.4)', '--tw-ring-color': 'rgba(var(--theme-accent-rgb), 0.3)' } as any
                : i < onboardingStep 
                  ? { background: 'rgba(var(--theme-accent-rgb), 0.6)', '--tw-ring-color': 'rgba(var(--theme-accent-rgb), 0.2)' } as any
                  : {}"
              @click="onboardingStep = i"
            />
            <div 
              v-if="i < onboardingSteps.length - 1" 
              class="w-12 h-0.5 rounded-full transition-all duration-300"
              :style="i < onboardingStep ? { background: `linear-gradient(90deg, rgba(var(--theme-accent-rgb), 0.6), rgba(var(--theme-secondary-rgb), 0.6))` } : { background: 'rgba(255,255,255,0.1)' }"
            />
          </template>
        </div>
        
        <!-- Step Content -->
        <div class="relative h-52 overflow-hidden">
          <Transition
            mode="out-in"
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 translate-x-8"
            enter-to-class="opacity-100 translate-x-0"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 translate-x-0"
            leave-to-class="opacity-0 -translate-x-8"
          >
            <div
              :key="onboardingStep"
              class="text-center"
            >
              <div 
                class="w-24 h-24 mx-auto mb-6 rounded-3xl flex items-center justify-center border"
                style="background: linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.2), rgba(var(--theme-secondary-rgb), 0.15), rgba(var(--theme-tertiary-rgb), 0.1)); border-color: rgba(var(--theme-accent-rgb), 0.2); box-shadow: 0 0 40px rgba(var(--theme-accent-rgb), 0.15)"
              >
                <svg
                  class="w-12 h-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  :style="{ color: 'var(--theme-accent)' }"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    :d="onboardingSteps[onboardingStep].icon"
                  />
                </svg>
              </div>
              <h2 class="text-3xl font-black text-white mb-3">
                {{ onboardingSteps[onboardingStep].title }}
              </h2>
              <p class="text-white/50 text-lg font-medium">
                {{ onboardingSteps[onboardingStep].desc }}
              </p>
            </div>
          </Transition>
        </div>
        
        <!-- Navigation -->
        <div class="flex justify-center gap-4 mt-12">
          <Transition
            enter-active-class="transition-all duration-200"
            enter-from-class="opacity-0 -translate-x-4"
            leave-active-class="transition-all duration-150"
            leave-to-class="opacity-0 -translate-x-4"
          >
            <button
              v-if="onboardingStep > 0"
              class="px-6 py-3 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all duration-300 font-medium border border-white/10"
              @click="onboardingStep--"
            >
              ← Back
            </button>
          </Transition>
          <button
            class="px-8 py-3 rounded-2xl text-white font-bold hover:scale-105 transition-all duration-300"
            style="background: linear-gradient(135deg, var(--theme-accent), var(--theme-secondary)); box-shadow: 0 4px 30px rgba(var(--theme-accent-rgb), 0.4)"
            @click="onboardingStep < onboardingSteps.length - 1 ? onboardingStep++ : finishOnboarding()"
          >
            {{ onboardingStep < onboardingSteps.length - 1 ? 'Next →' : 'Start Editing ✨' }}
          </button>
        </div>
      </div>
    </BackgroundTexture>
  </Transition>

  <!-- Main App -->
  <Transition
    enter-active-class="transition-all duration-500 delay-100"
    enter-from-class="opacity-0"
  >
    <BackgroundTexture
      v-show="!showWelcome && !showOnboarding"
      variant="dots"
      :opacity="0.15"
      class="flex h-screen flex-col bg-dark-950 overflow-hidden"
    >
      <!-- Ambient Background -->
      <div class="fixed inset-0 pointer-events-none">
        <div
          class="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full blur-[150px] hidden md:block"
          style="background: rgba(var(--theme-accent-rgb), 0.08)"
        />
        <div
          class="absolute bottom-0 right-1/4 w-[500px] h-[300px] rounded-full blur-[120px] hidden md:block"
          style="background: rgba(var(--theme-secondary-rgb), 0.06)"
        />
        <div
          class="absolute top-1/2 left-0 w-[400px] h-[400px] rounded-full blur-[100px] hidden md:block"
          style="background: rgba(var(--theme-tertiary-rgb), 0.05)"
        />
      </div>

      <!-- Desktop Toolbar / Mobile Header -->
      <Toolbar
        :is-mobile="isMobile"
        @toggle-drawer="toggleDrawer"
      />
      
      <!-- PDF Analysis Status Bar (hidden on mobile) -->
      <PdfStatusBar
        v-if="!isMobile"
        :analysis="documentStore.pdfAnalysis"
        :is-processing="isOcrProcessing"
        @run-ocr="handleRunOcr"
        @verify-text="handleVerifyText"
        @convert-vectors="handleConvertVectors"
        @dismiss="documentStore.dismissAnalysis"
      />

      <!-- Main Content -->
      <main
        class="relative flex flex-1 gap-2 md:gap-3 p-2 md:p-3 overflow-hidden"
        :class="{ 'pb-20': isMobile }"
      >
        <!-- Desktop: Pages Panel -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-x-4"
          leave-active-class="transition-all duration-200"
          leave-to-class="opacity-0 -translate-x-4"
        >
          <aside
            v-if="isPagesVisible && !isMobile"
            class="w-44 lg:w-48 flex-shrink-0 glass-panel rounded-2xl overflow-hidden"
          >
            <PagesPanel />
          </aside>
        </Transition>

        <!-- Canvas Area -->
        <ClickSpark
          spark-color="#a78bfa"
          :spark-size="6"
          :spark-radius="20"
          :spark-count="8"
          :duration="400"
          class="flex-1 glass-panel rounded-2xl overflow-hidden"
        >
          <CanvasComponent :is-mobile="isMobile" />
        </ClickSpark>

        <!-- Desktop: Right Sidebar -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 translate-x-4"
          leave-active-class="transition-all duration-200"
          leave-to-class="opacity-0 translate-x-4"
        >
          <div
            v-if="(isLayersVisible || isPropertiesVisible) && !isMobile"
            class="flex w-64 lg:w-72 flex-shrink-0 flex-col gap-2 md:gap-3"
          >
            <Transition
              enter-active-class="transition-all duration-300 ease-out delay-75"
              enter-from-class="opacity-0 translate-y-2"
              leave-active-class="transition-all duration-200"
              leave-to-class="opacity-0"
            >
              <div
                v-if="isLayersVisible"
                class="flex-1 glass-panel rounded-2xl overflow-hidden min-h-0"
              >
                <LayersPanel />
              </div>
            </Transition>
            <Transition
              enter-active-class="transition-all duration-300 ease-out delay-100"
              enter-from-class="opacity-0 translate-y-2"
              leave-active-class="transition-all duration-200"
              leave-to-class="opacity-0"
            >
              <div
                v-if="isPropertiesVisible"
                class="flex-1 glass-panel rounded-2xl overflow-hidden min-h-0"
              >
                <PropertiesPanel />
              </div>
            </Transition>
          </div>
        </Transition>
      </main>

      <!-- Desktop Status Bar -->
      <footer
        v-if="!isMobile"
        class="relative flex h-8 items-center justify-between px-4 text-xs border-t border-white/[0.03]"
      >
        <RotatingText
          :texts="statusMessages"
          :rotation-interval="3000"
          :stagger-duration="0.015"
          stagger-from="first"
          split-by="characters"
          main-class-name="text-white/40 text-xs"
          element-level-class-name="inline-block"
        />
        <div class="flex items-center gap-4">
          <button
            :class="['transition-all duration-200', isPagesVisible ? 'text-violet-400' : 'text-white/30 hover:text-white/60']"
            @click="uiStore.togglePanel('pages')"
          >
            Pages
          </button>
          <button
            :class="['transition-all duration-200', isLayersVisible ? 'text-violet-400' : 'text-white/30 hover:text-white/60']"
            @click="uiStore.togglePanel('layers')"
          >
            Layers
          </button>
          <button
            :class="['transition-all duration-200', isPropertiesVisible ? 'text-violet-400' : 'text-white/30 hover:text-white/60']"
            @click="uiStore.togglePanel('properties')"
          >
            Properties
          </button>
        </div>
      </footer>

      <!-- Mobile Bottom Navigation -->
      <nav
        v-if="isMobile"
        class="mobile-nav"
      >
        <div class="flex items-center justify-around">
          <button 
            :class="['mobile-nav-item flex-1', mobileNavTab === 'canvas' && !activeDrawer && 'active']"
            @click="mobileNavTab = 'canvas'; closeDrawer()"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
              />
            </svg>
            <span class="text-[10px]">Canvas</span>
          </button>
          <button 
            :class="['mobile-nav-item flex-1', activeDrawer === 'pages' && 'active']"
            @click="toggleDrawer('pages')"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span class="text-[10px]">Pages</span>
          </button>
          <button 
            :class="['mobile-nav-item flex-1', activeDrawer === 'layers' && 'active']"
            @click="toggleDrawer('layers')"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span class="text-[10px]">Layers</span>
          </button>
          <button 
            :class="['mobile-nav-item flex-1', activeDrawer === 'properties' && 'active']"
            @click="toggleDrawer('properties')"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <span class="text-[10px]">Props</span>
          </button>
        </div>
      </nav>

      <!-- Mobile Drawers -->
      <Teleport to="body">
        <!-- Backdrop -->
        <Transition
          enter-active-class="transition-opacity duration-300"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200"
          leave-to-class="opacity-0"
        >
          <div
            v-if="activeDrawer && isMobile"
            class="overlay-backdrop"
            @click="closeDrawer"
          />
        </Transition>

        <!-- Pages Drawer -->
        <Transition
          enter-active-class="transition-transform duration-300 ease-ios"
          enter-from-class="translate-y-full"
          leave-active-class="transition-transform duration-200 ease-ios"
          leave-to-class="translate-y-full"
        >
          <div
            v-if="activeDrawer === 'pages' && isMobile"
            class="mobile-drawer-bottom"
          >
            <div class="drawer-handle" />
            <div class="h-[60vh] overflow-hidden">
              <PagesPanel
                :is-mobile="true"
                @close="closeDrawer"
              />
            </div>
          </div>
        </Transition>

        <!-- Layers Drawer -->
        <Transition
          enter-active-class="transition-transform duration-300 ease-ios"
          enter-from-class="translate-y-full"
          leave-active-class="transition-transform duration-200 ease-ios"
          leave-to-class="translate-y-full"
        >
          <div
            v-if="activeDrawer === 'layers' && isMobile"
            class="mobile-drawer-bottom"
          >
            <div class="drawer-handle" />
            <div class="h-[60vh] overflow-hidden">
              <LayersPanel
                :is-mobile="true"
                @close="closeDrawer"
              />
            </div>
          </div>
        </Transition>

        <!-- Properties Drawer -->
        <Transition
          enter-active-class="transition-transform duration-300 ease-ios"
          enter-from-class="translate-y-full"
          leave-active-class="transition-transform duration-200 ease-ios"
          leave-to-class="translate-y-full"
        >
          <div
            v-if="activeDrawer === 'properties' && isMobile"
            class="mobile-drawer-bottom"
          >
            <div class="drawer-handle" />
            <div class="h-[70vh] overflow-hidden">
              <PropertiesPanel
                :is-mobile="true"
                @close="closeDrawer"
              />
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Notifications -->
      <Teleport to="body">
        <div class="fixed bottom-12 right-4 z-50 flex flex-col gap-2">
          <TransitionGroup
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 translate-x-8 scale-95"
            leave-active-class="transition-all duration-200"
            leave-to-class="opacity-0 translate-x-8"
          >
            <div
              v-for="notification in notifications"
              :key="notification.id"
              :class="[
                'flex items-center gap-3 rounded-xl px-4 py-3 backdrop-blur-xl border',
                notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                notification.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' :
                notification.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                'bg-violet-500/10 border-violet-500/20 text-violet-300'
              ]"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  v-if="notification.type === 'success'"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
                <path
                  v-else-if="notification.type === 'error'"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
                <path
                  v-else
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span class="text-sm">{{ notification.message }}</span>
              <button
                class="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
                @click="uiStore.dismissNotification(notification.id)"
              >
                <svg
                  class="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </TransitionGroup>
        </div>
      </Teleport>
    </BackgroundTexture>
  </Transition>

  <!-- Loading Overlay - OUTSIDE v-show so it always renders -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-all duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isLoading"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-dark-950/90 backdrop-blur-xl"
      >
        <div class="bg-dark-800 border border-white/10 rounded-2xl px-8 py-6 min-w-[320px] shadow-2xl">
          <div class="flex items-center gap-4 mb-4">
            <div class="relative w-6 h-6">
              <div class="absolute inset-0 rounded-full border-2 border-violet-500/20" />
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 animate-spin" />
            </div>
            <span class="text-white font-medium">{{ loadingMessage }}</span>
          </div>
          <div
            v-if="importProgress"
            class="space-y-2"
          >
            <div class="flex justify-between text-sm text-white/60">
              <span>{{ importProgress.status }}</span>
              <span class="font-mono">{{ progressPercent }}%</span>
            </div>
            <div class="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                class="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-150"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>
            <div class="text-xs text-white/40 text-center">
              Page {{ importProgress.currentPage }} of {{ importProgress.totalPages }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Import Options Dialog -->
  <ImportOptionsDialog 
    :show="showImportDialog"
    :file-name="pendingImportFile?.name"
    @close="showImportDialog = false; pendingImportFile = null" 
    @confirm="handleImportConfirm" 
  />
</template>
