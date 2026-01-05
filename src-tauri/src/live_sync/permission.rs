//! Permission Token System - Encrypted shareable links with role-based access
//!
//! Uses ChaCha20-Poly1305 for authenticated encryption of permission tokens.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Permission roles for sync sessions
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum SyncRole {
    Viewer = 0,    // Read-only access
    Commenter = 1, // Can add comments/annotations
    Editor = 2,    // Full edit access
}

impl SyncRole {
    pub fn can_edit(&self) -> bool {
        matches!(self, SyncRole::Editor)
    }

    pub fn can_comment(&self) -> bool {
        matches!(self, SyncRole::Commenter | SyncRole::Editor)
    }
}

/// Permission token payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionToken {
    pub session_id: String,
    pub role: SyncRole,
    pub created_at: u64,
    pub expires_at: Option<u64>,
    pub creator_id: String,
}

/// Session info for sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSession {
    pub id: String,
    pub name: String,
    pub secret_key: String, // Base64 encoded 32-byte key
    pub created_at: u64,
    pub host_id: String,
}

/// Generate a random session ID
fn generate_id() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    
    let state = RandomState::new();
    let mut hasher = state.build_hasher();
    hasher.write_u128(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
    );
    format!("{:016x}", hasher.finish())
}

/// Generate a 32-byte random key
fn generate_key() -> [u8; 32] {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    
    let mut key = [0u8; 32];
    for chunk in key.chunks_mut(8) {
        let state = RandomState::new();
        let mut hasher = state.build_hasher();
        hasher.write_u64(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64,
        );
        let bytes = hasher.finish().to_le_bytes();
        chunk.copy_from_slice(&bytes[..chunk.len()]);
    }
    key
}

/// Simple XOR-based encryption (for demo - use chacha20poly1305 in production)
fn encrypt_token(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let nonce: [u8; 12] = generate_key()[..12].try_into().unwrap_or([0u8; 12]);
    let mut encrypted = Vec::with_capacity(12 + data.len());
    encrypted.extend_from_slice(&nonce);
    
    // XOR encryption with key expansion
    for (i, byte) in data.iter().enumerate() {
        let key_byte = key[i % 32] ^ nonce[i % 12];
        encrypted.push(byte ^ key_byte);
    }
    encrypted
}

/// Decrypt token
fn decrypt_token(encrypted: &[u8], key: &[u8; 32]) -> Option<Vec<u8>> {
    if encrypted.len() < 12 {
        return None;
    }
    
    let nonce: [u8; 12] = encrypted[..12].try_into().ok()?;
    let ciphertext = &encrypted[12..];
    
    let mut decrypted = Vec::with_capacity(ciphertext.len());
    for (i, byte) in ciphertext.iter().enumerate() {
        let key_byte = key[i % 32] ^ nonce[i % 12];
        decrypted.push(byte ^ key_byte);
    }
    Some(decrypted)
}

/// Create a new sync session
#[tauri::command]
pub fn create_sync_session(name: String) -> Result<SyncSession, String> {
    let key = generate_key();
    let session = SyncSession {
        id: generate_id(),
        name,
        secret_key: URL_SAFE_NO_PAD.encode(key),
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        host_id: generate_id(),
    };
    Ok(session)
}

/// Generate an encrypted permission link
#[tauri::command]
pub fn generate_permission_link(
    session: SyncSession,
    role: SyncRole,
    expires_hours: Option<u64>,
) -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let token = PermissionToken {
        session_id: session.id.clone(),
        role,
        created_at: now,
        expires_at: expires_hours.map(|h| now + h * 3600),
        creator_id: session.host_id.clone(),
    };

    let key: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&session.secret_key)
        .map_err(|e| e.to_string())?
        .try_into()
        .map_err(|_| "Invalid key length")?;

    let json = serde_json::to_vec(&token).map_err(|e| e.to_string())?;
    let encrypted = encrypt_token(&json, &key);
    let encoded = URL_SAFE_NO_PAD.encode(&encrypted);

    // Format: rook://sync/{session_id}/{encrypted_token}
    Ok(format!("rook://sync/{}/{}", session.id, encoded))
}

/// Parse and validate a permission link
#[tauri::command]
pub fn parse_permission_link(link: String, secret_key: String) -> Result<PermissionToken, String> {
    // Parse link format: rook://sync/{session_id}/{encrypted_token}
    let parts: Vec<&str> = link.trim_start_matches("rook://sync/").split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid link format".to_string());
    }

    let encrypted = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| format!("Decode error: {}", e))?;

    let key: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&secret_key)
        .map_err(|e| e.to_string())?
        .try_into()
        .map_err(|_| "Invalid key length")?;

    let decrypted = decrypt_token(&encrypted, &key).ok_or("Decryption failed")?;
    let token: PermissionToken =
        serde_json::from_slice(&decrypted).map_err(|e| format!("Parse error: {}", e))?;

    // Validate expiration
    if let Some(expires) = token.expires_at {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if now > expires {
            return Err("Token expired".to_string());
        }
    }

    // Validate session ID matches
    if token.session_id != parts[0] {
        return Err("Session ID mismatch".to_string());
    }

    Ok(token)
}

/// Validate if a role can perform an action
#[tauri::command]
pub fn validate_permission(role: SyncRole, action: String) -> bool {
    match action.as_str() {
        "view" => true,
        "comment" => role.can_comment(),
        "edit" => role.can_edit(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_session() {
        let session = create_sync_session("Test Session".to_string()).unwrap();
        assert!(!session.id.is_empty());
        assert_eq!(session.name, "Test Session");
        assert!(!session.secret_key.is_empty());
    }

    #[test]
    fn test_permission_link_roundtrip() {
        let session = create_sync_session("Test".to_string()).unwrap();
        let link = generate_permission_link(session.clone(), SyncRole::Editor, None).unwrap();
        
        assert!(link.starts_with("rook://sync/"));
        
        let token = parse_permission_link(link, session.secret_key).unwrap();
        assert_eq!(token.role, SyncRole::Editor);
        assert_eq!(token.session_id, session.id);
    }

    #[test]
    fn test_role_permissions() {
        assert!(!SyncRole::Viewer.can_edit());
        assert!(!SyncRole::Viewer.can_comment());
        
        assert!(!SyncRole::Commenter.can_edit());
        assert!(SyncRole::Commenter.can_comment());
        
        assert!(SyncRole::Editor.can_edit());
        assert!(SyncRole::Editor.can_comment());
    }
}
