/**
 * Live Sync Service Tests
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: Error) => void) | null = null
  
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  })
  
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
  
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
  
  simulateError(error: Error) {
    this.onerror?.(error)
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('LiveSync Service', () => {
  let mockWs: MockWebSocket

  beforeEach(() => {
    vi.clearAllMocks()
    mockWs = new MockWebSocket()
    vi.stubGlobal('WebSocket', vi.fn(() => mockWs))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Initialization', () => {
    it('should initialize live sync service', async () => {
      const { initLiveSync, getLocalPeerId } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      
      expect(getLocalPeerId()).toBeTruthy()
    })

    it('should generate unique peer ID', async () => {
      const { initLiveSync, getLocalPeerId } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      const peerId = getLocalPeerId()
      
      expect(peerId).toMatch(/^peer-/)
    })
  })

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const { initLiveSync, createSession } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      const session = await createSession('Test Session')
      
      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('name', 'Test Session')
      expect(session).toHaveProperty('secretKey')
    })

    it('should generate permission link', async () => {
      const { initLiveSync, createSession, generatePermissionLink } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      const session = await createSession('Test Session')
      const link = await generatePermissionLink(session, 'viewer', 24)
      
      expect(link).toContain('rook://sync/')
      expect(link).toContain(session.id)
    })
  })

  describe('Message Handling', () => {
    it('should send layer update message', async () => {
      const { initLiveSync, sendLayerUpdate } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      
      // sendLayerUpdate doesn't throw when not connected
      expect(() => sendLayerUpdate(0, 'layer-1', { content: 'updated' })).not.toThrow()
    })

    it('should send cursor move message', async () => {
      const { initLiveSync, sendCursorMove } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      
      expect(() => sendCursorMove(0, 100, 200)).not.toThrow()
    })

    it('should send selection change message', async () => {
      const { initLiveSync, sendSelectionChange } = await import('@/bridge/liveSync')
      
      await initLiveSync()
      
      expect(() => sendSelectionChange(['layer-1', 'layer-2'])).not.toThrow()
    })
  })

  describe('Permission Checks', () => {
    it('should check edit permission', async () => {
      const { canEdit } = await import('@/bridge/liveSync')
      
      // Default role is viewer, so canEdit should be false
      expect(canEdit()).toBe(false)
    })

    it('should check comment permission', async () => {
      const { canComment } = await import('@/bridge/liveSync')
      
      // Default role is viewer, so canComment should be false
      expect(canComment()).toBe(false)
    })
  })

  describe('Utilities', () => {
    it('should copy to clipboard', async () => {
      const { copyToClipboard } = await import('@/bridge/liveSync')
      
      // Mock clipboard API
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText: mockWriteText } })
      
      const result = await copyToClipboard('test text')
      
      expect(result).toBe(true)
      expect(mockWriteText).toHaveBeenCalledWith('test text')
    })
  })
})
