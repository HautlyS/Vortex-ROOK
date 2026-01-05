<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { LayerObject, TextAlign, LayerUpdates } from '@/models'
import FontPicker from './FontPicker.vue'
import { getImageUrl } from '@/composables/useImageLoader'

const props = defineProps<{
  layer: LayerObject
  pageWidth: number
  pageHeight: number
  scale: number
  selected?: boolean
}>()

const emit = defineEmits<{
  update: [updates: LayerUpdates]
  updateBounds: [bounds: { x: number; y: number; width: number; height: number }]
  select: []
}>()

const isEditing = ref(false)
const isDragging = ref(false)
const isResizing = ref(false)
const editableRef = ref<HTMLTextAreaElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const dragStart = ref({ x: 0, y: 0, layerX: 0, layerY: 0 })
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 })
const toolbarPos = ref({ x: 0, y: 0 })

const localContent = ref(props.layer.content || '')
watch(() => props.layer.content, (v) => { localContent.value = v || '' })

const style = computed(() => ({
  left: `${(props.layer.bounds.x / props.pageWidth) * 100}%`,
  top: `${(props.layer.bounds.y / props.pageHeight) * 100}%`,
  width: `${(props.layer.bounds.width / props.pageWidth) * 100}%`,
  height: `${(props.layer.bounds.height / props.pageHeight) * 100}%`,
  fontSize: `${(props.layer.fontSize || 12) * props.scale}px`,
  fontFamily: props.layer.fontFamily || 'Arial',
  fontWeight: props.layer.fontWeight || 400,
  fontStyle: props.layer.fontStyle || 'normal',
  textDecoration: props.layer.textDecoration || 'none',
  color: props.layer.color || '#000000',
  textAlign: props.layer.textAlign || 'left',
  opacity: props.layer.opacity,
  lineHeight: 1.2,
}))

const isBold = computed(() => (props.layer.fontWeight || 400) >= 700)
const isItalic = computed(() => props.layer.fontStyle === 'italic')
const isUnderline = computed(() => props.layer.textDecoration === 'underline')

function onClick(e: MouseEvent) {
  if (!isEditing.value) {
    e.stopPropagation()
    emit('select')
  }
}

function onDoubleClick(e: MouseEvent) {
  if (props.layer.locked) return
  e.stopPropagation()
  isEditing.value = true
  nextTick(() => {
    editableRef.value?.focus()
    editableRef.value?.select()
    updateToolbarPosition()
  })
}

function updateToolbarPosition() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const toolbarWidth = 380
  const toolbarHeight = 44
  
  let x = rect.left
  let y = rect.top - toolbarHeight - 8
  
  // Keep on screen
  if (x + toolbarWidth > window.innerWidth - 10) x = window.innerWidth - toolbarWidth - 10
  if (x < 10) x = 10
  if (y < 10) y = rect.bottom + 8
  
  toolbarPos.value = { x, y }
}

function closeEdit() {
  if (props.layer.type === 'text' && localContent.value !== props.layer.content) {
    emit('update', { content: localContent.value })
  }
  isEditing.value = false
}

function onTextareaBlur(e: FocusEvent) {
  // Don't close if clicking toolbar
  const related = e.relatedTarget as HTMLElement
  if (related && toolbarRef.value?.contains(related)) {
    editableRef.value?.focus()
    return
  }
  closeEdit()
}

function onMouseDown(e: MouseEvent) {
  if (isEditing.value || props.layer.locked) return
  e.preventDefault()
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY, layerX: props.layer.bounds.x, layerY: props.layer.bounds.y }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', onDragEnd)
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return
  const dx = (e.clientX - dragStart.value.x) / props.scale
  const dy = (e.clientY - dragStart.value.y) / props.scale
  emit('updateBounds', {
    x: Math.max(0, dragStart.value.layerX + dx),
    y: Math.max(0, dragStart.value.layerY + dy),
    width: props.layer.bounds.width,
    height: props.layer.bounds.height,
  })
}

function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', onDragEnd)
}

function onResizeStart(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  isResizing.value = true
  resizeStart.value = { x: e.clientX, y: e.clientY, w: props.layer.bounds.width, h: props.layer.bounds.height }
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const dw = (e.clientX - resizeStart.value.x) / props.scale
  const dh = (e.clientY - resizeStart.value.y) / props.scale
  emit('updateBounds', {
    x: props.layer.bounds.x,
    y: props.layer.bounds.y,
    width: Math.max(20, resizeStart.value.w + dw),
    height: Math.max(10, resizeStart.value.h + dh),
  })
}

