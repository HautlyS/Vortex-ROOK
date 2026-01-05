/**
 * E2E-Style Workflow Tests
 * Tests complete user workflows from start to finish
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeStore } from '@/stores/themeStore'
import { useSyncStore } from '@/stores/syncStore'
import { createEmptyProject } from '@/models'

// Mock all external dependencies
vi.mock('@/bridge', () => ({
  importDocumentWithAnalysis: vi.fn(),
  exportDocument: vi.fn(),
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  isTauri: vi.fn(() => false),
  updateLayer: vi.fn().mockResolvedValue({})
}))

vi.mock('@/bridge/liveSync', () => ({
  initLiveSync: vi.fn(),
  disconnectLiveSync: vi.fn(),
  sendLayerUpdate: vi.fn(),
  sendCursorPosition: vi.fn(),
  isConnected: vi.fn(() => false),
  getSessionId: vi.fn(() => null)
}))

function createRealisticDocument(): ReturnType<typeof createEmptyProject> {
  const project = createEmptyProject()
  project.metadata.title = 'My Document'
  project.metadata.author = 'Test User'
  project.document.pages = [
    {
      pageIndex: 0,
      width: 612,
      height: 792,
      dpi: 72,
      layers: [
        { id: 'header-1', type: 'text', bounds: { x: 50, y: 50, width: 512, height: 40 }, visible: true, locked: false, zIndex: 0, opacity: 1, content: 'Chapter 1: Introduction', fontFamily: 'Georgia', fontSize: 24, fontWeight: 700, sourceType: 'extracted', role: 'header' },
        { id: 'para-1', type: 'text', bounds: { x: 50, y: 120, width: 512, height: 200 }, visible: true, locked: false, zIndex: 1, opacity: 1, content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', fontFamily: 'Times New Roman', fontSize: 12, fontWeight: 400, sourceType: 'extracted', role: 'content' },
        { id: 'image-1', type: 'image', bounds: { x: 150, y: 350, width: 300, height: 200 }, visible: true, locked: false, zIndex: 2, opacity: 1, imageUrl: 'https://example.com/image1.png', sourceType: 'extracted', role: 'content' }
      ]
    },
    {
      pageIndex: 1,
      width: 612,
      height: 792,
      dpi: 72,
      layers: [
        { id: 'header-2', type: 'text', bounds: { x: 50, y: 50, width: 512, height: 40 }, visible: true, locked: false, zIndex: 0, opacity: 1, content: 'Chapter 2: Methods', fontFamily: 'Georgia', fontSize: 24, fontWeight: 700, sourceType: 'extracted', role: 'header' },
        { id: 'para-2', type: 'text', bounds: { x: 50, y: 120, width: 512, height: 300 }, visible: true, locked: false, zIndex: 1, opacity: 1, content: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.', fontFamily: 'Times New Roman', fontSize: 12, fontWeight: 400, sourceType: 'extracted', role: 'content' }
      ]
    },
    {
      pageIndex: 2,
      width: 612,
      height: 792,
      dpi: 72,
      layers: [
        { id: 'header-3', type: 'text', bounds: { x: 50, y: 50, width: 512, height: 40 }, visible: true, locked: false, zIndex: 0, opacity: 1, content: 'Chapter 3: Results', fontFamily: 'Georgia', fontSize: 24, fontWeight: 700, sourceType: 'extracted', role: 'header' },
        { id: 'table-1', type: 'vector', bounds: { x: 50, y: 120, width: 512, height: 300 }, visible: true, locked: false, zIndex: 1, opacity: 1, sourceType: 'extracted', role: 'content' }
      ]
    }
  ]
  return project
}

describe('E2E Workflow: Document Editing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Scenario: User opens document and edits text', () => {
    it('should complete full editing workflow', async () => {
      const documentStore = useDocumentStore()
      const uiStore = useUIStore()
      
      // Step 1: User opens application (document is null)
      expect(documentStore.hasDocument).toBe(false)
      expect(uiStore.statusMessage).toBe('Ready')
      
      // Step 2: User imports a document
      const { importDocumentWithAnalysis } = await import('@/bridge')
      vi.mocked(importDocumentWithAnalysis).mockResolvedValue({
        success: true,
        message: 'Document imported',
        data: createRealisticDocument().document
      })
      
      uiStore.setLoading(true, 'Importing document...')
      const importResult = await documentStore.importDocument()
      uiStore.setLoading(false)
      
      expect(importResult).toBe(true)
      expect(documentStore.hasDocument).toBe(true)
      expect(documentStore.totalPages).toBe(3)
      
      // Step 3: User navigates to page 2
      documentStore.goToPage(1)
      expect(documentStore.currentPageIndex).toBe(1)
      expect(documentStore.currentPage!.layers.length).toBe(2)
      
      // Step 4: User selects the header text
      documentStore.selectLayer('header-2', false)
      expect(documentStore.selectedLayerIds).toContain('header-2')
      expect(documentStore.selectedLayers.length).toBe(1)
      
      // Step 5: User edits the header text
      documentStore.updateLayer(1, 'header-2', { 
        content: 'Chapter 2: Methodology',
        fontWeight: 700
      })
      
      const updatedHeader = documentStore.currentPage!.layers.find(l => l.id === 'header-2')
      expect(updatedHeader?.content).toBe('Chapter 2: Methodology')
      
      // Step 6: User changes font size
      documentStore.updateLayer(1, 'header-2', { fontSize: 28 })
      expect(updatedHeader?.fontSize).toBe(28)
      
      // Step 7: User realizes mistake and undoes
      documentStore.undo()
      const afterUndo = documentStore.currentPage!.layers.find(l => l.id === 'header-2')
      expect(afterUndo?.fontSize).toBe(24) // Original size
      
      // Step 8: User redoes the change
      documentStore.redo()
      const afterRedo = documentStore.currentPage!.layers.find(l => l.id === 'header-2')
      expect(afterRedo?.fontSize).toBe(28)
      
      // Step 9: User saves the document
      const { saveProject } = await import('@/bridge')
      vi.mocked(saveProject).mockResolvedValue({ success: true, message: 'Saved' })
      
      const saveResult = await documentStore.saveProject()
      expect(saveResult.success).toBe(true)
    })
  })

  describe('Scenario: User manages layers', () => {
    it('should complete layer management workflow', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createRealisticDocument()
      
      // Step 1: User views layers on page 1
      expect(documentStore.currentPage!.layers.length).toBe(3)
      
      // Step 2: User hides an image layer
      documentStore.updateLayer(0, 'image-1', { visible: false })
      const hiddenLayer = documentStore.currentPage!.layers.find(l => l.id === 'image-1')
      expect(hiddenLayer?.visible).toBe(false)
      
      // Step 3: User locks the header
      documentStore.updateLayer(0, 'header-1', { locked: true })
      const lockedLayer = documentStore.currentPage!.layers.find(l => l.id === 'header-1')
      expect(lockedLayer?.locked).toBe(true)
      
      // Step 4: User tries to edit locked layer (should fail)
      documentStore.updateLayer(0, 'header-1', { content: 'New Title' })
      expect(lockedLayer?.content).toBe('Chapter 1: Introduction') // Unchanged
      
      // Step 5: User unlocks and edits
      documentStore.updateLayer(0, 'header-1', { locked: false })
      documentStore.updateLayer(0, 'header-1', { content: 'New Title' })
      expect(documentStore.currentPage!.layers.find(l => l.id === 'header-1')?.content).toBe('New Title')
      
      // Step 6: User reorders layers
      documentStore.moveLayerUp(0, 'para-1')
      
      // Step 7: User duplicates a layer
      documentStore.duplicateLayer(0, 'para-1')
      expect(documentStore.currentPage!.layers.length).toBe(4)
      
      // Step 8: User deletes the duplicate
      const duplicateId = documentStore.currentPage!.layers.find(l => l.id !== 'para-1' && l.content?.includes('Lorem'))?.id
      if (duplicateId) {
        documentStore.deleteLayer(0, duplicateId)
      }
      expect(documentStore.currentPage!.layers.length).toBe(3)
    })
  })

  describe('Scenario: User customizes appearance', () => {
    it('should complete theme customization workflow', () => {
      const themeStore = useThemeStore()
      const uiStore = useUIStore()
      
      // Step 1: User opens settings
      uiStore.openDialog('settings')
      expect(uiStore.activeDialog).toBe('settings')
      
      // Step 2: User changes accent color
      themeStore.setColor('accent', '#3b82f6') // Blue
      expect(themeStore.colors.accent).toBe('#3b82f6')
      
      // Step 3: User changes secondary color
      themeStore.setColor('secondary', '#ec4899') // Pink
      expect(themeStore.colors.secondary).toBe('#ec4899')
      
      // Step 4: User enables inverted selection
      themeStore.invertSelection = true
      expect(themeStore.invertSelection).toBe(true)
      
      // Step 5: User checks CSS variables are updated
      const cssVars = themeStore.cssVariables
      expect(cssVars['--theme-accent']).toBe('#3b82f6')
      
      // Step 6: User resets to defaults
      themeStore.resetColors()
      expect(themeStore.colors.accent).toBe('#a78bfa')
      expect(themeStore.invertSelection).toBe(false)
      
      // Step 7: User closes settings
      uiStore.closeDialog()
      expect(uiStore.activeDialog).toBeNull()
    })
  })

  describe('Scenario: User navigates multi-page document', () => {
    it('should complete navigation workflow', () => {
      const documentStore = useDocumentStore()
      const uiStore = useUIStore()
      
      documentStore.document = createRealisticDocument()
      
      // Step 1: User is on page 1
      expect(documentStore.currentPageIndex).toBe(0)
      
      // Step 2: User zooms in
      uiStore.zoomIn(0.5)
      expect(uiStore.zoom).toBeGreaterThan(2.6)
      
      // Step 3: User navigates to next page
      documentStore.nextPage()
      expect(documentStore.currentPageIndex).toBe(1)
      
      // Step 4: User navigates to last page
      documentStore.goToPage(2)
      expect(documentStore.currentPageIndex).toBe(2)
      
      // Step 5: User tries to go beyond last page
      documentStore.nextPage()
      expect(documentStore.currentPageIndex).toBe(2) // Still on last page
      
      // Step 6: User goes to first page
      documentStore.goToPage(0)
      expect(documentStore.currentPageIndex).toBe(0)
      
      // Step 7: User tries to go before first page
      documentStore.previousPage()
      expect(documentStore.currentPageIndex).toBe(0) // Still on first page
      
      // Step 8: User resets zoom
      uiStore.resetZoom()
      expect(uiStore.zoom).toBe(2.6)
    })
  })

  describe('Scenario: User performs multi-select operations', () => {
    it('should complete multi-select workflow', () => {
      const documentStore = useDocumentStore()
      documentStore.document = createRealisticDocument()
      
      // Step 1: User selects first layer
      documentStore.selectLayer('header-1', false)
      expect(documentStore.selectedLayerIds.length).toBe(1)
      
      // Step 2: User adds second layer to selection (Ctrl+click)
      documentStore.selectLayer('para-1', true)
      expect(documentStore.selectedLayerIds.length).toBe(2)
      
      // Step 3: User adds third layer
      documentStore.selectLayer('image-1', true)
      expect(documentStore.selectedLayerIds.length).toBe(3)
      expect(documentStore.selectedLayers.length).toBe(3)
      
      // Step 4: User deselects one layer
      documentStore.deselectLayer('para-1')
      expect(documentStore.selectedLayerIds.length).toBe(2)
      expect(documentStore.selectedLayerIds).not.toContain('para-1')
      
      // Step 5: User clears all selection
      documentStore.clearSelection()
      expect(documentStore.selectedLayerIds.length).toBe(0)
      
      // Step 6: User selects single layer (replaces selection)
      documentStore.selectLayer('header-1', false)
      documentStore.selectLayer('para-1', false) // Not adding
      expect(documentStore.selectedLayerIds.length).toBe(1)
      expect(documentStore.selectedLayerIds).toContain('para-1')
    })
  })

  describe('Scenario: User handles errors gracefully', () => {
    it('should handle import failure', async () => {
      const documentStore = useDocumentStore()
      
      const { importDocumentWithAnalysis } = await import('@/bridge')
      vi.mocked(importDocumentWithAnalysis).mockResolvedValue({
        success: false,
        message: 'File format not supported',
        data: undefined
      })
      
      const result = await documentStore.importDocument()
      
      expect(result).toBe(false)
      expect(documentStore.hasDocument).toBe(false)
      expect(documentStore.error).toBe('File format not supported')
    })

    it('should handle save failure', async () => {
      const documentStore = useDocumentStore()
      documentStore.document = createRealisticDocument()
      
      const { saveProject } = await import('@/bridge')
      vi.mocked(saveProject).mockResolvedValue({
        success: false,
        message: 'Disk full'
      })
      
      const result = await documentStore.saveProject()
      
      expect(result.success).toBe(false)
      expect(result.message).toBe('Disk full')
    })
  })
})

describe('E2E Workflow: Collaborative Editing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Scenario: User joins collaborative session', () => {
    it('should handle sync workflow', async () => {
      const documentStore = useDocumentStore()
      const syncStore = useSyncStore()
      
      // Step 1: User opens document
      documentStore.document = createRealisticDocument()
      
      // Step 2: User initiates sync
      syncStore.setConnected(true)
      syncStore.setSessionId('session-123')
      expect(syncStore.isConnected).toBe(true)
      
      // Step 3: Another user joins
      syncStore.addUser({ id: 'user-2', name: 'Alice', color: '#ff0000' })
      expect(syncStore.connectedUsers.length).toBe(1)
      
      // Step 4: User makes an edit
      documentStore.updateLayer(0, 'header-1', { content: 'Updated by me' })
      
      // Step 5: Sync the change
      syncStore.setSyncing(true)
      syncStore.updateLastSync()
      syncStore.setSyncing(false)
      
      // Step 6: Another user's cursor moves
      syncStore.updateCursor('user-2', { x: 100, y: 200, pageIndex: 0 })
      const user = syncStore.connectedUsers.find(u => u.id === 'user-2')
      expect(user?.cursorX).toBe(100)
      expect(user?.cursorY).toBe(200)
      expect(user?.cursorPage).toBe(0)
      
      // Step 7: User disconnects
      syncStore.disconnect()
      expect(syncStore.isConnected).toBe(false)
    })
  })
})

describe('E2E Workflow: Export Operations', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Scenario: User exports document', () => {
    it('should handle export workflow', async () => {
      const documentStore = useDocumentStore()
      const uiStore = useUIStore()
      
      documentStore.document = createRealisticDocument()
      
      // Step 1: User opens export dialog
      uiStore.openDialog('export')
      expect(uiStore.activeDialog).toBe('export')
      
      // Step 2: User selects format and exports
      const { exportDocument } = await import('@/bridge')
      vi.mocked(exportDocument).mockResolvedValue({
        success: true,
        message: 'Exported successfully'
      })
      
      // Step 3: User closes dialog
      uiStore.closeDialog()
      expect(uiStore.activeDialog).toBeNull()
    })
  })
})
