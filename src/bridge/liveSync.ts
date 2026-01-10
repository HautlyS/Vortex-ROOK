// Live Sync Bridge - WebRTC P2P connection management
// Works in both Tauri (native) and Web (browser WebRTC API)

import { isTauri } from './environment';
import type { LayerObject, LayerUpdates, Bounds } from './types';

// Types
export type SyncRole = 'viewer' | 'commenter' | 'editor';

export interface SyncSession {
  id: string;
  name: string;
  secretKey: string;
  createdAt: number;
  hostId: string;
  signalingUrl?: string;
}

export interface PermissionToken {
  sessionId: string;
  role: SyncRole;
  createdAt: number;
  expiresAt?: number;
  creatorId: string;
}

export interface PeerInfo {
  id: string;
  name: string;
  role: SyncRole;
  color: string;
  cursorPage?: number;
  cursorX?: number;
  cursorY?: number;
  selection: string[];
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface RtcConfig {
  iceServers: IceServer[];
}

export interface SyncMessage {
  seq: number;
  timestamp: number;
  senderId: string;
  op: SyncOp;
}

export type SyncOp =
  | { op: 'fullSync'; pages: { pageIndex: number; width: number; height: number; layerCount: number }[] }
  | { op: 'layerCreate'; pageIndex: number; layer: LayerObject }
  | { op: 'layerUpdate'; pageIndex: number; layerId: string; updates: LayerUpdates }
  | { op: 'layerDelete'; pageIndex: number; layerId: string }
  | { op: 'layerReorder'; pageIndex: number; layerIds: string[] }
  | { op: 'cursorMove'; peerId: string; pageIndex: number; x: number; y: number }
  | { op: 'selectionChange'; peerId: string; layerIds: string[] }
  | { op: 'commentAdd'; id: string; pageIndex: number; bounds: Bounds; text: string; author: string }
  | { op: 'commentResolve'; id: string }
  | { op: 'presence'; peerId: string; name: string; color: string; active: boolean }
  | { op: 'ack'; seq: number };

// Tauri invoke
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
let invoke: InvokeFn | null = null;

// WebRTC state
const peerConnections = new Map<string, RTCPeerConnection>();
const dataChannels = new Map<string, RTCDataChannel>();
let localPeerId: string | null = null;
let currentSession: SyncSession | null = null;
let currentRole: SyncRole = 'viewer';
let messageSeq = 0;

// Callbacks
type MessageCallback = (msg: SyncMessage, peerId: string) => void;
type PeerCallback = (peerId: string, connected: boolean) => void;
let onMessage: MessageCallback | null = null;
let onPeerChange: PeerCallback | null = null;

// Default RTC config with public STUN servers
const DEFAULT_RTC_CONFIG: RtcConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

/** Initialize the live sync bridge */
export async function initLiveSync(): Promise<void> {
  if (isTauri()) {
    const tauri = await import('@tauri-apps/api/core');
    invoke = tauri.invoke;
  }
  localPeerId = generatePeerId();
}

/** Generate a unique peer ID */
function generatePeerId(): string {
  return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a random color for peer cursor */
function generatePeerColor(): string {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================================================
// Session Management
// ============================================================================

/** Create a new sync session */
export async function createSession(name: string): Promise<SyncSession> {
  if (isTauri() && invoke) {
    return invoke('create_sync_session', { name }) as Promise<SyncSession>;
  }
  
  // Web fallback: generate session locally
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    name,
    secretKey: btoa(String.fromCharCode(...key)),
    createdAt: Date.now() / 1000,
    hostId: localPeerId || generatePeerId(),
  };
}

/** Generate an encrypted permission link */
export async function generatePermissionLink(
  session: SyncSession,
  role: SyncRole,
  expiresHours?: number
): Promise<string> {
  if (isTauri() && invoke) {
    return invoke('generate_permission_link', { session, role, expiresHours }) as Promise<string>;
  }
  
  // Web fallback: simple base64 encoding (use proper encryption in production)
  const token: PermissionToken = {
    sessionId: session.id,
    role,
    createdAt: Date.now() / 1000,
    expiresAt: expiresHours ? Date.now() / 1000 + expiresHours * 3600 : undefined,
    creatorId: session.hostId,
  };
  
  const payload = JSON.stringify({ ...token, key: session.secretKey });
  const encoded = btoa(payload);
  return `rook://sync/${session.id}/${encoded}`;
}

/** Parse a permission link */
export async function parsePermissionLink(link: string): Promise<{ session: Partial<SyncSession>; token: PermissionToken } | null> {
  try {
    const match = link.match(/rook:\/\/sync\/([^/]+)\/(.+)/);
    if (!match) return null;
    
    const [, sessionId, encoded] = match;
    const payload = JSON.parse(atob(encoded));
    
    // Check expiration
    if (payload.expiresAt && Date.now() / 1000 > payload.expiresAt) {
      throw new Error('Link expired');
    }
    
    return {
      session: { id: sessionId, secretKey: payload.key },
      token: {
        sessionId: payload.sessionId,
        role: payload.role,
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt,
        creatorId: payload.creatorId,
      },
    };
  } catch (e) {
    console.error('Failed to parse permission link:', e);
    return null;
  }
}

// ============================================================================
// WebRTC Connection Management
// ============================================================================

/** Start hosting a sync session */
export async function hostSession(session: SyncSession, userName: string): Promise<void> {
  currentSession = session;
  currentRole = 'editor';
  localPeerId = session.hostId;
  
  // Broadcast presence
  broadcastMessage({
    op: 'presence',
    peerId: localPeerId,
    name: userName,
    color: generatePeerColor(),
    active: true,
  });
}

/** Join a sync session via permission link */
export async function joinSession(
  link: string,
  userName: string,
  signalingUrl?: string
): Promise<{ success: boolean; role: SyncRole; error?: string }> {
  const parsed = await parsePermissionLink(link);
  if (!parsed) {
    return { success: false, role: 'viewer', error: 'Invalid link' };
  }
  
  currentSession = parsed.session as SyncSession;
  currentRole = parsed.token.role;
  
  // Connect to signaling server if provided
  if (signalingUrl) {
    // Store for WebSocket connection
    currentSession.signalingUrl = signalingUrl;
  }
  
  // Broadcast presence with user name
  if (!localPeerId) {
    localPeerId = generatePeerId();
  }
  broadcastMessage({
    op: 'presence',
    peerId: localPeerId,
    name: userName,
    color: generatePeerColor(),
    active: true,
  });
  
  return { success: true, role: currentRole };
}

/** Create a peer connection */
export function createPeerConnection(peerId: string, config?: RtcConfig): RTCPeerConnection {
  const rtcConfig = config || DEFAULT_RTC_CONFIG;
  const pc = new RTCPeerConnection({ iceServers: rtcConfig.iceServers });
  
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      // Send ICE candidate to peer via signaling
      onIceCandidate?.(peerId, event.candidate);
    }
  };
  
