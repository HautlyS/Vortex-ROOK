//! Image Handler Module
//!
//! Enhanced image caching, streaming, and export via Tauri v2.
//! Includes progressive loading, thumbnail generation, and format conversion.
//! 
//! ## Memory Safety
//! - Uses `Arc<RwLock>` for concurrent read access (better than Mutex)
//! - Implements LRU eviction to prevent unbounded memory growth
//! - Proper cleanup via `Drop` trait and explicit `clear_cache()`

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::sync::{Arc, RwLock};
use tauri::ipc::Response;

/// Maximum cache size in bytes (100MB)
const MAX_CACHE_SIZE: usize = 100 * 1024 * 1024;

/// Thumbnail size for previews
const THUMBNAIL_SIZE: u32 = 256;

/// Image entry with metadata
/// Uses `Box<[u8]>` instead of `Vec<u8>` for immutable data (saves capacity overhead)
#[derive(Clone)]
struct ImageEntry {
    data: Box<[u8]>,
    width: u32,
    height: u32,
    format: ImageFormat,
    thumbnail: Option<Box<[u8]>>,
}

impl ImageEntry {
    /// Create new entry, converting Vec to Box for memory efficiency
    #[inline]
    fn new(data: Vec<u8>, width: u32, height: u32, format: ImageFormat) -> Self {
        Self {
            data: data.into_boxed_slice(),
            width,
            height,
            format,
            thumbnail: None,
        }
    }
    
    /// Get data size in bytes
    #[inline]
    fn size(&self) -> usize {
        self.data.len() + self.thumbnail.as_ref().map_or(0, |t| t.len())
    }
}

/// Supported image formats
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ImageFormat {
    Png = 0,
    Jpeg = 1,
    WebP = 2,
    Unknown = 255,
}

impl ImageFormat {
    /// Detect format from magic bytes (zero-cost, no allocation)
    #[inline]
    const fn from_bytes(data: &[u8]) -> Self {
        if data.len() < 12 {
            return Self::Unknown;
        }
        
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
            return Self::Png;
        }
        
        // JPEG: FF D8 FF
        if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
            return Self::Jpeg;
        }
        
        // WebP: RIFF....WEBP
        if data[0] == b'R' && data[1] == b'I' && data[2] == b'F' && data[3] == b'F'
            && data[8] == b'W' && data[9] == b'E' && data[10] == b'B' && data[11] == b'P' {
            return Self::WebP;
        }
        
        Self::Unknown
    }

    #[inline]
    const fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::WebP => "image/webp",
            Self::Unknown => "application/octet-stream",
        }
    }
}

/// Image handler for caching and serving images
/// Thread-safe with RwLock for concurrent read access
pub struct ImageHandler {
    cache: HashMap<String, ImageEntry>,
    total_size: usize,
    access_order: Vec<String>, // For LRU eviction
}

impl ImageHandler {
    #[inline]
    pub fn new() -> Self {
        Self {
            cache: HashMap::with_capacity(64),
            total_size: 0,
            access_order: Vec::with_capacity(64),
        }
    }

    /// Get image data as a Tauri v2 Response
    pub fn get_image_response(&mut self, image_id: &str) -> Result<Response, ImageError> {
        let data = self
            .cache
            .get(image_id)
            .ok_or_else(|| ImageError::NotFound(image_id.to_string()))?
            .data
            .to_vec();
        
        // Update access order for LRU
        self.update_access_order(image_id);
        
        Ok(Response::new(data))
    }

