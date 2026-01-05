//! Font Service Module
//! 
//! Thin wrapper around font_manager for backward compatibility.
//! System font enumeration, Google Fonts integration, and embedded font extraction.
//! 
//! NOTE: Most functionality has been consolidated into font_manager.rs
//! This module provides Tauri command wrappers and legacy API compatibility.

use crate::font_manager::{self, FontInfo as FMFontInfo, FontSource as FMFontSource, GoogleFont as FMGoogleFont};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter};

lazy_static::lazy_static! {
    static ref EMBEDDED_FONTS: Arc<RwLock<HashMap<String, Vec<u8>>>> = Arc::new(RwLock::new(HashMap::new()));
}

// Re-export types with local names for backward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    pub name: String,
    pub family: String,
    pub style: String,
    pub weight: u16,
    pub path: Option<String>,
    pub source: FontSource,
    pub is_variable: bool,
}

impl From<FMFontInfo> for FontInfo {
    #[inline]
    fn from(fm: FMFontInfo) -> Self {
        Self {
            name: fm.full_name,
            family: fm.family,
            style: if fm.style.is_italic { "italic" } else { "normal" }.to_string(),
            weight: fm.weight,
            path: fm.path,
            source: fm.source.into(),
            is_variable: fm.is_variable,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FontSource {
    System,
    Embedded,
    Google,
    Custom,
}

impl From<FMFontSource> for FontSource {
    #[inline]
    fn from(fs: FMFontSource) -> Self {
        match fs {
            FMFontSource::System => Self::System,
            FMFontSource::Embedded => Self::Embedded,
            FMFontSource::Google => Self::Google,
            FMFontSource::Custom => Self::Custom,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleFont {
    pub family: String,
    pub variants: Vec<String>,
    pub subsets: Vec<String>,
    pub category: String,
}

impl From<FMGoogleFont> for GoogleFont {
    #[inline]
    fn from(gf: FMGoogleFont) -> Self {
        Self {
            family: gf.family,
            variants: gf.variants,
            subsets: gf.subsets,
            category: gf.category,
        }
    }
}

/// Get all system fonts (delegates to font_manager)
pub async fn get_system_fonts_legacy() -> Result<Vec<FontInfo>, String> {
    let fm_fonts = font_manager::get_system_fonts().await?;
    Ok(fm_fonts.into_iter().map(FontInfo::from).collect())
}

/// Search Google Fonts (delegates to font_manager)
pub async fn search_google_fonts_legacy(query: String) -> Result<Vec<GoogleFont>, String> {
    let fm_fonts = font_manager::search_google_fonts(query, Some(50)).await?;
    Ok(fm_fonts.into_iter().map(GoogleFont::from).collect())
}

#[inline]
#[allow(dead_code)]
fn style_name(weight: u16, style: &str) -> String {
    let weight_name = match weight {
        100..=199 => "Thin",
        200..=299 => "ExtraLight",
        300..=399 => "Light",
        400..=499 => "Regular",
        500..=599 => "Medium",
        600..=699 => "SemiBold",
        700..=799 => "Bold",
        800..=899 => "ExtraBold",
        _ => "Black",
    };
    
    if style == "italic" {
        format!("{} Italic", weight_name)
    } else if weight_name == "Regular" {
        String::new()
    } else {
        weight_name.to_string()
    }
}

/// Get Google Fonts CSS URL for a font family
#[tauri::command]
#[inline]
pub fn get_google_font_url(family: String, weights: Vec<String>) -> String {
    font_manager::get_google_font_css_url(family, weights)
}

/// Store embedded font data from PDF
#[tauri::command]
pub fn store_embedded_font(font_name: String, font_data: Vec<u8>) -> Result<(), String> {
    let mut fonts = EMBEDDED_FONTS.write().map_err(|e| e.to_string())?;
    fonts.insert(font_name, font_data);
    Ok(())
}

/// Get embedded font data
#[tauri::command]
pub fn get_embedded_font(font_name: String) -> Result<Option<Vec<u8>>, String> {
    let fonts = EMBEDDED_FONTS.read().map_err(|e| e.to_string())?;
    Ok(fonts.get(&font_name).cloned())
}

/// List all embedded fonts
#[tauri::command]
pub fn list_embedded_fonts() -> Result<Vec<String>, String> {
    let fonts = EMBEDDED_FONTS.read().map_err(|e| e.to_string())?;
    Ok(fonts.keys().cloned().collect())
}

/// Extract embedded font from PDF
pub fn extract_embedded_font(
    doc: &lopdf::Document,
    font_dict: &lopdf::Dictionary,
) -> Option<(String, Vec<u8>)> {
    // Get font name
    let font_name = font_dict
        .get(b"BaseFont")
        .ok()
        .and_then(|o| o.as_name().ok())
        .map(|n| String::from_utf8_lossy(n).to_string())?;
    
    // Get font descriptor
    let desc_id = font_dict.get(b"FontDescriptor").ok()?.as_reference().ok()?;
    let desc = doc.get_dictionary(desc_id).ok()?;
    
    // Try to get embedded font data
    let font_data = extract_font_stream(doc, desc, b"FontFile")
        .or_else(|| extract_font_stream(doc, desc, b"FontFile2"))
        .or_else(|| extract_font_stream(doc, desc, b"FontFile3"))?;
    
    Some((font_name, font_data))
}

fn extract_font_stream(
    doc: &lopdf::Document,
    desc: &lopdf::Dictionary,
    key: &[u8],
) -> Option<Vec<u8>> {
    use lopdf::Object;
    
    let stream_id = desc.get(key).ok()?.as_reference().ok()?;
    let stream = doc.get_object(stream_id).ok()?;
    
    if let Object::Stream(s) = stream {
        s.decompressed_content().ok()
    } else {
        None
    }
}

/// Find best matching font for reconstruction (delegates to font_manager)
#[tauri::command]
pub async fn find_matching_font(
    font_name: String,
    is_bold: bool,
    is_italic: bool,
) -> Result<FontMatch, String> {
    // Check embedded fonts first (in a separate scope to release lock before await)
    let is_embedded = {
        let embedded = EMBEDDED_FONTS.read().map_err(|e| e.to_string())?;
        embedded.contains_key(&font_name)
    };
    
    if is_embedded {
        return Ok(FontMatch {
            matched_font: font_name.clone(),
            source: FontSource::Embedded,
            confidence: 1.0,
            css_family: format!("'{}'", font_name),
            google_url: None,
        });
    }
    
    // Delegate to font_manager
    let weight = if is_bold { 700u16 } else { 400u16 };
    let fm_match = font_manager::find_font_match(font_name, Some(weight), Some(is_italic)).await?;
    
    Ok(FontMatch {
        matched_font: fm_match.family,
        source: fm_match.source.into(),
        confidence: fm_match.confidence,
        css_family: fm_match.css_family,
        google_url: fm_match.google_url,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontMatch {
    pub matched_font: String,
    pub source: FontSource,
    pub confidence: f32,
    pub css_family: String,
    pub google_url: Option<String>,
}

/// Watch font directory for changes (async updates)
pub async fn start_font_watcher(app_handle: AppHandle) -> Result<(), String> {
    use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event};
    use std::sync::mpsc::channel;
    use std::time::Duration;
    
    let (tx, rx) = channel();
    
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if res.is_ok() {
                let _ = tx.send(());
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(5)),
    ).map_err(|e| e.to_string())?;
    
    // Watch system font directories
    for dir in get_font_directories() {
        if dir.exists() {
            let _ = watcher.watch(&dir, RecursiveMode::Recursive);
        }
    }
    
    // Spawn background task
    std::thread::spawn(move || {
        let _watcher = watcher; // Keep watcher alive
        while rx.recv().is_ok() {
            // Clear font_manager cache
            let _ = font_manager::clear_font_cache();
            // Emit event to frontend
            let _ = app_handle.emit("fonts_changed", ());
        }
    });
    
    Ok(())
}

fn get_font_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    
    #[cfg(target_os = "windows")]
    {
        if let Some(windir) = std::env::var_os("WINDIR") {
            dirs.push(PathBuf::from(windir).join("Fonts"));
        }
        if let Some(localappdata) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(localappdata).join("Microsoft").join("Windows").join("Fonts"));
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/System/Library/Fonts"));
        dirs.push(PathBuf::from("/Library/Fonts"));
        if let Some(home) = std::env::var_os("HOME") {
            dirs.push(PathBuf::from(home).join("Library/Fonts"));
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        dirs.push(PathBuf::from("/usr/share/fonts"));
        dirs.push(PathBuf::from("/usr/local/share/fonts"));
        if let Some(home) = std::env::var_os("HOME") {
            let home_path = PathBuf::from(&home);
            dirs.push(home_path.join(".fonts"));
            dirs.push(home_path.join(".local/share/fonts"));
        }
    }
    
    dirs
}

/// Get all available fonts (system + embedded + popular Google)
#[tauri::command]
pub async fn get_all_fonts() -> Result<AllFonts, String> {
    let fm_fonts = font_manager::get_system_fonts().await?;
    let system: Vec<FontInfo> = fm_fonts.into_iter().map(FontInfo::from).collect();
    let embedded = list_embedded_fonts()?;
    let fm_response = font_manager::get_all_available_fonts().await?;
    let google: Vec<GoogleFont> = fm_response.google.into_iter().map(GoogleFont::from).collect();
    
    Ok(AllFonts {
        system,
        embedded,
        google,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllFonts {
    pub system: Vec<FontInfo>,
    pub embedded: Vec<String>,
    pub google: Vec<GoogleFont>,
}

/// Fetch full Google Fonts list from public API (delegates to font_manager)
#[tauri::command]
pub async fn fetch_google_fonts_api() -> Result<Vec<GoogleFont>, String> {
    let fm_fonts = font_manager::fetch_google_fonts().await?;
    Ok(fm_fonts.into_iter().map(GoogleFont::from).collect())
}

/// Install a custom font file to user's font directory (delegates to font_manager)
#[tauri::command]
pub async fn install_custom_font(font_path: String, app_handle: AppHandle) -> Result<String, String> {
    let result = font_manager::install_font_file(font_path, app_handle).await?;
    Ok(result.family)
}