function onResizeEnd() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', onResizeEnd)
}

function toggleBold() {
  emit('update', { fontWeight: isBold.value ? 400 : 700 })
  editableRef.value?.focus()
}

function toggleItalic() {
  emit('update', { fontStyle: isItalic.value ? 'normal' : 'italic' })
  editableRef.value?.focus()
}

function toggleUnderline() {
  emit('update', { textDecoration: isUnderline.value ? 'none' : 'underline' })
  editableRef.value?.focus()
}

function setAlign(align: TextAlign) {
  emit('update', { textAlign: align })
  editableRef.value?.focus()
}

function updateFont(font: string) { emit('update', { fontFamily: font }) }
function updateFontSize(size: number) { emit('update', { fontSize: Math.max(6, Math.min(200, size)) }) }
function updateColor(color: string) { emit('update', { color }) }

const imageError = ref(false)
const imageBlobUrl = ref<string | null>(null)
const imageLoading = ref(false)

async function loadImageBlob() {
  if (props.layer.type !== 'image' || !props.layer.imageUrl) return
  
  imageLoading.value = true
  imageError.value = false
  
  try {
    // For blob/data URLs, use directly; for image:// URLs, fetch via Tauri
    const url = await getImageUrl(props.layer.imageUrl)
    imageBlobUrl.value = url
    imageError.value = !url
  } catch {
    imageError.value = true
  } finally {
    imageLoading.value = false
  }
}

function onImageError() {
  console.warn('Image failed to load:', props.layer.imageUrl)
  imageError.value = true
}

// Load image on mount and when URL changes
onMounted(() => {
  if (props.layer.type === 'image') loadImageBlob()
})

watch(() => props.layer.imageUrl, () => {
  imageError.value = false
  imageBlobUrl.value = null
  loadImageBlob()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', onResizeEnd)
})
</script>

