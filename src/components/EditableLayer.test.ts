/**
 * EditableLayer Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import '@testing-library/jest-dom/vitest'
import EditableLayer from './EditableLayer.vue'
import type { LayerObject } from '@/models'

// Mock composables
vi.mock('@/composables/useImageLoader', () => ({
  getImageUrl: vi.fn((url) => url || '')
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
      
      expect(screen.getByText('Hello World')).toBeInTheDocument()
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
      expect(element.style.color).toBe('rgb(255, 0, 0)')
    })

    it('should render image layer', () => {
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
      
      const img = container.querySelector('img')
      expect(img).toBeInTheDocument()
    })

    it('should show selection indicator when selected', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1,
          selected: true
        }
      })
      
      expect(container.firstChild).toHaveClass('ring-2')
    })
  })

  describe('Interaction', () => {
    it('should emit select on click', async () => {
      const { emitted } = render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      await fireEvent.click(screen.getByText('Test content'))
      
      expect(emitted().select).toBeTruthy()
    })

    it('should enter edit mode on double click', async () => {
      render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      await fireEvent.dblClick(screen.getByText('Test content'))
      
      // Should show textarea for editing
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('should not enter edit mode when locked', async () => {
      render(EditableLayer, {
        props: {
          layer: createTestLayer({ locked: true }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      await fireEvent.dblClick(screen.getByText('Test content'))
      
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('should emit update on content change', async () => {
      const { emitted } = render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      await fireEvent.dblClick(screen.getByText('Test content'))
      const textarea = screen.getByRole('textbox')
      await fireEvent.update(textarea, 'Updated content')
      await fireEvent.blur(textarea)
      
      expect(emitted().update).toBeTruthy()
    })
  })

  describe('Dragging', () => {
    it('should emit updateBounds on drag', async () => {
      const { container, emitted } = render(EditableLayer, {
        props: {
          layer: createTestLayer(),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1,
          selected: true
        }
      })
      
      const element = container.firstChild as HTMLElement
      
      await fireEvent.mouseDown(element, { clientX: 100, clientY: 100 })
      await fireEvent.mouseMove(document, { clientX: 150, clientY: 150 })
      await fireEvent.mouseUp(document)
      
      expect(emitted().updateBounds).toBeTruthy()
    })

    it('should not drag when locked', async () => {
      const { container, emitted } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ locked: true }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1,
          selected: true
        }
      })
      
      const element = container.firstChild as HTMLElement
      
      await fireEvent.mouseDown(element, { clientX: 100, clientY: 100 })
      await fireEvent.mouseMove(document, { clientX: 150, clientY: 150 })
      await fireEvent.mouseUp(document)
      
      expect(emitted().updateBounds).toBeFalsy()
    })
  })

  describe('Visibility', () => {
    it('should hide layer when not visible', () => {
      const { container } = render(EditableLayer, {
        props: {
          layer: createTestLayer({ visible: false }),
          pageWidth: 612,
          pageHeight: 792,
          scale: 1
        }
      })
      
      expect(container.firstChild).toHaveClass('hidden')
    })

    it('should apply opacity', () => {
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
  })
})
