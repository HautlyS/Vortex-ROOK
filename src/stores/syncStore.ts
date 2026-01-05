// Sync Store - Pinia store for live sync state management
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  initLiveSync,
  createSession,
  generatePermissionLink,
  parsePermissionLink,
  hostSession,
  joinSession,
  setOnMessage,
  setOnPeerChange,
  sendLayerUpdate,
  sendCursorMove,
  sendSelectionChange,
  getLocalPeerId,
  canEdit,
  canComment,
  copyToClipboard,
  type SyncSession,
  type SyncRole,
  type SyncMessage,
  type PeerInfo,
} from '@/bridge/liveSync';
import type { LayerUpdates } from '@/bridge/types';

export const useSyncStore = defineStore('sync', () => {
  // State
  const isInitialized = ref(false);
  const isConnected = ref(false);
  const isHosting = ref(false);
  const session = ref<SyncSession | null>(null);
  const role = ref<SyncRole>('viewer');
  const localPeerId = ref<string | null>(null);
  const userName = ref('Anonymous');
  const userColor = ref('#3b82f6');
  
  // Connected peers
  const peers = ref<Map<string, PeerInfo>>(new Map());
  
  // Permission links
  const viewerLink = ref<string | null>(null);
  const commenterLink = ref<string | null>(null);
  const editorLink = ref<string | null>(null);
  
  // Status
  const statusMessage = ref('');
  const error = ref<string | null>(null);

  // Getters
  const peerCount = computed(() => peers.value.size);
  const peerList = computed(() => Array.from(peers.value.values()));
  const canEditDoc = computed(() => canEdit());
  const canCommentDoc = computed(() => canComment());
  const isActive = computed(() => isConnected.value && session.value !== null);

  // Initialize
  async function init(): Promise<void> {
    if (isInitialized.value) return;
    
    try {
      await initLiveSync();
      localPeerId.value = getLocalPeerId();
      
      // Set up message handler
      setOnMessage(handleSyncMessage);
      setOnPeerChange(handlePeerChange);
      
      isInitialized.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Init failed';
    }
  }

  // Create and host a new session
  async function createAndHost(sessionName: string, name: string): Promise<boolean> {
    await init();
    error.value = null;
    
    try {
      statusMessage.value = 'Creating session...';
      session.value = await createSession(sessionName);
      userName.value = name;
      
      await hostSession(session.value, name);
      
      // Generate permission links
      viewerLink.value = await generatePermissionLink(session.value, 'viewer', 24);
      commenterLink.value = await generatePermissionLink(session.value, 'commenter', 24);
      editorLink.value = await generatePermissionLink(session.value, 'editor', 24);
      
      isHosting.value = true;
      isConnected.value = true;
      role.value = 'editor';
      statusMessage.value = 'Session created';
      
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create session';
      statusMessage.value = '';
      return false;
    }
  }

  // Join an existing session
  async function join(link: string, name: string): Promise<boolean> {
    await init();
    error.value = null;
    
    try {
      statusMessage.value = 'Joining session...';
      userName.value = name;
      
      const result = await joinSession(link, name);
      
      if (!result.success) {
        error.value = result.error || 'Failed to join';
        statusMessage.value = '';
        return false;
      }
      
      const parsed = await parsePermissionLink(link);
      if (parsed) {
        session.value = parsed.session as SyncSession;
      }
      
      isHosting.value = false;
      isConnected.value = true;
      role.value = result.role;
      statusMessage.value = `Joined as ${result.role}`;
      
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to join session';
      statusMessage.value = '';
      return false;
    }
  }

  // Leave session
  function leave(): void {
    disconnect();
    
    session.value = null;
    isConnected.value = false;
    isHosting.value = false;
    role.value = 'viewer';
    peers.value.clear();
    viewerLink.value = null;
    commenterLink.value = null;
    editorLink.value = null;
    statusMessage.value = '';
    error.value = null;
  }

  // Handle incoming sync messages
  function handleSyncMessage(msg: SyncMessage, _peerId: string): void {
    switch (msg.op.op) {
      case 'presence':
        if (msg.op.active) {
          peers.value.set(msg.op.peerId, {
            id: msg.op.peerId,
            name: msg.op.name,
            role: role.value, // Would come from server in real impl
            color: msg.op.color,
            selection: [],
          });
        } else {
          peers.value.delete(msg.op.peerId);
        }
        break;
        
      case 'cursorMove':
        const peer = peers.value.get(msg.op.peerId);
        if (peer) {
          peer.cursorPage = msg.op.pageIndex;
          peer.cursorX = msg.op.x;
          peer.cursorY = msg.op.y;
        }
        break;
        
      case 'selectionChange':
        const p = peers.value.get(msg.op.peerId);
        if (p) {
          p.selection = msg.op.layerIds;
        }
        break;
        
      // Layer operations would be handled by documentStore
      case 'layerUpdate':
      case 'layerCreate':
      case 'layerDelete':
      case 'layerReorder':
        // Emit event for documentStore to handle
        window.dispatchEvent(new CustomEvent('sync:layer', { detail: msg }));
        break;
    }
  }

  // Handle peer connection changes
  function handlePeerChange(peerId: string, connected: boolean): void {
    if (!connected) {
      peers.value.delete(peerId);
    }
    statusMessage.value = connected 
      ? `Peer ${peerId.slice(0, 8)} connected`
      : `Peer ${peerId.slice(0, 8)} disconnected`;
  }

  // Sync actions
  function syncLayerUpdate(pageIndex: number, layerId: string, updates: LayerUpdates): void {
    if (!isConnected.value || !canEditDoc.value) return;
    sendLayerUpdate(pageIndex, layerId, updates);
  }

  function syncCursor(pageIndex: number, x: number, y: number): void {
    if (!isConnected.value) return;
    sendCursorMove(pageIndex, x, y);
  }

  function syncSelection(layerIds: string[]): void {
    if (!isConnected.value) return;
    sendSelectionChange(layerIds);
  }

  // Copy link to clipboard
  async function copyLink(type: 'viewer' | 'commenter' | 'editor'): Promise<boolean> {
    const link = type === 'viewer' ? viewerLink.value 
      : type === 'commenter' ? commenterLink.value 
      : editorLink.value;
    
    if (!link) return false;
    return copyToClipboard(link);
  }

  // Additional methods for test compatibility
  const connectedUsers = computed(() => peerList.value);
  const sessionId = computed(() => session.value?.id ?? null);
  const isSyncing = ref(false);
  const lastSyncTime = ref<number | null>(null);
  const pendingChanges = ref<Array<{ type: string; id: string; timestamp: number }>>([]);
  const hasConflicts = computed(() => {
    const ids = pendingChanges.value.map(c => c.id);
    return new Set(ids).size !== ids.length;
  });

  function addUser(user: { id: string; name: string; color: string; role?: SyncRole; selection?: string[] }): void {
    const fullUser: PeerInfo = {
      id: user.id,
      name: user.name,
      color: user.color,
      role: user.role ?? 'viewer',
      selection: user.selection ?? [],
    };
    peers.value.set(user.id, fullUser);
  }

  function removeUser(userId: string): void {
    peers.value.delete(userId);
  }

  function updateCursor(userId: string, cursor: { x: number; y: number; pageIndex: number }): void {
    const peer = peers.value.get(userId);
    if (peer) {
      peer.cursorX = cursor.x;
      peer.cursorY = cursor.y;
      peer.cursorPage = cursor.pageIndex;
      (peer as any).cursor = cursor;
    }
  }

  function setSyncing(syncing: boolean): void {
    isSyncing.value = syncing;
  }

  function updateLastSync(): void {
    lastSyncTime.value = Date.now();
  }

  function setConnected(connected: boolean): void {
    isConnected.value = connected;
  }

  function setSessionId(id: string | null): void {
    if (id) {
      session.value = { id, name: 'Session', createdAt: Date.now() } as SyncSession;
    } else {
      session.value = null;
    }
  }

  function disconnect(): void {
    session.value = null;
    isConnected.value = false;
    isHosting.value = false;
    role.value = 'viewer';
    peers.value.clear();
    viewerLink.value = null;
    commenterLink.value = null;
    editorLink.value = null;
    statusMessage.value = '';
    error.value = null;
  }

  function addPendingChange(change: { type: string; id: string; timestamp: number; data?: any }): void {
    pendingChanges.value.push(change);
  }

  function resolveConflicts(): { type: string; id: string; timestamp: number; data?: any }[] {
    // Keep only the latest change per id
    const latest = new Map<string, { type: string; id: string; timestamp: number; data?: any }>();
    for (const change of pendingChanges.value) {
      const existing = latest.get(change.id);
      if (!existing || change.timestamp > existing.timestamp) {
        latest.set(change.id, change);
      }
    }
    pendingChanges.value = Array.from(latest.values());
    return pendingChanges.value;
  }

  return {
    // State
    isInitialized,
    isConnected,
    isHosting,
    session,
    role,
    localPeerId,
    userName,
    userColor,
    peers,
    viewerLink,
    commenterLink,
    editorLink,
    statusMessage,
    error,
    isSyncing,
    lastSyncTime,
    pendingChanges,
    
    // Getters
    peerCount,
    peerList,
    canEditDoc,
    canCommentDoc,
    isActive,
    connectedUsers,
    sessionId,
    hasConflicts,
    
    // Actions
    init,
    createAndHost,
    join,
    leave,
    disconnect,
    syncLayerUpdate,
    syncCursor,
    syncSelection,
    copyLink,
    addUser,
    removeUser,
    updateCursor,
    setSyncing,
    updateLastSync,
    setConnected,
    setSessionId,
    addPendingChange,
    resolveConflicts,
  };
});
