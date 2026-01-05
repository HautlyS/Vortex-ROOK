//! WebRTC Signaling - Peer discovery and connection establishment
//!
//! Provides signaling for WebRTC peer connections via WebSocket.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Signaling message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SignalMessage {
    /// Join a session
    Join { session_id: String, peer_id: String },
    /// Leave a session
    Leave { session_id: String, peer_id: String },
    /// WebRTC offer
    Offer { to: String, from: String, sdp: String },
    /// WebRTC answer
    Answer { to: String, from: String, sdp: String },
    /// ICE candidate
    IceCandidate { to: String, from: String, candidate: String },
    /// Peer list update
    PeerList { peers: Vec<PeerInfo> },
    /// Error message
    Error { message: String },
}

/// Peer information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerInfo {
    pub id: String,
    pub role: String,
    pub joined_at: u64,
}

/// ICE server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IceServer {
    pub urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

/// WebRTC configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RtcConfig {
    pub ice_servers: Vec<IceServer>,
}

impl Default for RtcConfig {
    fn default() -> Self {
        Self {
            ice_servers: vec![
                IceServer {
                    urls: vec![
                        "stun:stun.l.google.com:19302".to_string(),
                        "stun:stun1.l.google.com:19302".to_string(),
                    ],
                    username: None,
                    credential: None,
                },
            ],
        }
    }
}

/// Local peer state
#[derive(Debug, Default)]
pub struct SignalingState {
    pub peer_id: Option<String>,
    pub session_id: Option<String>,
    pub connected_peers: HashMap<String, PeerInfo>,
}

lazy_static::lazy_static! {
    static ref SIGNALING_STATE: Arc<RwLock<SignalingState>> = Arc::new(RwLock::new(SignalingState::default()));
}

/// Get default RTC configuration with public STUN servers
#[tauri::command]
pub fn get_rtc_config() -> RtcConfig {
    RtcConfig::default()
}

/// Generate a unique peer ID
#[tauri::command]
pub fn generate_peer_id() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let state = RandomState::new();
    let mut hasher = state.build_hasher();
    hasher.write_u128(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
    );
    format!("peer-{:012x}", hasher.finish())
}

/// Create a join message
#[tauri::command]
pub fn create_join_message(session_id: String, peer_id: String) -> SignalMessage {
    SignalMessage::Join { session_id, peer_id }
}

/// Create an offer message
#[tauri::command]
pub fn create_offer_message(to: String, from: String, sdp: String) -> SignalMessage {
    SignalMessage::Offer { to, from, sdp }
}

/// Create an answer message
#[tauri::command]
pub fn create_answer_message(to: String, from: String, sdp: String) -> SignalMessage {
    SignalMessage::Answer { to, from, sdp }
}

/// Create an ICE candidate message
#[tauri::command]
pub fn create_ice_candidate_message(to: String, from: String, candidate: String) -> SignalMessage {
    SignalMessage::IceCandidate { to, from, candidate }
}

/// Parse a signaling message from JSON
#[tauri::command]
pub fn parse_signal_message(json: String) -> Result<SignalMessage, String> {
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// Serialize a signaling message to JSON
#[tauri::command]
pub fn serialize_signal_message(message: SignalMessage) -> Result<String, String> {
    serde_json::to_string(&message).map_err(|e| e.to_string())
}

/// Update local signaling state
#[tauri::command]
pub fn set_signaling_state(peer_id: String, session_id: String) -> Result<(), String> {
    let mut state = SIGNALING_STATE.write().map_err(|e| e.to_string())?;
    state.peer_id = Some(peer_id);
    state.session_id = Some(session_id);
    Ok(())
}

/// Get current signaling state
#[tauri::command]
pub fn get_signaling_state() -> Result<(Option<String>, Option<String>), String> {
    let state = SIGNALING_STATE.read().map_err(|e| e.to_string())?;
    Ok((state.peer_id.clone(), state.session_id.clone()))
}

/// Clear signaling state
#[tauri::command]
pub fn clear_signaling_state() -> Result<(), String> {
    let mut state = SIGNALING_STATE.write().map_err(|e| e.to_string())?;
    state.peer_id = None;
    state.session_id = None;
    state.connected_peers.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rtc_config_default() {
        let config = RtcConfig::default();
        assert!(!config.ice_servers.is_empty());
        assert!(config.ice_servers[0].urls[0].contains("stun"));
    }

    #[test]
    fn test_signal_message_serialization() {
        let msg = SignalMessage::Join {
            session_id: "test-session".to_string(),
            peer_id: "peer-123".to_string(),
        };
        
        let json = serialize_signal_message(msg.clone()).unwrap();
        let parsed = parse_signal_message(json).unwrap();
        
        match parsed {
            SignalMessage::Join { session_id, peer_id } => {
                assert_eq!(session_id, "test-session");
                assert_eq!(peer_id, "peer-123");
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_peer_id_generation() {
        let id1 = generate_peer_id();
        let id2 = generate_peer_id();
        assert!(id1.starts_with("peer-"));
        assert_ne!(id1, id2);
    }
}
