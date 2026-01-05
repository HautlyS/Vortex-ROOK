/**
 * Sync Store Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSyncStore } from './syncStore'

// Mock liveSync module
vi.mock('@/bridge/liveSync', () => ({
  initLiveSync: vi.fn(),
  disconnectLiveSync: vi.fn(),
  sendLayerUpdate: vi.fn(),
  sendPageChange: vi.fn(),
  sendCursorPosition: vi.fn(),
  isConnected: vi.fn(() => false),
  getSessionId: vi.fn(() => null),
  getConnectedUsers: vi.fn(() => [])
}))

describe('SyncStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should not be connected initially', () => {
      const store = useSyncStore()
      expect(store.isConnected).toBe(false)
    })

    it('should have no session initially', () => {
      const store = useSyncStore()
      expect(store.sessionId).toBeNull()
    })

    it('should have empty connected users', () => {
      const store = useSyncStore()
      expect(store.connectedUsers).toEqual([])
    })

    it('should not be syncing initially', () => {
      const store = useSyncStore()
      expect(store.isSyncing).toBe(false)
    })
  })

  describe('Connection Management', () => {
    it('should update connection status', () => {
      const store = useSyncStore()
      store.setConnected(true)
      expect(store.isConnected).toBe(true)
    })

    it('should set session ID', () => {
      const store = useSyncStore()
      store.setSessionId('test-session-123')
      expect(store.sessionId).toBe('test-session-123')
    })

    it('should clear session on disconnect', () => {
      const store = useSyncStore()
      store.setSessionId('test-session')
      store.setConnected(true)
      
      store.disconnect()
      
      expect(store.isConnected).toBe(false)
      expect(store.sessionId).toBeNull()
    })
  })

  describe('User Management', () => {
    it('should add connected user', () => {
      const store = useSyncStore()
      store.addUser({ id: 'user-1', name: 'Test User', color: '#ff0000' })
      
      expect(store.connectedUsers).toHaveLength(1)
      expect(store.connectedUsers[0].name).toBe('Test User')
    })

    it('should remove disconnected user', () => {
      const store = useSyncStore()
      store.addUser({ id: 'user-1', name: 'Test User', color: '#ff0000' })
      store.removeUser('user-1')
      
      expect(store.connectedUsers).toHaveLength(0)
    })

    it('should not add duplicate users', () => {
      const store = useSyncStore()
      store.addUser({ id: 'user-1', name: 'Test User', color: '#ff0000' })
      store.addUser({ id: 'user-1', name: 'Test User', color: '#ff0000' })
      
      expect(store.connectedUsers).toHaveLength(1)
    })
  })

  describe('Cursor Tracking', () => {
    it('should update user cursor position', () => {
      const store = useSyncStore()
      store.addUser({ id: 'user-1', name: 'Test', color: '#ff0000' })
      
      store.updateCursor('user-1', { x: 100, y: 200, pageIndex: 0 })
      
      const user = store.connectedUsers.find(u => u.id === 'user-1')
      expect(user?.cursorX).toBe(100)
      expect(user?.cursorY).toBe(200)
      expect(user?.cursorPage).toBe(0)
    })
  })

  describe('Sync Status', () => {
    it('should track syncing state', () => {
      const store = useSyncStore()
      store.setSyncing(true)
      expect(store.isSyncing).toBe(true)
      
      store.setSyncing(false)
      expect(store.isSyncing).toBe(false)
    })

    it('should track last sync time', () => {
      const store = useSyncStore()
      const before = Date.now()
      
      store.updateLastSync()
      
      expect(store.lastSyncTime).toBeGreaterThanOrEqual(before)
    })
  })

  describe('Conflict Resolution', () => {
    it('should detect conflicts', () => {
      const store = useSyncStore()
      store.setConnected(true)
      
      // Simulate conflict scenario
      store.addPendingChange({ type: 'layer', id: 'layer-1', timestamp: Date.now() })
      store.addPendingChange({ type: 'layer', id: 'layer-1', timestamp: Date.now() + 100 })
      
      expect(store.hasConflicts).toBe(true)
    })

    it('should resolve conflicts with latest-wins strategy', () => {
      const store = useSyncStore()
      const older = { type: 'layer' as const, id: 'layer-1', timestamp: 1000, data: { content: 'old' } }
      const newer = { type: 'layer' as const, id: 'layer-1', timestamp: 2000, data: { content: 'new' } }
      
      store.addPendingChange(older)
      store.addPendingChange(newer)
      
      const resolved = store.resolveConflicts()
      expect(resolved[0].data.content).toBe('new')
    })
  })
})