    /// Get thumbnail for an image
    pub fn get_thumbnail(&mut self, image_id: &str) -> Result<Vec<u8>, ImageError> {
        // First check if thumbnail exists
        if let Some(entry) = self.cache.get(image_id) {
            if let Some(ref thumb) = entry.thumbnail {
                return Ok(thumb.to_vec());
            }
        }
        
        // Generate thumbnail if not cached
        let entry = self
            .cache
            .get(image_id)
            .ok_or_else(|| ImageError::NotFound(image_id.to_string()))?;
        
        let thumbnail = generate_thumbnail(&entry.data, entry.width, entry.height)
            .ok_or(ImageError::ThumbnailFailed)?;
        
        // Store thumbnail (need to get mutable reference)
        if let Some(entry) = self.cache.get_mut(image_id) {
            let thumb_size = thumbnail.len();
            entry.thumbnail = Some(thumbnail.clone().into_boxed_slice());
            self.total_size += thumb_size;
        }
        
        Ok(thumbnail)
    }

    /// Get raw image bytes
    #[inline]
    pub fn get_image_bytes(&mut self, image_id: &str) -> Option<Vec<u8>> {
        self.update_access_order(image_id);
        self.cache.get(image_id).map(|e| e.data.to_vec())
    }

    /// Get image metadata without copying data
    #[inline]
    pub fn get_image_info(&self, image_id: &str) -> Option<(u32, u32, ImageFormat)> {
        self.cache.get(image_id).map(|e| (e.width, e.height, e.format))
    }

    /// Cache an image with metadata
    #[inline]
    pub fn cache_image(&mut self, image_id: &str, data: Vec<u8>) {
        self.cache_image_with_dimensions(image_id, data, 0, 0);
    }

    /// Cache an image with known dimensions
    pub fn cache_image_with_dimensions(
        &mut self,
        image_id: &str,
        data: Vec<u8>,
        width: u32,
        height: u32,
    ) {
        let data_size = data.len();
        let format = ImageFormat::from_bytes(&data);

        // Remove old entry if exists
        if let Some(old_entry) = self.cache.remove(image_id) {
            self.total_size = self.total_size.saturating_sub(old_entry.size());
            self.access_order.retain(|id| id != image_id);
        }

        // Evict if needed
        if self.total_size + data_size > MAX_CACHE_SIZE {
            self.evict_lru(data_size);
        }

        // Detect dimensions if not provided
        let (w, h) = if width == 0 || height == 0 {
            detect_image_dimensions(&data).unwrap_or((0, 0))
        } else {
            (width, height)
        };

        self.total_size += data_size;
        self.access_order.push(image_id.to_string());
        self.cache.insert(image_id.to_string(), ImageEntry::new(data, w, h, format));
    }

    /// Update access order for LRU
    fn update_access_order(&mut self, image_id: &str) {
        self.access_order.retain(|id| id != image_id);
        self.access_order.push(image_id.to_string());
    }

    /// Evict least recently used entries
    fn evict_lru(&mut self, needed_size: usize) {
        while self.total_size + needed_size > MAX_CACHE_SIZE && !self.access_order.is_empty() {
            let oldest = self.access_order.remove(0);
            if let Some(entry) = self.cache.remove(&oldest) {
                self.total_size = self.total_size.saturating_sub(entry.size());
            }
        }
    }

    /// Remove an image from cache
    pub fn remove_image(&mut self, image_id: &str) -> bool {
        if let Some(entry) = self.cache.remove(image_id) {
            self.total_size = self.total_size.saturating_sub(entry.size());
            self.access_order.retain(|id| id != image_id);
            true
        } else {
            false
        }
    }

    /// Check if an image is cached
    #[inline]
    pub fn has_image(&self, image_id: &str) -> bool {
        self.cache.contains_key(image_id)
    }

    /// Get the size of cached image data
    #[inline]
    pub fn get_image_size(&self, image_id: &str) -> Option<usize> {
        self.cache.get(image_id).map(|e| e.data.len())
    }

    /// Clear all cached images
    pub fn clear_cache(&mut self) {
        self.cache.clear();
        self.access_order.clear();
        self.total_size = 0;
    }

    /// Get the number of cached images
    #[inline]
    pub fn cache_count(&self) -> usize {
        self.cache.len()
    }