  pc.ondatachannel = (event) => {
    setupDataChannel(peerId, event.channel);
  };
  
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      onPeerChange?.(peerId, true);
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      onPeerChange?.(peerId, false);
      peerConnections.delete(peerId);
      dataChannels.delete(peerId);
    }
  };
  
  peerConnections.set(peerId, pc);
  return pc;
}

/** Create an offer for a peer */
export async function createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
  let pc = peerConnections.get(peerId);
  if (!pc) {
    pc = createPeerConnection(peerId);
  }
  
  // Create data channel for sync messages
  const channel = pc.createDataChannel('sync', { ordered: true });
  setupDataChannel(peerId, channel);
  
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

/** Handle an offer from a peer */
export async function handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
  let pc = peerConnections.get(peerId);
  if (!pc) {
    pc = createPeerConnection(peerId);
  }
  
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

/** Handle an answer from a peer */
export async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  const pc = peerConnections.get(peerId);
  if (pc) {
    await pc.setRemoteDescription(answer);
  }
}

/** Add an ICE candidate */
export async function addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
  const pc = peerConnections.get(peerId);
  if (pc) {
    await pc.addIceCandidate(candidate);
  }
}

/** Setup data channel handlers */
function setupDataChannel(peerId: string, channel: RTCDataChannel): void {
  channel.onopen = () => {
    dataChannels.set(peerId, channel);
    console.log(`Data channel open with ${peerId}`);
  };
  
  channel.onclose = () => {
    dataChannels.delete(peerId);
    console.log(`Data channel closed with ${peerId}`);
  };
  
  channel.onmessage = (event) => {
    try {
      const msg: SyncMessage = JSON.parse(event.data);
      onMessage?.(msg, peerId);
    } catch (e) {
      console.error('Failed to parse sync message:', e);
    }
  };
}

