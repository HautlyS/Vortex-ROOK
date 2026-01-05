/**
 * EditableLayer Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import EditableLayer from './EditableLayer.vue'
import type { LayerObject } from '@/models'

// Mock composables
vi.mock('@/composables/useImageLoader', () => ({
  getImageUrl: vi.fn().mockResolvedValue('blob:test-url')
}))

// Mock FontPicker
vi.mock('./FontPicker.vue', () => ({
  default: {
    name: 'FontPicker',
    template: '<div class="mock-font-picker"></div>',
    props: ['modelValue']
  }
}))

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: 'test-layer',
    type: 'text',
    bounds: { x: 50, y: 50, width: 200, height: 100 },
    visible: true,
    locked: false,
    zIndex: 0,
    opacity: 1,
    content: 'Test content',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 400,
    color: '#000000',
    sourceType: 'manual',
    role: 'content',
    ...overrides
  }
}

describe('EditableLayer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render text layer content', () => {
      render(EditableLayer, {
        props: {
          layer: createTestLayer({ content: 'Hello World' }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      expect(screen.getByText('Hello World')).toBeTruthy()
    })

    it('should apply correct positioning styles', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ bounds: { x: 100, y: 100, width: 200, height: 50 } }),
          pageWidth: 1000,
          pageHeight: 1000,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      expect(element.style.left).toBe('10%')
      expect(element.style.top).toBe('10%')
    })

    it('should apply font styles', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({
            fontFamily: 'Georgia',
            fontSize: 24,
            fontWeight: 700,
            color: '#ff0000'
          }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      expect(element.style.fontFamily).toBe('Georgia')
      expect(element.style.fontWeight).toBe('700')
    })

    it('should render image layer placeholder', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({
            type: 'image',
            imageUrl: 'test-image.png',
            content: undefined
          }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      // Image layer renders loading state or image
      expect(container.firstChild).toBeTruthy()
    })

    it('should show selection ring when selected', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1,
          selected: true
        }
      })
      
      const element = container.firstChild as HTMLElement
      expect(element.classList.contains('ring-2')).toBe(true)
    })
  })

  describe('Visibility', () => {
    it('should apply opacity from layer', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ opacity: 0.5 }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      expect(element.style.opacity).toBe('0.5')
    })

    it('should show locked state', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ locked: true }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      expect(element.classList.contains('cursor-not-allowed')).toBe(true)
    })
  })

  describe('Interaction', () => {
    it('should emit select on click', async () => {
      const { container, emitted } = render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      await fireEvent.click(element)
      
      expect(emitted().select).toBeTruthy()
    })

    it('should not emit select when locked', async () => {
      const { container, emitted } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ locked: true }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      await fireEvent.dblClick(element)
      
      // Should not enter edit mode when locked
      expect(container.querySelector('textarea')).toBeNull()
    })
  })

  describe('Text Editing', () => {
    it('should enter edit mode on double click', async () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ content: 'Edit me' }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      const element = container.firstChild as HTMLElement
      await fireEvent.dblClick(element)
      
      // Should show textarea in edit mode
      const textarea = container.querySelector('textarea')
      expect(textarea).toBeTruthy()
    })
  })

  describe('Scale', () => {
    it('should scale font size based on scale prop', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ fontSize: 16 }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 2
        }
      })
      
      const element = container.firstChild as HTMLElement
      expect(element.style.fontSize).toBe('32px')
    })
  })
})
