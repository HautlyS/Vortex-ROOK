import { ref, computed, watch } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { updateLayer } from '@/bridge'
import { 
  initTypographyBridge,
  getAvailableFonts,
  loadFont,
  validateFontSupport
} from '@/bridge/typographyBridge'

export interface TypographyState {
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  textDecoration: Set<string>
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textAlign: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
  letterSpacing: number
  color: string
  backgroundColor: string
  textShadow: string
}

export interface FontData {
  family: string
  variants: string[]
  category: string
  isSystem: boolean
}

const defaultState: TypographyState = {
  fontFamily: 'Inter',
  fontSize: 16,
  fontWeight: 400,
  fontStyle: 'normal',
  textDecoration: new Set(),
  textTransform: 'none',
  textAlign: 'left',
  lineHeight: 1.5,
  letterSpacing: 0,
  color: '#000000',
  backgroundColor: 'transparent',
  textShadow: 'none'
}

export function useTypography() {
  const documentStore = useDocumentStore()
  const uiStore = useUIStore()
  
  const state = ref<TypographyState>({ ...defaultState })
  const fonts = ref<FontData[]>([])
  const fontsLoading = ref(false)
  const presets = ref([
    { name: 'Heading 1', fontSize: 32, fontWeight: 700, lineHeight: 1.2 },
    { name: 'Heading 2', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
    { name: 'Body', fontSize: 16, fontWeight: 400, lineHeight: 1.5 },
    { name: 'Caption', fontSize: 12, fontWeight: 400, lineHeight: 1.4 }
  ])

  const selectedLayer = computed(() => documentStore.selectedLayers[0] ?? null)
  const hasTextLayer = computed(() => selectedLayer.value?.type === 'text')
  
  const textDecorationString = computed((): 'none' | 'underline' | 'line-through' => {
    if (state.value.textDecoration.has('underline')) return 'underline'
    if (state.value.textDecoration.has('line-through')) return 'line-through'
    return 'none'
  })

  // Load fonts
  async function loadFonts() {
    if (fontsLoading.value) return
    fontsLoading.value = true
    
    try {
      await initTypographyBridge()
      const { system, google } = await getAvailableFonts()
      
      fonts.value = [
        ...system.map(font => ({ 
          family: font.family, 
          variants: [], 
          category: 'system', 
          isSystem: true 
        })),
        ...google.map(font => ({ 
          family: font.family, 
          variants: font.variants, 
          category: font.category, 
          isSystem: false 
        }))
      ]
    } catch (error) {
      console.error('Failed to load fonts:', error)
      uiStore.showNotification('error', 'Failed to load fonts')
    } finally {
      fontsLoading.value = false
    }
  }

  // Apply formatting
  async function applyFormat(updates: Partial<TypographyState>) {
    if (!hasTextLayer.value || !selectedLayer.value) return
    
    Object.assign(state.value, updates)
    
    // Load and validate font if needed
    if (updates.fontFamily) {
      const font = fonts.value.find(f => f.family === updates.fontFamily)
      if (font && !font.isSystem) {
        try {
          await loadFont(font.family, ['400', '700'])
        } catch (error) {
          console.warn('Failed to load font:', error)
        }
      }
      
      // Validate font support and apply fallback if needed
      const isSupported = await validateFontSupport(updates.fontFamily)
      if (!isSupported) {
        console.warn(`Font ${updates.fontFamily} not supported, using fallback`)
      }
    }
    
    const layerUpdates = {
      fontFamily: state.value.fontFamily,
      fontSize: state.value.fontSize,
      fontWeight: state.value.fontWeight,
      fontStyle: state.value.fontStyle,
      textDecoration: textDecorationString.value,
      textTransform: state.value.textTransform,
      textAlign: state.value.textAlign,
      lineHeight: state.value.lineHeight,
      letterSpacing: state.value.letterSpacing,
      color: state.value.color,
      backgroundColor: state.value.backgroundColor
    }
    
    try {
      const updatedLayer = await updateLayer(
        documentStore.currentPageIndex,
        selectedLayer.value.id,
        layerUpdates,
        selectedLayer.value
      )
      
      if (updatedLayer) {
        documentStore.updateLayer(documentStore.currentPageIndex, selectedLayer.value.id, layerUpdates)
      }
    } catch (error) {
      console.error('Failed to update layer:', error)
      uiStore.showNotification('error', 'Failed to apply formatting')
    }
  }

  // Toggle decorations
  function toggleDecoration(decoration: string) {
    const decorations = new Set(state.value.textDecoration)
    decorations.has(decoration) ? decorations.delete(decoration) : decorations.add(decoration)
    applyFormat({ textDecoration: decorations })
  }

  // Apply preset
  function applyPreset(preset: any) {
    applyFormat(preset)
  }

  // Keyboard shortcuts
  function handleKeyboard(event: KeyboardEvent) {
    if (!hasTextLayer.value) return
    
    const { ctrlKey, metaKey, key } = event
    const cmd = ctrlKey || metaKey
    
    if (cmd) {
      switch (key.toLowerCase()) {
        case 'b':
          event.preventDefault()
          applyFormat({ fontWeight: state.value.fontWeight >= 600 ? 400 : 700 })
          break
        case 'i':
          event.preventDefault()
          applyFormat({ fontStyle: state.value.fontStyle === 'italic' ? 'normal' : 'italic' })
          break
        case 'u':
          event.preventDefault()
          toggleDecoration('underline')
          break
      }
    }
  }

  // Watch selected layer
  watch(selectedLayer, (layer) => {
    if (layer?.type === 'text') {
      const decorations = new Set<string>(layer.textDecoration?.split(' ').filter(Boolean) || [])
      state.value = {
        fontFamily: layer.fontFamily || 'Inter',
        fontSize: layer.fontSize || 16,
        fontWeight: layer.fontWeight || 400,
        fontStyle: layer.fontStyle || 'normal',
        textDecoration: decorations,
        textTransform: layer.textTransform || 'none',
        textAlign: layer.textAlign || 'left',
        lineHeight: layer.lineHeight || 1.5,
        letterSpacing: layer.letterSpacing || 0,
        color: layer.color || '#000000',
        backgroundColor: layer.backgroundColor || 'transparent',
        textShadow: 'none'
      }
    }
  }, { immediate: true })

  return {
    state,
    fonts,
    fontsLoading,
    presets,
    hasTextLayer,
    textDecorationString,
    loadFonts,
    applyFormat,
    toggleDecoration,
    applyPreset,
    handleKeyboard
  }
}
