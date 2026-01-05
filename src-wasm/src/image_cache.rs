//! Image Handler for WASM
//! In-memory image cache for web environment

use std::collections::HashMap;
use std::sync::Mutex;

pub struct ImageCache {
    cache: HashMap<String, Vec<u8>>,
}

impl ImageCache {
    pub fn new() -> Self {
        Self { cache: HashMap::new() }
    }

    pub fn store(&mut self, id: &str, data: Vec<u8>) {
        self.cache.insert(id.to_string(), data);
    }

    pub fn get(&self, id: &str) -> Option<&Vec<u8>> {
        self.cache.get(id)
    }

    pub fn _remove(&mut self, id: &str) -> bool {
        self.cache.remove(id).is_some()
    }

    pub fn clear(&mut self) {
        self.cache.clear();
    }
}

lazy_static::lazy_static! {
    pub static ref IMAGE_CACHE: Mutex<ImageCache> = Mutex::new(ImageCache::new());
}

pub fn cache_image(id: &str, data: Vec<u8>) {
    if let Ok(mut cache) = IMAGE_CACHE.lock() {
        cache.store(id, data);
    }
}

pub fn get_cached_image(id: &str) -> Option<Vec<u8>> {
    IMAGE_CACHE.lock().ok()?.get(id).cloned()
}

pub fn clear_cache() {
    if let Ok(mut cache) = IMAGE_CACHE.lock() {
        cache.clear();
    }
}