// ============================================================================
// Message Sending
// ============================================================================

/** Send a message to a specific peer */
export function sendToPeer(peerId: string, op: SyncOp): void {
  const channel = dataChannels.get(peerId);
  if (channel?.readyState === 'open') {
    const msg: SyncMessage = {
      seq: ++messageSeq,
      timestamp: Date.now(),
      senderId: localPeerId || '',
      op,
    };
    channel.send(JSON.stringify(msg));
  }
}

/** Broadcast a message to all connected peers */
export function broadcastMessage(op: SyncOp): void {
  const msg: SyncMessage = {
    seq: ++messageSeq,
    timestamp: Date.now(),
    senderId: localPeerId || '',
    op,
  };
  const json = JSON.stringify(msg);
  
  for (const [, channel] of dataChannels) {
    if (channel.readyState === 'open') {
      channel.send(json);
    }
  }
}

/** Send layer update */
export function sendLayerUpdate(pageIndex: number, layerId: string, updates: LayerUpdates): void {
  if (currentRole !== 'editor') return;
  broadcastMessage({ op: 'layerUpdate', pageIndex, layerId, updates });
}

/** Send cursor position */
export function sendCursorMove(pageIndex: number, x: number, y: number): void {
  broadcastMessage({ op: 'cursorMove', peerId: localPeerId || '', pageIndex, x, y });
}

/** Send selection change */
export function sendSelectionChange(layerIds: string[]): void {
  broadcastMessage({ op: 'selectionChange', peerId: localPeerId || '', layerIds });
}

// ============================================================================
// Event Handlers
// ============================================================================

let onIceCandidate: ((peerId: string, candidate: RTCIceCandidate) => void) | null = null;

/** Set message handler */
export function setOnMessage(handler: MessageCallback): void {
  onMessage = handler;
}

/** Set peer change handler */
export function setOnPeerChange(handler: PeerCallback): void {
  onPeerChange = handler;
}

/** Set ICE candidate handler */
export function setOnIceCandidate(handler: (peerId: string, candidate: RTCIceCandidate) => void): void {
  onIceCandidate = handler;
}

// ============================================================================
// Utilities
// ============================================================================

/** Get current session */
export function getCurrentSession(): SyncSession | null {
  return currentSession;
}

/** Get current role */
export function getCurrentRole(): SyncRole {
  return currentRole;
}

/** Get local peer ID */
export function getLocalPeerId(): string | null {
  return localPeerId;
}

/** Check if can edit */
export function canEdit(): boolean {
  return currentRole === 'editor';
}

/** Check if can comment */
export function canComment(): boolean {
  return currentRole === 'editor' || currentRole === 'commenter';
}

/** Get connected peer count */
export function getConnectedPeerCount(): number {
  return dataChannels.size;
}

/** Disconnect from session */
export function disconnect(): void {
  // Send leave presence
  if (localPeerId) {
    broadcastMessage({ op: 'presence', peerId: localPeerId, name: '', color: '', active: false });
  }
  
  // Close all connections
  for (const [, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();
  dataChannels.clear();
  
  currentSession = null;
  currentRole = 'viewer';
}

/** Copy link to clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
