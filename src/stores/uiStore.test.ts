/**
 * UI Store Tests
 *
 * Unit tests and property-based tests for UI state management.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import * as fc from 'fast-check'
import { useUIStore } from './uiStore'

// Constants from the store to use in tests
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5.0
const DEFAULT_ZOOM = 2.6

describe('UIStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Zoom', () => {
    it('should have default zoom of 2.6', () => {
      const store = useUIStore()
      expect(store.zoom).toBe(DEFAULT_ZOOM)
      expect(store.zoomPercent).toBe(100)
    })

    it('should set zoom within valid range', () => {
      const store = useUIStore()
      store.setZoom(2.0)
      expect(store.zoom).toBe(2.0)
      // zoomPercent is relative to the default zoom
      expect(store.zoomPercent).toBe(Math.round((2.0 / DEFAULT_ZOOM) * 100))
    })

    it('should clamp zoom to minimum', () => {
      const store = useUIStore()
      store.setZoom(0.05)
      expect(store.zoom).toBe(MIN_ZOOM)
    })

    it('should clamp zoom to maximum', () => {
      const store = useUIStore()
      store.setZoom(10.0)
      expect(store.zoom).toBe(MAX_ZOOM)
    })

    it('should zoom in', () => {
      const store = useUIStore()
      store.resetZoom() // start from default
      const initialZoom = store.zoom
      store.zoomIn(0.25)
      expect(store.zoom).toBe(initialZoom + 0.25)
    })

    it('should zoom out', () => {
      const store = useUIStore()
      store.resetZoom() // start from default
      const initialZoom = store.zoom
      store.zoomOut(0.25)
      expect(store.zoom).toBe(initialZoom - 0.25)
    })

    it('should reset zoom', () => {
      const store = useUIStore()
      store.setZoom(2.5)
      store.resetZoom()
      expect(store.zoom).toBe(DEFAULT_ZOOM)
    })

    /**
     * Property 6: Zoom Range Clamping
     * For any zoom level input, the resulting zoom SHALL be clamped to [0.1, 5.0].
     *
     * Feature: book-creation-converter, Property 6: Zoom Range Clamping
     * Validates: Requirements 4.6
     */
    it('Property 6: Zoom is always clamped to valid range', () => {
      fc.assert(
        fc.property(fc.float({ min: -100, max: 100, noNaN: true }), (zoomLevel) => {
          const store = useUIStore()
          store.setZoom(zoomLevel)
          expect(store.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
          expect(store.zoom).toBeLessThanOrEqual(MAX_ZOOM)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Panel Visibility', () => {
    it('should have all panels visible by default', () => {
      const store = useUIStore()
      expect(store.isPagesVisible).toBe(true)
      expect(store.isLayersVisible).toBe(true)
      expect(store.isPropertiesVisible).toBe(true)
    })

    it('should toggle panel visibility', () => {
      const store = useUIStore()
      store.togglePanel('pages')
      expect(store.isPagesVisible).toBe(false)
      store.togglePanel('pages')
      expect(store.isPagesVisible).toBe(true)
    })

    it('should set panel visibility directly', () => {
      const store = useUIStore()
      store.setPanel('layers', false)
      expect(store.isLayersVisible).toBe(false)
    })
  })

  describe('Dialog', () => {
    it('should have no active dialog by default', () => {
      const store = useUIStore()
      expect(store.activeDialog).toBeNull()
    })

    it('should open dialog', () => {
      const store = useUIStore()
      store.openDialog('import')
      expect(store.activeDialog).toBe('import')
    })

    it('should close dialog', () => {
      const store = useUIStore()
      store.openDialog('export')
      store.closeDialog()
      expect(store.activeDialog).toBeNull()
    })
  })

  describe('Loading State', () => {
    it('should not be loading by default', () => {
      const store = useUIStore()
      expect(store.isLoading).toBe(false)
      expect(store.loadingMessage).toBe('')
    })

    it('should set loading state with message', () => {
      const store = useUIStore()
      store.setLoading(true, 'Importing document...')
      expect(store.isLoading).toBe(true)
      expect(store.loadingMessage).toBe('Importing document...')
    })
  })

  describe('Import Progress', () => {
    it('should have no progress by default', () => {
      const store = useUIStore()
      expect(store.importProgress).toBeNull()
    })

    it('should update import progress', () => {
      const store = useUIStore()
      store.updateImportProgress({
        currentPage: 5,
        totalPages: 10,
        status: 'Processing...'
      })
      expect(store.importProgress?.currentPage).toBe(5)
      expect(store.importProgress?.totalPages).toBe(10)
    })
  })

  describe('Status Message', () => {
    it('should have default status', () => {
      const store = useUIStore()
      expect(store.statusMessage).toBe('Ready')
    })

    it('should update status message', () => {
      const store = useUIStore()
      store.setStatus('Document loaded')
      expect(store.statusMessage).toBe('Document loaded')
    })
  })
})