    /// Get total cache size in bytes
    #[inline]
    pub const fn total_cache_size(&self) -> usize {
        self.total_size
    }

    /// Get all cached image IDs
    pub fn get_cached_ids(&self) -> Vec<String> {
        self.cache.keys().cloned().collect()
    }
}

impl Default for ImageHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// Implement Drop for explicit cleanup logging (debug builds)
impl Drop for ImageHandler {
    fn drop(&mut self) {
        #[cfg(debug_assertions)]
        if !self.cache.is_empty() {
            eprintln!(
                "[ImageHandler] Dropping {} cached images ({} bytes)",
                self.cache.len(),
                self.total_size
            );
        }
        self.clear_cache();
    }
}

/// Image handling errors
#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("Image not found: {0}")]
    NotFound(String),
    #[error("Failed to stream image: {0}")]
    StreamFailed(String),
    #[error("Invalid image data")]
    InvalidData,
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Invalid data URL format")]
    InvalidDataUrl,
    #[error("Cache size exceeded")]
    CacheSizeExceeded,
    #[error("Thumbnail generation failed")]
    ThumbnailFailed,
}

/// Detect image dimensions from raw bytes
fn detect_image_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    let format = ImageFormat::from_bytes(data);
    
    match format {
        ImageFormat::Png => {
            // PNG: width at bytes 16-19, height at 20-23 (big endian)
            if data.len() >= 24 {
                let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
                let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
                return Some((width, height));
            }
        }
        ImageFormat::Jpeg => {
            // JPEG: Need to parse SOF markers
            let mut i = 2;
            while i < data.len() - 9 {
                if data[i] == 0xFF {
                    let marker = data[i + 1];
                    // SOF0, SOF1, SOF2 markers
                    if marker >= 0xC0 && marker <= 0xC2 {
                        let height = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
                        let width = u16::from_be_bytes([data[i + 7], data[i + 8]]) as u32;
                        return Some((width, height));
                    }
                    // Skip to next marker
                    if marker != 0x00 && marker != 0xFF {
                        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
                        i += 2 + len;
                        continue;
                    }
                }
                i += 1;
            }
        }
        _ => {}
    }
    
    // Fallback: try using image crate
    if let Ok(img) = image::load_from_memory(data) {
        return Some((img.width(), img.height()));
    }
    
    None
}

