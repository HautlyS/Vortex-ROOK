/**
 * Theme Store Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore } from './themeStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('ThemeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should have default colors', () => {
      const store = useThemeStore()
      expect(store.colors.accent).toBe('#a78bfa')
      expect(store.colors.secondary).toBe('#f472b6')
      expect(store.colors.tertiary).toBe('#67e8f9')
      expect(store.colors.selection).toBe('#a78bfa')
    })

    it('should have invertSelection false by default', () => {
      const store = useThemeStore()
      expect(store.invertSelection).toBe(false)
    })
  })

  describe('Color Management', () => {
    it('should set individual color', () => {
      const store = useThemeStore()
      store.setColor('accent', '#ff0000')
      expect(store.colors.accent).toBe('#ff0000')
    })

    it('should reset colors to defaults', () => {
      const store = useThemeStore()
      store.setColor('accent', '#ff0000')
      store.setColor('secondary', '#00ff00')
      
      store.resetColors()
      
      expect(store.colors.accent).toBe('#a78bfa')
      expect(store.colors.secondary).toBe('#f472b6')
    })
  })

  describe('CSS Variables', () => {
    it('should generate correct CSS variables', () => {
      const store = useThemeStore()
      const vars = store.cssVariables
      
      expect(vars['--theme-accent']).toBe('#a78bfa')
      expect(vars['--theme-secondary']).toBe('#f472b6')
      expect(vars['--theme-tertiary']).toBe('#67e8f9')
    })

    it('should include RGB values', () => {
      const store = useThemeStore()
      const vars = store.cssVariables
      
      expect(vars['--theme-accent-rgb']).toMatch(/\d+, \d+, \d+/)
    })
  })

  describe('Selection Color', () => {
    it('should return selection color when not inverted', () => {
      const store = useThemeStore()
      expect(store.selectionColor).toBe('#a78bfa')
    })

    it('should return contrast color when inverted', () => {
      const store = useThemeStore()
      store.invertSelection = true
      // Light accent color should give dark contrast
      expect(store.selectionColor).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  describe('Persistence', () => {
    it('should load saved theme from localStorage', () => {
      localStorageMock.setItem('rook-theme', JSON.stringify({
        colors: { accent: '#ff0000', secondary: '#00ff00', tertiary: '#0000ff', selection: '#ff0000' },
        invertSelection: true
      }))
      
      setActivePinia(createPinia())
      const store = useThemeStore()
      
      expect(store.colors.accent).toBe('#ff0000')
      expect(store.invertSelection).toBe(true)
    })
  })
})
