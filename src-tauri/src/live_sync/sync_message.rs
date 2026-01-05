//! Sync Message Types - Data channel message formats for real-time collaboration

use serde::{Deserialize, Serialize};
use crate::models::{Bounds, LayerObject, LayerUpdates};

/// Sync operation types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum SyncOp {
    /// Full document sync (initial)
    FullSync { pages: Vec<PageSync> },
    /// Layer created
    LayerCreate { page_index: usize, layer: LayerObject },
    /// Layer updated
    LayerUpdate { page_index: usize, layer_id: String, updates: LayerUpdates },
    /// Layer deleted
    LayerDelete { page_index: usize, layer_id: String },
    /// Layer reordered
    LayerReorder { page_index: usize, layer_ids: Vec<String> },
    /// Cursor position update
    CursorMove { peer_id: String, page_index: usize, x: f32, y: f32 },
    /// Selection change
    SelectionChange { peer_id: String, layer_ids: Vec<String> },
    /// Comment added
    CommentAdd { id: String, page_index: usize, bounds: Bounds, text: String, author: String },
    /// Comment resolved
    CommentResolve { id: String },
    /// Presence update
    Presence { peer_id: String, name: String, color: String, active: bool },
    /// Ack message
    Ack { seq: u64 },
}

/// Page sync data (minimal for initial sync)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSync {
    pub page_index: usize,
    pub width: f32,
    pub height: f32,
    pub layer_count: usize,
}

/// Sync message wrapper with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMessage {
    pub seq: u64,
    pub timestamp: u64,
    pub sender_id: String,
    pub op: SyncOp,
}

/// Peer presence info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerPresence {
    pub peer_id: String,
    pub name: String,
    pub color: String,
    pub cursor_page: Option<usize>,
    pub cursor_x: Option<f32>,
    pub cursor_y: Option<f32>,
    pub selection: Vec<String>,
    pub last_seen: u64,
}

/// Create a sync message
#[tauri::command]
pub fn create_sync_message(sender_id: String, seq: u64, op: SyncOp) -> SyncMessage {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    SyncMessage {
        seq,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        sender_id,
        op,
    }
}

/// Serialize sync message for data channel
#[tauri::command]
pub fn serialize_sync_message(msg: SyncMessage) -> Result<String, String> {
    serde_json::to_string(&msg).map_err(|e| e.to_string())
}

/// Parse sync message from data channel
#[tauri::command]
pub fn parse_sync_message(json: String) -> Result<SyncMessage, String> {
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// Create layer update operation
#[tauri::command]
pub fn create_layer_update_op(page_index: usize, layer_id: String, updates: LayerUpdates) -> SyncOp {
    SyncOp::LayerUpdate { page_index, layer_id, updates }
}

/// Create cursor move operation
#[tauri::command]
pub fn create_cursor_op(peer_id: String, page_index: usize, x: f32, y: f32) -> SyncOp {
    SyncOp::CursorMove { peer_id, page_index, x, y }
}

/// Create presence operation
#[tauri::command]
pub fn create_presence_op(peer_id: String, name: String, color: String, active: bool) -> SyncOp {
    SyncOp::Presence { peer_id, name, color, active }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_message_roundtrip() {
        let msg = create_sync_message(
            "peer-123".to_string(),
            1,
            SyncOp::CursorMove {
                peer_id: "peer-123".to_string(),
                page_index: 0,
                x: 100.0,
                y: 200.0,
            },
        );
        
        let json = serialize_sync_message(msg.clone()).unwrap();
        let parsed = parse_sync_message(json).unwrap();
        
        assert_eq!(parsed.seq, 1);
        assert_eq!(parsed.sender_id, "peer-123");
    }
}