/// Generate thumbnail from image data
fn generate_thumbnail(data: &[u8], _width: u32, _height: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(data).ok()?;
    let thumbnail = img.thumbnail(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    
    let mut buffer = std::io::Cursor::new(Vec::new());
    thumbnail.write_to(&mut buffer, image::ImageFormat::Png).ok()?;
    
    Some(buffer.into_inner())
}

// Global image handler instance using RwLock for concurrent reads
lazy_static::lazy_static! {
    static ref IMAGE_HANDLER: Arc<RwLock<ImageHandler>> = Arc::new(RwLock::new(ImageHandler::new()));
}

/// Get image data via Tauri command
#[tauri::command]
pub fn get_image(image_id: String) -> Response {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    handler
        .get_image_response(&image_id)
        .unwrap_or_else(|_| Response::new(vec![]))
}

/// Get image thumbnail via Tauri command
#[tauri::command]
pub fn get_image_thumbnail(image_id: String) -> Response {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    match handler.get_thumbnail(&image_id) {
        Ok(data) => Response::new(data),
        Err(_) => Response::new(vec![]),
    }
}

/// Get image info via Tauri command (read-only, uses read lock)
#[tauri::command]
pub fn get_image_info(image_id: String) -> Option<(u32, u32, String)> {
    let handler = IMAGE_HANDLER.read().unwrap();
    handler.get_image_info(&image_id).map(|(w, h, f)| (w, h, f.mime_type().to_string()))
}

/// Export a layer image from data URL to file
#[tauri::command]
pub fn export_layer_image(data_url: String, output_path: String) -> Result<bool, String> {
    // Parse data URL: data:image/png;base64,<data>
    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err("Invalid data URL format".to_string());
    }

    let base64_data = parts[1];
    let image_data = BASE64
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut file =
        File::create(&output_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&image_data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(true)
}

/// Cache an image (internal use)
#[inline]
pub fn cache_image(image_id: &str, data: Vec<u8>) {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    handler.cache_image(image_id, data);
}

/// Cache an image with dimensions (internal use)
#[inline]
pub fn cache_image_with_dimensions(image_id: &str, data: Vec<u8>, width: u32, height: u32) {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    handler.cache_image_with_dimensions(image_id, data, width, height);
}

/// Get image bytes for protocol handler (internal use)
#[inline]
pub fn get_image_bytes(image_id: &str) -> Option<Vec<u8>> {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    handler.get_image_bytes(image_id)
}

/// Remove an image from cache (internal use)
#[inline]
pub fn remove_cached_image(image_id: &str) -> bool {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    handler.remove_image(image_id)
}

/// Clear all cached images (internal use)
/// Call this when closing a document to prevent memory leaks
pub fn clear_image_cache() {
    let mut handler = IMAGE_HANDLER.write().unwrap();
    handler.clear_cache();
}

/// Get cache statistics (read-only)
#[inline]
pub fn get_cache_stats() -> (usize, usize) {
    let handler = IMAGE_HANDLER.read().unwrap();
    (handler.cache_count(), handler.total_cache_size())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_handler_cache() {
        let mut handler = ImageHandler::new();
        let image_data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG magic bytes

        handler.cache_image("test-image", image_data.clone());

        assert!(handler.has_image("test-image"));
        assert_eq!(handler.get_image_size("test-image"), Some(4));
        assert_eq!(handler.cache_count(), 1);
        assert_eq!(handler.total_cache_size(), 4);
    }

    #[test]
    fn test_image_handler_remove() {
        let mut handler = ImageHandler::new();
        handler.cache_image("test-image", vec![1, 2, 3]);

        assert!(handler.remove_image("test-image"));
        assert!(!handler.has_image("test-image"));
        assert_eq!(handler.total_cache_size(), 0);
    }

    #[test]
    fn test_image_handler_clear() {
        let mut handler = ImageHandler::new();
        handler.cache_image("image-1", vec![1]);
        handler.cache_image("image-2", vec![2]);

        handler.clear_cache();

        assert_eq!(handler.cache_count(), 0);
        assert_eq!(handler.total_cache_size(), 0);
    }

    #[test]
    fn test_image_not_found() {
        let mut handler = ImageHandler::new();
        let result = handler.get_image_response("nonexistent");

        assert!(result.is_err());
        match result {
            Err(ImageError::NotFound(id)) => assert_eq!(id, "nonexistent"),
            _ => panic!("Expected NotFound error"),
        }
    }

    #[test]
    fn test_cache_update_size_tracking() {
        let mut handler = ImageHandler::new();

        // Add initial image
        handler.cache_image("test", vec![1, 2, 3, 4, 5]);
        assert_eq!(handler.total_cache_size(), 5);

        // Update with smaller image
        handler.cache_image("test", vec![1, 2]);
        assert_eq!(handler.total_cache_size(), 2);

        // Update with larger image
        handler.cache_image("test", vec![1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(handler.total_cache_size(), 8);
    }

    #[test]
    fn test_multiple_images_size_tracking() {
        let mut handler = ImageHandler::new();

        handler.cache_image("img1", vec![1, 2, 3]);
        handler.cache_image("img2", vec![4, 5, 6, 7]);
        handler.cache_image("img3", vec![8, 9]);

        assert_eq!(handler.cache_count(), 3);
        assert_eq!(handler.total_cache_size(), 9); // 3 + 4 + 2
    }
}