<template>
  <div
    ref="containerRef"
    class="group absolute select-none"
    :class="{ 
      'cursor-move': !isEditing && !layer.locked,
      'ring-2 ring-violet-500 z-50': isEditing,
      'ring-2 ring-cyan-400/70 z-40': selected && !isEditing,
      'hover:ring-1 hover:ring-violet-400/40': !isEditing && !selected && !layer.locked,
      'cursor-not-allowed opacity-60': layer.locked
    }"
    :style="style"
    @click="onClick"
    @dblclick="onDoubleClick"
    @mousedown="onMouseDown"
  >
    <!-- Text Layer -->
    <template v-if="layer.type === 'text'">
      <div 
        v-if="!isEditing" 
        class="w-full h-full overflow-hidden whitespace-pre-wrap break-words"
        :style="{ textAlign: style.textAlign }"
      >{{ layer.content }}</div>
      <textarea
        v-else
        ref="editableRef"
        v-model="localContent"
        class="editable-textarea w-full h-full bg-transparent border-0 outline-none resize-none p-0.5 rounded-sm caret-violet-400"
        :style="{ 
          fontSize: style.fontSize, 
          fontFamily: style.fontFamily, 
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          textDecoration: style.textDecoration,
          color: style.color,
          textAlign: style.textAlign,
          lineHeight: style.lineHeight
        }"
        @blur="onTextareaBlur"
        @keydown.escape.prevent="closeEdit"
      />
    </template>

    <!-- Image Layer -->
    <template v-else-if="layer.type === 'image'">
      <!-- Loading state -->
      <div v-if="imageLoading" class="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-300 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
      <!-- Loaded image -->
      <img
        v-else-if="imageBlobUrl && !imageError"
        :src="imageBlobUrl"
        class="w-full h-full object-contain pointer-events-none"
        draggable="false"
        @error="onImageError"
      />
      <!-- Image Error/Missing Fallback -->
      <div
        v-else
        class="w-full h-full bg-gray-200 flex items-center justify-center"
      >
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    </template>

    <!-- Shape Layer -->
    <div
      v-else-if="layer.type === 'shape'"
      class="w-full h-full pointer-events-none"
      :style="{
        backgroundColor: layer.fillColor || '#8b5cf6',
        border: `${layer.strokeWidth || 1}px solid ${layer.strokeColor || '#000'}`,
        borderRadius: layer.shapeType === 'circle' ? '50%' : '0'
      }"
    />

    <!-- Selection Handles -->
    <template v-if="(selected || isEditing) && !layer.locked">
      <!-- Corner handles -->
      <div class="absolute -left-1 -top-1 w-2.5 h-2.5 bg-white border-2 border-violet-500 rounded-sm cursor-nw-resize" />
      <div class="absolute -right-1 -top-1 w-2.5 h-2.5 bg-white border-2 border-violet-500 rounded-sm cursor-ne-resize" />
      <div class="absolute -left-1 -bottom-1 w-2.5 h-2.5 bg-white border-2 border-violet-500 rounded-sm cursor-sw-resize" />
      <div 
        class="absolute -right-1 -bottom-1 w-2.5 h-2.5 bg-violet-500 border-2 border-violet-500 rounded-sm cursor-se-resize"
        @mousedown="onResizeStart"
      />
    </template>

    <!-- Resize Handle (hover only when not selected) -->
    <div
      v-else-if="!layer.locked"
      class="absolute -right-1 -bottom-1 w-3 h-3 bg-violet-500 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
      @mousedown="onResizeStart"
    />

    <!-- Edit Toolbar -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-150"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-100"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isEditing && layer.type === 'text'"
          ref="toolbarRef"
          class="fixed z-[9999] flex items-center gap-1.5 p-1.5 rounded-xl bg-dark-900/95 backdrop-blur-xl border border-white/10 shadow-2xl"
          :style="{ left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px` }"
          @mousedown.prevent
        >
          <!-- Font Picker -->
          <FontPicker
            :model-value="layer.fontFamily || 'Arial'"
            @update:model-value="updateFont"
            class="!w-32"
          />
          
          <!-- Font Size -->
          <div class="flex items-center bg-white/5 rounded-lg">
            <button 
              @click="updateFontSize((layer.fontSize || 12) - 1)"
              class="px-1.5 py-1 text-white/50 hover:text-white"
              tabindex="-1"
            >−</button>
            <input
              type="number"
              :value="layer.fontSize || 12"
              @change="updateFontSize(Number(($event.target as HTMLInputElement).value))"
              class="w-10 px-1 py-1 text-xs text-center bg-transparent border-0 text-white focus:outline-none"
              min="6" max="200"
              tabindex="-1"
            />
            <button 
              @click="updateFontSize((layer.fontSize || 12) + 1)"
              class="px-1.5 py-1 text-white/50 hover:text-white"
              tabindex="-1"
            >+</button>
          </div>

          <div class="w-px h-6 bg-white/10" />

          <!-- Bold -->
          <button 
            @click="toggleBold"
            :class="['p-1.5 rounded-lg transition-colors', isBold ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
            title="Bold"
            tabindex="-1"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
          </button>

          <!-- Italic -->
          <button 
            @click="toggleItalic"
            :class="['p-1.5 rounded-lg transition-colors', isItalic ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
            title="Italic"
            tabindex="-1"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
          </button>

          <!-- Underline -->
          <button 
            @click="toggleUnderline"
            :class="['p-1.5 rounded-lg transition-colors', isUnderline ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
            title="Underline"
            tabindex="-1"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
          </button>

          <div class="w-px h-6 bg-white/10" />

          <!-- Alignment -->
          <button 
            @click="setAlign('left')"
            :class="['p-1.5 rounded-lg transition-colors', layer.textAlign === 'left' || !layer.textAlign ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
            title="Align Left"
            tabindex="-1"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
          </button>
          <button 
            @click="setAlign('center')"
            :class="['p-1.5 rounded-lg transition-colors', layer.textAlign === 'center' ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
            title="Align Center"
            tabindex="-1"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
          </button>
          <button 
            @click="setAlign('right')"
            :class="['p-1.5 rounded-lg transition-colors', layer.textAlign === 'right' ? 'bg-violet-500/30 text-violet-300' : 'text-white/50 hover:text-white hover:bg-white/10']"
            title="Align Right"
            tabindex="-1"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
          </button>

          <div class="w-px h-6 bg-white/10" />

          <!-- Color -->
          <div class="relative">
            <input
              type="color"
              :value="layer.color || '#000000'"
              @input="updateColor(($event.target as HTMLInputElement).value)"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              tabindex="-1"
            />
            <div 
              class="w-7 h-7 rounded-lg border-2 border-white/20 cursor-pointer"
              :style="{ backgroundColor: layer.color || '#000000' }"
            />
          </div>

          <!-- Done -->
          <button 
            @click="closeEdit" 
            class="ml-1 px-2.5 py-1.5 text-xs rounded-lg bg-violet-500 text-white hover:bg-violet-600 font-medium"
            tabindex="-1"
          >Done</button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
