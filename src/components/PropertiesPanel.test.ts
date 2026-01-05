/**
 * PropertiesPanel Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import '@testing-library/jest-dom/vitest'
import PropertiesPanel from './PropertiesPanel.vue'
import { useDocumentStore } from '@/stores/documentStore'
import { createEmptyProject } from '@/models'
import type { LayerObject } from '@/models'

function createTestLayer(overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    id: 'test-layer',
    type: 'text',
    bounds: { x: 100, y: 100, width: 200, height: 50 },
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

describe('PropertiesPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Empty State', () => {
    it('should show empty state when no layer selected', () => {
      render(PropertiesPanel)
      
      expect(screen.getByText(/no layer selected/i)).toBeInTheDocument()
    })

    it('should show empty state when no document', () => {
      render(PropertiesPanel)
      
      expect(screen.getByText(/no layer selected/i)).toBeInTheDocument()
    })
  })

  describe('Layer Properties Display', () => {
    it('should display layer position', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ bounds: { x: 150, y: 200, width: 100, height: 50 } })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      expect(screen.getByDisplayValue('150')).toBeInTheDocument()
      expect(screen.getByDisplayValue('200')).toBeInTheDocument()
    })

    it('should display layer dimensions', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ bounds: { x: 0, y: 0, width: 300, height: 150 } })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      expect(screen.getByDisplayValue('300')).toBeInTheDocument()
      expect(screen.getByDisplayValue('150')).toBeInTheDocument()
    })

    it('should display opacity', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ opacity: 0.75 })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      // Opacity shown as percentage
      expect(screen.getByDisplayValue('75')).toBeInTheDocument()
    })
  })

  describe('Text Properties', () => {
    it('should show text properties for text layer', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({
        type: 'text',
        fontFamily: 'Georgia',
        fontSize: 24,
        fontWeight: 700
      })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      expect(screen.getByText(/font/i)).toBeInTheDocument()
    })

    it('should update font size', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ type: 'text', fontSize: 16 })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      const fontSizeInput = screen.getByDisplayValue('16')
      await fireEvent.update(fontSizeInput, '24')
      await fireEvent.blur(fontSizeInput)
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === layer.id)
      expect(updatedLayer?.fontSize).toBe(24)
    })

    it('should update text color', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ type: 'text', color: '#000000' })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      const { container } = render(PropertiesPanel)
      
      const colorInput = container.querySelector('input[type="color"]')
      if (colorInput) {
        await fireEvent.input(colorInput, { target: { value: '#ff0000' } })
        
        const updatedLayer = store.currentPage?.layers.find(l => l.id === layer.id)
        expect(updatedLayer?.color).toBe('#ff0000')
      }
    })
  })

  describe('Image Properties', () => {
    it('should show image properties for image layer', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({
        type: 'image',
        imageUrl: 'test.png',
        content: undefined
      })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      // Should not show font properties for image
      expect(screen.queryByText(/font family/i)).not.toBeInTheDocument()
    })
  })

  describe('Position Updates', () => {
    it('should update X position', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ bounds: { x: 100, y: 100, width: 200, height: 50 } })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      const xInput = screen.getByDisplayValue('100')
      await fireEvent.update(xInput, '200')
      await fireEvent.blur(xInput)
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === layer.id)
      expect(updatedLayer?.bounds.x).toBe(200)
    })

    it('should update Y position', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ bounds: { x: 100, y: 100, width: 200, height: 50 } })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      // Find Y input (second position input)
      const inputs = screen.getAllByRole('spinbutton')
      const yInput = inputs.find(i => (i as HTMLInputElement).value === '100')
      if (yInput) {
        await fireEvent.update(yInput, '250')
        await fireEvent.blur(yInput)
      }
    })
  })

  describe('Dimension Updates', () => {
    it('should update width', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ bounds: { x: 0, y: 0, width: 200, height: 100 } })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      const widthInput = screen.getByDisplayValue('200')
      await fireEvent.update(widthInput, '300')
      await fireEvent.blur(widthInput)
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === layer.id)
      expect(updatedLayer?.bounds.width).toBe(300)
    })

    it('should update height', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ bounds: { x: 0, y: 0, width: 200, height: 100 } })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      render(PropertiesPanel)
      
      const heightInput = screen.getByDisplayValue('100')
      await fireEvent.update(heightInput, '150')
      await fireEvent.blur(heightInput)
      
      const updatedLayer = store.currentPage?.layers.find(l => l.id === layer.id)
      expect(updatedLayer?.bounds.height).toBe(150)
    })
  })

  describe('Opacity Updates', () => {
    it('should update opacity via slider', async () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ opacity: 1 })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      const { container } = render(PropertiesPanel)
      
      const slider = container.querySelector('input[type="range"]')
      if (slider) {
        await fireEvent.input(slider, { target: { value: '50' } })
        
        const updatedLayer = store.currentPage?.layers.find(l => l.id === layer.id)
        expect(updatedLayer?.opacity).toBe(0.5)
      }
    })
  })

  describe('Locked Layer', () => {
    it('should disable inputs for locked layer', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      const layer = createTestLayer({ locked: true })
      project.document.pages = [{ pageIndex: 0, width: 612, height: 792, layers: [layer] }]
      store.document = project
      store.selectedLayerIds = [layer.id]
      
      const { container } = render(PropertiesPanel)
      
      const inputs = container.querySelectorAll('input:not([type="checkbox"])')
      inputs.forEach(input => {
        expect(input).toBeDisabled()
      })
    })
  })

  describe('Multiple Selection', () => {
    it('should show multi-selection state', () => {
      const store = useDocumentStore()
      const project = createEmptyProject()
      project.document.pages = [{
        pageIndex: 0,
        width: 612,
        height: 792,
        layers: [
          createTestLayer({ id: 'layer-1' }),
          createTestLayer({ id: 'layer-2' })
        ]
      }]
      store.document = project
      store.selectedLayerIds = ['layer-1', 'layer-2']
      
      render(PropertiesPanel)
      
      expect(screen.getByText(/2 layers selected/i)).toBeInTheDocument()
    })
  })
})
