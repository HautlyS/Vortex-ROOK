
import { render, fireEvent, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import Toolbar from './Toolbar.vue'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { createEmptyProject } from '@/models'

// Mock the bridge module
vi.mock('@/bridge', () => ({
  exportDocument: vi.fn(),
  isTauri: vi.fn(() => true),
}))

describe('Toolbar.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders correctly', () => {
    render(Toolbar)
    expect(screen.getByTitle('Import (Ctrl+O)')).toBeInTheDocument()
    expect(screen.queryAllByTitle('Export').length).toBeGreaterThan(0)
  })

  it('disables buttons when no document is open', () => {
    const documentStore = useDocumentStore()
    documentStore.document = null
    render(Toolbar)

    expect(screen.getByTitle('Save Project')).toBeDisabled()
    const exportButtons = screen.queryAllByTitle('Export')
    expect(exportButtons.length).toBeGreaterThan(0)
    exportButtons.forEach(button => expect(button).toBeDisabled())
    expect(screen.getByTitle('Add Watermark')).toBeDisabled()
  })

  it('enables buttons when a document is open', () => {
    const documentStore = useDocumentStore()
    documentStore.document = createEmptyProject()
    render(Toolbar)

    expect(screen.getByTitle('Save Project')).not.toBeDisabled()
    const exportButtons = screen.queryAllByTitle('Export')
    expect(exportButtons.length).toBeGreaterThan(0)
    // At least one export button should be enabled
    expect(exportButtons.some(b => !b.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByTitle('Add Watermark')).not.toBeDisabled()
  })

  it('calls importDocument when import button is clicked', async () => {
    const documentStore = useDocumentStore()
    const importSpy = vi.spyOn(documentStore, 'importDocument').mockResolvedValue(true)
    render(Toolbar)

    await fireEvent.click(screen.getByTitle('Import (Ctrl+O)'))

    expect(importSpy).toHaveBeenCalled()
  })

  it('calls undo when undo button is clicked', async () => {
    const documentStore = useDocumentStore()
    documentStore.undoStack = [{ type: 'layer_add', pageIndex: 0, layerId: '1', timestamp: '', previousState: null, newState: null }]
    const undoSpy = vi.spyOn(documentStore, 'undo')
    render(Toolbar)

    await fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'))

    expect(undoSpy).toHaveBeenCalled()
  })

  it('calls redo when redo button is clicked', async () => {
    const documentStore = useDocumentStore()
    documentStore.redoStack = [{ type: 'layer_add', pageIndex: 0, layerId: '1', timestamp: '', previousState: null, newState: null }]
    const redoSpy = vi.spyOn(documentStore, 'redo')
    render(Toolbar)

    await fireEvent.click(screen.getByTitle('Redo (Ctrl+Shift+Z)'))

    expect(redoSpy).toHaveBeenCalled()
  })

  it('calls zoomIn when zoom in button is clicked', async () => {
    const uiStore = useUIStore()
    const zoomInSpy = vi.spyOn(uiStore, 'zoomIn')
    render(Toolbar)

    await fireEvent.click(screen.getByTitle('Zoom In'))

    expect(zoomInSpy).toHaveBeenCalledWith(0.1)
  })

  it('calls zoomOut when zoom out button is clicked', async () => {
    const uiStore = useUIStore()
    const zoomOutSpy = vi.spyOn(uiStore, 'zoomOut')
    render(Toolbar)

    await fireEvent.click(screen.getByTitle('Zoom Out'))

    expect(zoomOutSpy).toHaveBeenCalledWith(0.1)
  })

  it('opens export dialog on click', async () => {
    const documentStore = useDocumentStore()
    documentStore.document = createEmptyProject()
    const uiStore = useUIStore()
    vi.spyOn(uiStore, 'openDialog')
    render(Toolbar)

    // Find the enabled export button and click it
    const exportButtons = screen.queryAllByTitle('Export')
    const enabledExportButton = exportButtons.find(b => !b.hasAttribute('disabled'))
    expect(enabledExportButton).toBeDefined()

    await fireEvent.click(enabledExportButton!)

    // Check for a title inside the dialog that appears
    expect(await screen.findByText('Export Document')).toBeInTheDocument();
  })
})
