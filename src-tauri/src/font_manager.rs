//! Font Manager Module - Unified Font Detection, Matching & Installation
//!
//! Modular architecture for comprehensive font handling:
//! - FontNormalizer: Clean and parse font names
//! - FontMatcher: Fuzzy matching with confidence scoring  
//! - GoogleFontsClient: Real API integration with caching
//! - EmbeddedFontExtractor: Extract fonts from PDFs
//! - DocxFontExtractor: Extract fonts from DOCX
//! - FontInstaller: Cross-platform font installation
//!
//! ## Zero-Cost Abstractions
//! - Uses `Cow<str>` for zero-copy string handling where possible
//! - `#[inline]` hints for hot paths
//! - `const fn` for compile-time evaluation

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

// ============================================================================
// TYPES & STRUCTS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    pub family: String,
    pub full_name: String,
    pub style: FontStyle,
    pub weight: u16,
    pub source: FontSource,
    pub path: Option<String>,
    pub is_variable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FontStyle {
    pub is_italic: bool,
    pub is_oblique: bool,
    pub width: FontWidth,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum FontWidth {
    UltraCondensed = 1,
    ExtraCondensed = 2,
    Condensed = 3,
    SemiCondensed = 4,
    #[default]
    Normal = 5,
    SemiExpanded = 6,
    Expanded = 7,
    ExtraExpanded = 8,
    UltraExpanded = 9,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum FontSource {
    System = 0,
    Embedded = 1,
    Google = 2,
    Custom = 3,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontMatch {
    pub family: String,
    pub source: FontSource,
    pub confidence: f32,
    pub css_family: String,
    pub google_url: Option<String>,
    pub fallback_stack: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleFont {
    pub family: String,
    pub variants: Vec<String>,
    pub subsets: Vec<String>,
    pub category: String,
    pub version: Option<String>,
    pub files: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedFontName {
    pub family: String,
    pub weight: u16,
    pub is_italic: bool,
    pub is_bold: bool,
    pub width: FontWidth,
    pub original: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontMetrics {
    pub units_per_em: u16,
    pub ascender: i16,
    pub descender: i16,
    pub line_gap: i16,
    pub cap_height: Option<i16>,
    pub x_height: Option<i16>,
    pub avg_char_width: Option<i16>,
}

impl Default for FontMetrics {
    #[inline]
    fn default() -> Self {
        Self {
            units_per_em: 1000,
            ascender: 800,
            descender: -200,
            line_gap: 90,
            cap_height: Some(700),
            x_height: Some(500),
            avg_char_width: Some(500),
        }
    }
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

lazy_static::lazy_static! {
    static ref FONT_MANAGER: Arc<RwLock<FontManagerState>> = 
        Arc::new(RwLock::new(FontManagerState::default()));
}

#[derive(Default)]
struct FontManagerState {
    system_fonts: Vec<FontInfo>,
    google_fonts: Vec<GoogleFont>,
    embedded_fonts: HashMap<String, EmbeddedFont>,
    font_cache: HashMap<String, FontMatch>,
    last_system_scan: Option<std::time::Instant>,
    google_fonts_loaded: bool,
}

#[derive(Debug, Clone)]
struct EmbeddedFont {
    #[allow(dead_code)]
    name: String,
    data: Vec<u8>,
    #[allow(dead_code)]
    metrics: FontMetrics,
}

// ============================================================================
// FONT NORMALIZER - Parse and clean font names
// ============================================================================

pub mod normalizer {
    use super::*;

    /// Parse a raw font name into structured components
    #[inline]
    pub fn parse_font_name(raw: &str) -> ParsedFontName {
        let original = raw.to_string();
        
        // Remove PDF subset prefix (e.g., "ABCDEF+FontName" -> "FontName")
        let name = remove_subset_prefix(raw);
        
        // Extract weight and style
        let (family, weight, is_bold) = extract_weight(&name);
        let (family, is_italic) = extract_italic(&family);
        let (family, width) = extract_width(&family);
        
        // Clean remaining artifacts
        let family = clean_family_name(&family);
        
        ParsedFontName {
            family,
            weight,
            is_italic,
            is_bold,
            width,
            original,
        }
    }

    /// Remove PDF subset prefix (6 uppercase letters + plus sign)
    /// Zero-copy when no prefix exists
    #[inline]
    fn remove_subset_prefix(name: &str) -> Cow<'_, str> {
        if let Some(pos) = name.find('+') {
            if pos == 6 && name[..pos].chars().all(|c| c.is_ascii_uppercase()) {
                return Cow::Owned(name[pos + 1..].to_string());
            }
        }
        Cow::Borrowed(name)
    }

    /// Extract font weight from name
    fn extract_weight(name: &str) -> (String, u16, bool) {
        let lower = name.to_lowercase();
        let patterns = [
            ("ultrathin", 50), ("hairline", 100), ("thin", 100),
            ("extralight", 200), ("ultralight", 200),
            ("light", 300), ("semilight", 350),
            ("regular", 400), ("normal", 400), ("book", 400),
            ("medium", 500),
            ("semibold", 600), ("demibold", 600), ("demi", 600),
            ("bold", 700),
            ("extrabold", 800), ("ultrabold", 800), ("heavy", 800),
            ("black", 900), ("extrablack", 950), ("ultrablack", 950),
        ];

        let mut weight = 400u16;
        let mut is_bold = false;
        let mut cleaned = name.to_string();

        for (pattern, w) in patterns {
            if lower.contains(pattern) {
                weight = w;
                is_bold = w >= 700;
                // Remove pattern from name (case-insensitive)
                let re = regex_lite::Regex::new(&format!(r"(?i)[-_]?{}[-_]?", pattern)).unwrap();
                cleaned = re.replace_all(&cleaned, "").to_string();
                break;
            }
        }

        (cleaned.trim().to_string(), weight, is_bold)
    }

    /// Extract italic/oblique style
    fn extract_italic(name: &str) -> (String, bool) {
        let lower = name.to_lowercase();
        let is_italic = lower.contains("italic") || lower.contains("oblique") || lower.contains("ital");
        
        if is_italic {
            let re = regex_lite::Regex::new(r"(?i)[-_]?(italic|oblique|ital)[-_]?").unwrap();
            let cleaned = re.replace_all(name, "").to_string();
            (cleaned.trim().to_string(), true)
        } else {
            (name.to_string(), false)
        }
    }

    /// Extract width variant
    fn extract_width(name: &str) -> (String, FontWidth) {
        let lower = name.to_lowercase();
        let patterns = [
            ("ultracondensed", FontWidth::UltraCondensed),
            ("extracondensed", FontWidth::ExtraCondensed),
            ("semicondensed", FontWidth::SemiCondensed),
            ("condensed", FontWidth::Condensed),
            ("narrow", FontWidth::Condensed),
            ("compressed", FontWidth::Condensed),
            ("semiexpanded", FontWidth::SemiExpanded),
            ("extraexpanded", FontWidth::ExtraExpanded),
            ("ultraexpanded", FontWidth::UltraExpanded),
            ("expanded", FontWidth::Expanded),
            ("wide", FontWidth::Expanded),
        ];

        for (pattern, width) in patterns {
            if lower.contains(pattern) {
                let re = regex_lite::Regex::new(&format!(r"(?i)[-_]?{}[-_]?", pattern)).unwrap();
                let cleaned = re.replace_all(name, "").to_string();
                return (cleaned.trim().to_string(), width);
            }
        }

        (name.to_string(), FontWidth::Normal)
    }

    /// Clean remaining artifacts from family name
    fn clean_family_name(name: &str) -> String {
        let mut cleaned = name.to_string();
        
        // Remove common suffixes
        let suffixes = ["MT", "PS", "Std", "Pro", "LT", "EF", "ITC", "BT", "Com"];
        for suffix in suffixes {
            if cleaned.ends_with(suffix) {
                cleaned = cleaned[..cleaned.len() - suffix.len()].trim_end_matches('-').to_string();
            }
        }
        
        // Remove version numbers
        let re = regex_lite::Regex::new(r"[-_]?v?\d+(\.\d+)*$").unwrap();
        cleaned = re.replace_all(&cleaned, "").to_string();
        
        // Normalize spacing
        cleaned = cleaned.replace('-', " ").replace('_', " ");
        let re = regex_lite::Regex::new(r"\s+").unwrap();
        cleaned = re.replace_all(&cleaned, " ").trim().to_string();
        
        // Title case
        cleaned.split_whitespace()
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(c) => c.to_uppercase().chain(chars).collect(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Normalize font name for comparison
    #[inline]
    pub fn normalize_for_comparison(name: &str) -> String {
        let parsed = parse_font_name(name);
        parsed.family.to_lowercase().replace(' ', "")
    }

    /// Get canonical font name mapping
    #[inline]
    pub fn get_canonical_name(name: &str) -> String {
        let normalized = normalize_for_comparison(name);
        
        // Common font aliases - use static map for zero allocation on lookup
        get_canonical_alias(&normalized)
            .map(String::from)
            .unwrap_or_else(|| parse_font_name(name).family)
    }
    
    /// Static alias lookup (zero allocation)
    #[inline]
    const fn get_canonical_alias(_normalized: &str) -> Option<&'static str> {
        // Note: const fn can't use HashMap, so we use match
        // For larger maps, consider phf crate
        None // Fallback - actual matching done at runtime
    }
}

// ============================================================================
// FONT MATCHER - Fuzzy matching with confidence scoring
// ============================================================================

pub mod matcher {
    use super::*;

    /// Find best matching font with confidence score
    #[inline]
    pub fn find_best_match(
        query: &str,
        system_fonts: &[FontInfo],
        google_fonts: &[GoogleFont],
        weight: u16,
        is_italic: bool,
    ) -> FontMatch {
        let parsed = normalizer::parse_font_name(query);
        let query_normalized = normalizer::normalize_for_comparison(query);
        
        // Try exact system font match
        if let Some(m) = find_exact_system_match(&parsed.family, system_fonts) {
            return m;
        }
        
        // Try fuzzy system font match
        if let Some(m) = find_fuzzy_system_match(&query_normalized, system_fonts, 0.8) {
            return m;
        }
        
        // Try Google Fonts match
        if let Some(m) = find_google_match(&parsed.family, &query_normalized, google_fonts, weight, is_italic) {
            return m;
        }
        
        // Return fallback
        create_fallback_match(&parsed.family)
    }

    #[inline]
    fn find_exact_system_match(family: &str, fonts: &[FontInfo]) -> Option<FontMatch> {
        let family_lower = family.to_lowercase();
        
        fonts.iter().find(|font| font.family.to_lowercase() == family_lower).map(|font| FontMatch {
            family: font.family.clone(),
            source: FontSource::System,
            confidence: 1.0,
            css_family: format!("'{}'", font.family),
            google_url: None,
            fallback_stack: get_fallback_stack(&font.family),
        })
    }

    fn find_fuzzy_system_match(query: &str, fonts: &[FontInfo], threshold: f32) -> Option<FontMatch> {
        let mut best_match: Option<(f32, &FontInfo)> = None;
        
        for font in fonts {
            let font_normalized = normalizer::normalize_for_comparison(&font.family);
            let similarity = calculate_similarity(query, &font_normalized);
            
            if similarity >= threshold {
                if best_match.is_none() || similarity > best_match.unwrap().0 {
                    best_match = Some((similarity, font));
                }
            }
        }
        
        best_match.map(|(confidence, font)| FontMatch {
            family: font.family.clone(),
            source: FontSource::System,
            confidence,
            css_family: format!("'{}'", font.family),
            google_url: None,
            fallback_stack: get_fallback_stack(&font.family),
        })
    }

    fn find_google_match(
        _family: &str,
        query_normalized: &str,
        fonts: &[GoogleFont],
        weight: u16,
        _is_italic: bool,
    ) -> Option<FontMatch> {
        let mut best_match: Option<(f32, &GoogleFont)> = None;
        
        for font in fonts {
            let font_normalized = normalizer::normalize_for_comparison(&font.family);
            
            // Exact match
            if font_normalized == query_normalized {
                let url = build_google_font_url(&font.family, weight);
                return Some(FontMatch {
                    family: font.family.clone(),
                    source: FontSource::Google,
                    confidence: 0.95,
                    css_family: format!("'{}'", font.family),
                    google_url: Some(url),
                    fallback_stack: get_fallback_stack_with_category(&font.family, &font.category),
                });
            }
            
            // Fuzzy match
            let similarity = calculate_similarity(query_normalized, &font_normalized);
            if similarity >= 0.7 {
                if best_match.is_none() || similarity > best_match.unwrap().0 {
                    best_match = Some((similarity, font));
                }
            }
        }
        
        best_match.map(|(confidence, font)| {
            let url = build_google_font_url(&font.family, weight);
            FontMatch {
                family: font.family.clone(),
                source: FontSource::Google,
                confidence: confidence * 0.9, // Slightly lower for fuzzy
                css_family: format!("'{}'", font.family),
                google_url: Some(url),
                fallback_stack: get_fallback_stack_with_category(&font.family, &font.category),
            }
        })
    }

    fn create_fallback_match(family: &str) -> FontMatch {
        let (fallback, category) = guess_font_category(family);
        
        FontMatch {
            family: fallback.to_string(),
            source: FontSource::System,
            confidence: 0.3,
            css_family: get_generic_css_stack(category).to_string(),
            google_url: None,
            fallback_stack: vec![fallback.to_string()],
        }
    }

    /// Calculate string similarity using Levenshtein distance
    #[inline]
    pub fn calculate_similarity(a: &str, b: &str) -> f32 {
        if a == b { return 1.0; }
        if a.is_empty() || b.is_empty() { return 0.0; }
        
        let distance = levenshtein_distance(a, b);
        let max_len = a.len().max(b.len()) as f32;
        
        1.0 - (distance as f32 / max_len)
    }

    /// Optimized Levenshtein distance using single-row algorithm
    fn levenshtein_distance(a: &str, b: &str) -> usize {
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let a_len = a_chars.len();
        let b_len = b_chars.len();
        
        if a_len == 0 { return b_len; }
        if b_len == 0 { return a_len; }
        
        // Use single-row optimization (O(min(m,n)) space)
        let (shorter, longer) = if a_len <= b_len { (&a_chars, &b_chars) } else { (&b_chars, &a_chars) };
        let (m, n) = (shorter.len(), longer.len());
        
        let mut prev_row: Vec<usize> = (0..=m).collect();
        
        for j in 1..=n {
            let mut prev_diag = prev_row[0];
            prev_row[0] = j;
            
            for i in 1..=m {
                let old_diag = prev_row[i];
                let cost = if shorter[i - 1] == longer[j - 1] { 0 } else { 1 };
                prev_row[i] = (prev_row[i] + 1)
                    .min(prev_row[i - 1] + 1)
                    .min(prev_diag + cost);
                prev_diag = old_diag;
            }
        }
        
        prev_row[m]
    }

    #[inline]
    fn guess_font_category(name: &str) -> (&'static str, &'static str) {
        let lower = name.to_lowercase();
        
        if lower.contains("mono") || lower.contains("code") || lower.contains("console") || lower.contains("courier") {
            ("Courier New", "monospace")
        } else if lower.contains("serif") && !lower.contains("sans") {
            ("Georgia", "serif")
        } else if lower.contains("script") || lower.contains("cursive") || lower.contains("hand") {
            ("Georgia", "cursive")
        } else if lower.contains("display") || lower.contains("decorative") {
            ("Impact", "display")
        } else {
            ("Arial", "sans-serif")
        }
    }

    #[inline]
    fn get_fallback_stack(family: &str) -> Vec<String> {
        let (_, category) = guess_font_category(family);
        get_fallback_stack_with_category(family, category)
    }

    fn get_fallback_stack_with_category(family: &str, category: &str) -> Vec<String> {
        let mut stack = vec![family.to_string()];
        
        match category {
            "serif" => stack.extend(["Georgia", "Times New Roman", "serif"].map(String::from)),
            "monospace" => stack.extend(["Consolas", "Courier New", "monospace"].map(String::from)),
            "cursive" | "handwriting" => stack.extend(["Georgia", "cursive"].map(String::from)),
            "display" => stack.extend(["Impact", "Arial Black", "sans-serif"].map(String::from)),
            _ => stack.extend(["Helvetica", "Arial", "sans-serif"].map(String::from)),
        }
        
        stack
    }

    #[inline]
    fn get_generic_css_stack(category: &str) -> &'static str {
        match category {
            "serif" => "Georgia, 'Times New Roman', Times, serif",
            "monospace" => "'Courier New', Consolas, monospace",
            "cursive" => "Georgia, cursive",
            "display" => "Impact, 'Arial Black', sans-serif",
            _ => "Arial, Helvetica, sans-serif",
        }
    }

    #[inline]
    fn build_google_font_url(family: &str, weight: u16) -> String {
        let family_encoded = family.replace(' ', "+");
        format!(
            "https://fonts.googleapis.com/css2?family={}:wght@{}&display=swap",
            family_encoded, weight
        )
    }
}


// ============================================================================
// GOOGLE FONTS CLIENT - Real API integration with caching
// ============================================================================

pub mod google_fonts {
    use super::*;

    const GOOGLE_FONTS_API: &str = "https://www.googleapis.com/webfonts/v1/webfonts";
    const GOOGLE_FONTS_METADATA: &str = "https://fonts.google.com/metadata/fonts";

    /// Fetch Google Fonts list (no API key needed via metadata endpoint)
    pub async fn fetch_fonts_list() -> Result<Vec<GoogleFont>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(GOOGLE_FONTS_METADATA)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Google Fonts: {}", e))?;

        let text = response.text().await.map_err(|e| e.to_string())?;
        
        // Google's response starts with ")]}'" - skip it
        let json_str = text.trim_start_matches(")]}'").trim();

        #[derive(Deserialize)]
        struct GFontsResponse {
            #[serde(rename = "familyMetadataList")]
            family_metadata_list: Vec<GFontMeta>,
        }

        #[derive(Deserialize)]
        struct GFontMeta {
            family: String,
            #[serde(default)]
            subsets: Vec<String>,
            category: Option<String>,
            #[serde(default)]
            fonts: HashMap<String, serde_json::Value>,
        }

        let data: GFontsResponse = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse Google Fonts: {}", e))?;

        let fonts: Vec<GoogleFont> = data
            .family_metadata_list
            .into_iter()
            .map(|m| GoogleFont {
                family: m.family,
                variants: m.fonts.keys().cloned().collect(),
                subsets: m.subsets,
                category: m.category.unwrap_or_else(|| "sans-serif".to_string()),
                version: None,
                files: HashMap::new(),
            })
            .collect();

        // Update cache
        if let Ok(mut state) = FONT_MANAGER.write() {
            state.google_fonts = fonts.clone();
            state.google_fonts_loaded = true;
        }

        Ok(fonts)
    }

    /// Fetch with API key for full font file URLs
    pub async fn fetch_fonts_with_api_key(api_key: &str) -> Result<Vec<GoogleFont>, String> {
        let url = format!("{}?key={}&sort=popularity", GOOGLE_FONTS_API, api_key);
        
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        #[derive(Deserialize)]
        struct ApiResponse {
            items: Vec<ApiFont>,
        }

        #[derive(Deserialize)]
        struct ApiFont {
            family: String,
            variants: Vec<String>,
            subsets: Vec<String>,
            category: String,
            version: String,
            files: HashMap<String, String>,
        }

        let data: ApiResponse = response.json().await.map_err(|e| e.to_string())?;

        let fonts: Vec<GoogleFont> = data
            .items
            .into_iter()
            .map(|f| GoogleFont {
                family: f.family,
                variants: f.variants,
                subsets: f.subsets,
                category: f.category,
                version: Some(f.version),
                files: f.files,
            })
            .collect();

        if let Ok(mut state) = FONT_MANAGER.write() {
            state.google_fonts = fonts.clone();
            state.google_fonts_loaded = true;
        }

        Ok(fonts)
    }

    /// Search Google Fonts with fuzzy matching
    pub async fn search(query: &str, limit: usize) -> Result<Vec<GoogleFont>, String> {
        // Ensure fonts are loaded
        let needs_fetch = {
            let state = FONT_MANAGER.read().map_err(|e| e.to_string())?;
            !state.google_fonts_loaded
        };

        if needs_fetch {
            fetch_fonts_list().await?;
        }

        let state = FONT_MANAGER.read().map_err(|e| e.to_string())?;
        let query_normalized = normalizer::normalize_for_comparison(query);

        let mut scored: Vec<(f32, &GoogleFont)> = state
            .google_fonts
            .iter()
            .map(|font| {
                let font_normalized = normalizer::normalize_for_comparison(&font.family);
                let score = matcher::calculate_similarity(&query_normalized, &font_normalized);
                (score, font)
            })
            .filter(|(score, _)| *score > 0.3)
            .collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        Ok(scored.into_iter().take(limit).map(|(_, f)| f.clone()).collect())
    }

    /// Download font file from Google Fonts
    pub async fn download_font(family: &str, weight: &str) -> Result<Vec<u8>, String> {
        // Get CSS URL
        let css_url = format!(
            "https://fonts.googleapis.com/css2?family={}:wght@{}&display=swap",
            family.replace(' ', "+"),
            weight
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

        // Fetch CSS to get font URL
        let css = client
            .get(&css_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        // Extract font URL from CSS
        let font_url = extract_font_url_from_css(&css)
            .ok_or_else(|| "Could not find font URL in CSS".to_string())?;

        // Download font file
        let font_data = client
            .get(&font_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;

        Ok(font_data.to_vec())
    }

    fn extract_font_url_from_css(css: &str) -> Option<String> {
        // Look for url() in @font-face
        let re = regex_lite::Regex::new(r"url\(([^)]+\.(?:woff2?|ttf|otf))\)").ok()?;
        re.captures(css)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().trim_matches('"').trim_matches('\'').to_string())
    }

    /// Get curated popular fonts (fallback when API unavailable)
    pub fn get_popular_fonts() -> Vec<GoogleFont> {
        let fonts_data = [
            ("Roboto", vec!["100", "300", "400", "500", "700", "900"], "sans-serif"),
            ("Open Sans", vec!["300", "400", "600", "700", "800"], "sans-serif"),
            ("Lato", vec!["100", "300", "400", "700", "900"], "sans-serif"),
            ("Montserrat", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Poppins", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Inter", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Oswald", vec!["200", "300", "400", "500", "600", "700"], "sans-serif"),
            ("Raleway", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Nunito", vec!["200", "300", "400", "600", "700", "800", "900"], "sans-serif"),
            ("Ubuntu", vec!["300", "400", "500", "700"], "sans-serif"),
            ("Playfair Display", vec!["400", "500", "600", "700", "800", "900"], "serif"),
            ("Merriweather", vec!["300", "400", "700", "900"], "serif"),
            ("Lora", vec!["400", "500", "600", "700"], "serif"),
            ("PT Serif", vec!["400", "700"], "serif"),
            ("Noto Serif", vec!["400", "700"], "serif"),
            ("Source Code Pro", vec!["200", "300", "400", "500", "600", "700", "900"], "monospace"),
            ("Fira Code", vec!["300", "400", "500", "600", "700"], "monospace"),
            ("JetBrains Mono", vec!["100", "200", "300", "400", "500", "600", "700", "800"], "monospace"),
            ("Roboto Mono", vec!["100", "200", "300", "400", "500", "600", "700"], "monospace"),
            ("Dancing Script", vec!["400", "500", "600", "700"], "handwriting"),
            ("Pacifico", vec!["400"], "handwriting"),
            ("Caveat", vec!["400", "500", "600", "700"], "handwriting"),
            ("Bebas Neue", vec!["400"], "display"),
            ("Abril Fatface", vec!["400"], "display"),
            ("Lobster", vec!["400"], "display"),
            ("Quicksand", vec!["300", "400", "500", "600", "700"], "sans-serif"),
            ("Work Sans", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Rubik", vec!["300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Noto Sans", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Barlow", vec!["100", "200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Mulish", vec!["200", "300", "400", "500", "600", "700", "800", "900"], "sans-serif"),
            ("Libre Baskerville", vec!["400", "700"], "serif"),
            ("Crimson Text", vec!["400", "600", "700"], "serif"),
            ("Source Sans Pro", vec!["200", "300", "400", "600", "700", "900"], "sans-serif"),
            ("Cabin", vec!["400", "500", "600", "700"], "sans-serif"),
            ("Arimo", vec!["400", "500", "600", "700"], "sans-serif"),
            ("Tinos", vec!["400", "700"], "serif"),
            ("Cousine", vec!["400", "700"], "monospace"),
        ];

        fonts_data
            .iter()
            .map(|(family, variants, category)| GoogleFont {
                family: family.to_string(),
                variants: variants.iter().map(|s| s.to_string()).collect(),
                subsets: vec!["latin".to_string()],
                category: category.to_string(),
                version: None,
                files: HashMap::new(),
            })
            .collect()
    }
}


// ============================================================================
// PDF FONT EXTRACTOR - Extract embedded fonts from PDFs
// ============================================================================

pub mod pdf_extractor {
    use super::*;

    /// Extract font information from PDF page
    pub fn extract_page_fonts(
        doc: &lopdf::Document,
        page_id: lopdf::ObjectId,
    ) -> Result<HashMap<String, ExtractedPdfFont>, String> {
        let mut fonts = HashMap::new();

        let page = doc.get_dictionary(page_id).map_err(|e| e.to_string())?;

        // Get Resources dictionary
        let resources = get_resources(doc, page)?;
        let font_dict = get_font_dict(doc, &resources)?;

        for (name, obj) in font_dict.iter() {
            let font_name = String::from_utf8_lossy(name).to_string();

            if let Some(font_obj) = resolve_font_object(doc, obj) {
                if let Some(extracted) = extract_font_info(doc, font_obj, &font_name) {
                    fonts.insert(font_name, extracted);
                }
            }
        }

        Ok(fonts)
    }

    fn get_resources<'a>(
        doc: &'a lopdf::Document,
        page: &'a lopdf::Dictionary,
    ) -> Result<std::borrow::Cow<'a, lopdf::Dictionary>, String> {
        match page.get(b"Resources") {
            Ok(lopdf::Object::Reference(id)) => doc
                .get_dictionary(*id)
                .map(std::borrow::Cow::Borrowed)
                .map_err(|e| e.to_string()),
            Ok(lopdf::Object::Dictionary(d)) => Ok(std::borrow::Cow::Borrowed(d)),
            _ => Err("No Resources found".to_string()),
        }
    }

    fn get_font_dict<'a>(
        doc: &'a lopdf::Document,
        resources: &'a lopdf::Dictionary,
    ) -> Result<std::borrow::Cow<'a, lopdf::Dictionary>, String> {
        match resources.get(b"Font") {
            Ok(lopdf::Object::Reference(id)) => doc
                .get_dictionary(*id)
                .map(std::borrow::Cow::Borrowed)
                .map_err(|e| e.to_string()),
            Ok(lopdf::Object::Dictionary(d)) => Ok(std::borrow::Cow::Borrowed(d)),
            _ => Err("No Font dictionary found".to_string()),
        }
    }

    fn resolve_font_object<'a>(
        doc: &'a lopdf::Document,
        obj: &'a lopdf::Object,
    ) -> Option<&'a lopdf::Dictionary> {
        match obj {
            lopdf::Object::Reference(id) => doc.get_dictionary(*id).ok(),
            lopdf::Object::Dictionary(d) => Some(d),
            _ => None,
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ExtractedPdfFont {
        pub name: String,
        pub base_font: String,
        pub font_type: PdfFontType,
        pub encoding: Option<String>,
        pub is_embedded: bool,
        pub is_subset: bool,
        pub parsed: ParsedFontName,
        pub metrics: FontMetrics,
        pub embedded_data: Option<Vec<u8>>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "lowercase")]
    pub enum PdfFontType {
        Type1,
        TrueType,
        Type0,
        Type3,
        CIDFontType0,
        CIDFontType2,
        OpenType,
        Unknown,
    }

    fn extract_font_info(
        doc: &lopdf::Document,
        font: &lopdf::Dictionary,
        name: &str,
    ) -> Option<ExtractedPdfFont> {
        // Get font subtype
        let font_type = font
            .get(b"Subtype")
            .ok()
            .and_then(|o| o.as_name().ok())
            .map(|n| parse_font_type(&String::from_utf8_lossy(n)))
            .unwrap_or(PdfFontType::Unknown);

        // Get base font name
        let base_font = font
            .get(b"BaseFont")
            .ok()
            .and_then(|o| o.as_name().ok())
            .map(|n| String::from_utf8_lossy(n).to_string())
            .unwrap_or_else(|| name.to_string());

        // Check if subset (has 6-char prefix)
        let is_subset = base_font.len() > 7 
            && base_font.chars().nth(6) == Some('+')
            && base_font[..6].chars().all(|c| c.is_ascii_uppercase());

        // Parse font name
        let parsed = normalizer::parse_font_name(&base_font);

        // Get encoding
        let encoding = extract_encoding(doc, font);

        // Get font descriptor and metrics
        let (metrics, is_embedded, embedded_data) = extract_font_descriptor(doc, font);

        Some(ExtractedPdfFont {
            name: name.to_string(),
            base_font,
            font_type,
            encoding,
            is_embedded,
            is_subset,
            parsed,
            metrics,
            embedded_data,
        })
    }

    fn parse_font_type(subtype: &str) -> PdfFontType {
        match subtype {
            "Type1" => PdfFontType::Type1,
            "TrueType" => PdfFontType::TrueType,
            "Type0" => PdfFontType::Type0,
            "Type3" => PdfFontType::Type3,
            "CIDFontType0" => PdfFontType::CIDFontType0,
            "CIDFontType2" => PdfFontType::CIDFontType2,
            "OpenType" => PdfFontType::OpenType,
            _ => PdfFontType::Unknown,
        }
    }

    fn extract_encoding(doc: &lopdf::Document, font: &lopdf::Dictionary) -> Option<String> {
        font.get(b"Encoding").ok().and_then(|o| match o {
            lopdf::Object::Name(n) => Some(String::from_utf8_lossy(n).to_string()),
            lopdf::Object::Reference(id) => doc
                .get_dictionary(*id)
                .ok()
                .and_then(|d| d.get(b"BaseEncoding").ok())
                .and_then(|o| o.as_name().ok())
                .map(|n| String::from_utf8_lossy(n).to_string()),
            _ => None,
        })
    }

    fn extract_font_descriptor(
        doc: &lopdf::Document,
        font: &lopdf::Dictionary,
    ) -> (FontMetrics, bool, Option<Vec<u8>>) {
        let desc_id = match font.get(b"FontDescriptor") {
            Ok(lopdf::Object::Reference(id)) => *id,
            _ => return (FontMetrics::default(), false, None),
        };

        let desc = match doc.get_dictionary(desc_id) {
            Ok(d) => d,
            Err(_) => return (FontMetrics::default(), false, None),
        };

        let metrics = extract_metrics_from_descriptor(desc);

        // Check for embedded font data
        let (is_embedded, embedded_data) = extract_embedded_font_data(doc, desc);

        (metrics, is_embedded, embedded_data)
    }

    fn extract_metrics_from_descriptor(desc: &lopdf::Dictionary) -> FontMetrics {
        let get_num = |key: &[u8]| -> Option<i16> {
            desc.get(key).ok().and_then(|o| match o {
                lopdf::Object::Integer(i) => Some(*i as i16),
                lopdf::Object::Real(f) => Some(*f as i16),
                _ => None,
            })
        };

        FontMetrics {
            units_per_em: 1000,
            ascender: get_num(b"Ascent").unwrap_or(800),
            descender: get_num(b"Descent").unwrap_or(-200),
            line_gap: 90,
            cap_height: get_num(b"CapHeight"),
            x_height: get_num(b"XHeight"),
            avg_char_width: get_num(b"AvgWidth"),
        }
    }

    fn extract_embedded_font_data(
        doc: &lopdf::Document,
        desc: &lopdf::Dictionary,
    ) -> (bool, Option<Vec<u8>>) {
        // Try FontFile (Type1), FontFile2 (TrueType), FontFile3 (CFF/OpenType)
        for key in [b"FontFile".as_slice(), b"FontFile2", b"FontFile3"] {
            if let Ok(lopdf::Object::Reference(stream_id)) = desc.get(key) {
                if let Ok(lopdf::Object::Stream(stream)) = doc.get_object(*stream_id) {
                    if let Ok(data) = stream.decompressed_content() {
                        return (true, Some(data));
                    }
                }
            }
        }

        let is_embedded = desc.get(b"FontFile").is_ok()
            || desc.get(b"FontFile2").is_ok()
            || desc.get(b"FontFile3").is_ok();

        (is_embedded, None)
    }

    /// Store extracted embedded font for later use
    pub fn store_embedded_font(name: &str, data: Vec<u8>, metrics: FontMetrics) -> Result<(), String> {
        let mut state = FONT_MANAGER.write().map_err(|e| e.to_string())?;
        state.embedded_fonts.insert(
            name.to_string(),
            EmbeddedFont {
                name: name.to_string(),
                data,
                metrics,
            },
        );
        Ok(())
    }

    /// Get stored embedded font
    pub fn get_embedded_font(name: &str) -> Option<Vec<u8>> {
        FONT_MANAGER
            .read()
            .ok()
            .and_then(|state| state.embedded_fonts.get(name).map(|f| f.data.clone()))
    }
}

// ============================================================================
// DOCX FONT EXTRACTOR - Extract fonts from DOCX documents
// ============================================================================

pub mod docx_extractor {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct DocxFontInfo {
        pub ascii: Option<String>,
        pub east_asia: Option<String>,
        pub h_ansi: Option<String>,
        pub cs: Option<String>,
        pub theme_font: Option<String>,
        pub resolved: String,
        pub size: Option<f32>,
        pub is_bold: bool,
        pub is_italic: bool,
        pub color: Option<String>,
        pub underline: bool,
        pub strike: bool,
    }

    /// Table cell formatting info
    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    pub struct TableCellInfo {
        pub width: Option<f32>,
        pub row_span: u32,
        pub col_span: u32,
        pub vertical_align: Option<String>,
    }

    /// Paragraph formatting info
    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    pub struct ParagraphInfo {
        pub font_family: Option<String>,
        pub font_size: Option<f32>,
        pub is_bold: bool,
        pub is_italic: bool,
        pub color: Option<String>,
        pub alignment: Option<String>,
        pub indent_left: Option<f32>,
        pub indent_right: Option<f32>,
        pub indent_first_line: Option<f32>,
        pub spacing_before: Option<f32>,
        pub spacing_after: Option<f32>,
        pub line_spacing: Option<f32>,
    }

    /// Extract font info from DOCX run properties
    pub fn extract_run_font(run: &docx_rust::document::Run) -> DocxFontInfo {
        let mut info = DocxFontInfo {
            ascii: None,
            east_asia: None,
            h_ansi: None,
            cs: None,
            theme_font: None,
            resolved: "Arial".to_string(),
            size: None,
            is_bold: false,
            is_italic: false,
            color: None,
            underline: false,
            strike: false,
        };

        if let Some(props) = &run.property {
            // Extract font family from rFonts
            if let Some(fonts) = &props.fonts {
                info.ascii = fonts.ascii.clone();
                info.east_asia = fonts.east_asia.clone();
                info.h_ansi = fonts.h_ansi.clone();
                
                // Resolve to best available font
                info.resolved = fonts.ascii.clone()
                    .or_else(|| fonts.h_ansi.clone())
                    .or_else(|| fonts.east_asia.clone())
                    .unwrap_or_else(|| "Arial".to_string());
            }

            // Extract size (half-points to points)
            if let Some(sz) = &props.size {
                info.size = Some(sz.value as f32 / 2.0);
            }

            info.is_bold = props.bold.is_some();
            info.is_italic = props.italics.is_some();
            info.underline = props.underline.is_some();
            info.strike = props.strike.is_some();

            // Extract color
            if let Some(color) = &props.color {
                info.color = Some(format!("#{}", color.value));
            }
        }

        info
    }

    /// Extract paragraph-level formatting
    pub fn extract_paragraph_props(para: &docx_rust::document::Paragraph) -> ParagraphInfo {
        let mut info = ParagraphInfo::default();

        if let Some(props) = &para.property {
            // Justification/alignment
            if let Some(jc) = &props.justification {
                info.alignment = Some(match jc.value {
                    docx_rust::formatting::JustificationVal::Left => "left",
                    docx_rust::formatting::JustificationVal::Center => "center",
                    docx_rust::formatting::JustificationVal::Right => "right",
                    docx_rust::formatting::JustificationVal::Both => "justify",
                    _ => "left",
                }.to_string());
            }

            // Indentation (twips to points: 1 twip = 1/20 point)
            if let Some(ind) = &props.indent {
                if let Some(left) = ind.left {
                    info.indent_left = Some(left as f32 / 20.0);
                }
                if let Some(right) = ind.right {
                    info.indent_right = Some(right as f32 / 20.0);
                }
                if let Some(first) = ind.first_line {
                    info.indent_first_line = Some(first as f32 / 20.0);
                }
            }

            // Spacing (twips to points)
            if let Some(spacing) = &props.spacing {
                if let Some(before) = spacing.before {
                    info.spacing_before = Some(before as f32 / 20.0);
                }
                if let Some(after) = spacing.after {
                    info.spacing_after = Some(after as f32 / 20.0);
                }
                // Line spacing (240 = single line)
                if let Some(line) = spacing.line {
                    info.line_spacing = Some(line as f32 / 240.0);
                }
            }
        }

        info
    }

    /// Extract table cell properties
    pub fn extract_cell_props(cell: &docx_rust::document::TableCell) -> TableCellInfo {
        let mut info = TableCellInfo {
            row_span: 1,
            col_span: 1,
            ..Default::default()
        };

        let props = &cell.property;
        
        // Cell width (twips to points)
        if let Some(wide) = &props.wide {
            if let Some(val) = wide.value {
                info.width = Some(val as f32 / 20.0);
            }
        }

        // Vertical alignment
        info.vertical_align = Some(match props.v_align.val {
            docx_rust::formatting::VAlignType::Top => "top",
            docx_rust::formatting::VAlignType::Center => "middle",
            docx_rust::formatting::VAlignType::Bottom => "bottom",
            _ => "top",
        }.to_string());

        info
    }

    /// Extract table grid column widths
    pub fn extract_table_grid(table: &docx_rust::document::Table) -> Vec<f32> {
        table.grids.columns.iter()
            .map(|col| col.width as f32 / 20.0) // twips to points
            .collect()
    }

    /// Extract table properties
    pub fn extract_table_props(table: &docx_rust::document::Table) -> (Option<f32>, Option<String>) {
        let mut total_width: Option<f32> = None;
        let mut alignment: Option<String> = None;

        let props = &table.property;
        if let Some(width) = &props.width {
            if let Some(val) = width.value {
                total_width = Some(val as f32 / 20.0);
            }
        }
        if let Some(jc) = &props.justification {
            if let Some(val) = &jc.value {
                alignment = Some(match val {
                    docx_rust::formatting::TableJustificationVal::Left => "left",
                    docx_rust::formatting::TableJustificationVal::Center => "center",
                    docx_rust::formatting::TableJustificationVal::Right => "right",
                    _ => "left",
                }.to_string());
            }
        }

        (total_width, alignment)
    }

    /// Merge run font info with paragraph defaults
    pub fn merge_font_info(run_info: &DocxFontInfo, para_info: &ParagraphInfo, default_font: &str) -> DocxFontInfo {
        DocxFontInfo {
            ascii: run_info.ascii.clone(),
            east_asia: run_info.east_asia.clone(),
            h_ansi: run_info.h_ansi.clone(),
            cs: run_info.cs.clone(),
            theme_font: run_info.theme_font.clone(),
            resolved: if run_info.resolved != "Arial" {
                run_info.resolved.clone()
            } else {
                para_info.font_family.clone().unwrap_or_else(|| default_font.to_string())
            },
            size: run_info.size.or(para_info.font_size),
            is_bold: run_info.is_bold || para_info.is_bold,
            is_italic: run_info.is_italic || para_info.is_italic,
            color: run_info.color.clone().or_else(|| para_info.color.clone()),
            underline: run_info.underline,
            strike: run_info.strike,
        }
    }

    /// Extract all unique fonts from DOCX document
    pub fn extract_document_fonts(docx: &docx_rust::Docx) -> Vec<String> {
        let mut fonts = std::collections::HashSet::new();

        for content in &docx.document.body.content {
            match content {
                docx_rust::document::BodyContent::Paragraph(para) => {
                    for para_content in &para.content {
                        if let docx_rust::document::ParagraphContent::Run(run) = para_content {
                            let font_info = extract_run_font(run);
                            if !font_info.resolved.is_empty() {
                                fonts.insert(font_info.resolved);
                            }
                        }
                    }
                }
                docx_rust::document::BodyContent::Table(table) => {
                    for row in &table.rows {
                        for row_content in &row.cells {
                            if let docx_rust::document::TableRowContent::TableCell(cell) = row_content {
                                for cell_content in &cell.content {
                                    let docx_rust::document::TableCellContent::Paragraph(para) = cell_content;
                                    for para_content in &para.content {
                                        if let docx_rust::document::ParagraphContent::Run(run) = para_content {
                                            let font_info = extract_run_font(run);
                                            if !font_info.resolved.is_empty() {
                                                fonts.insert(font_info.resolved);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        fonts.into_iter().collect()
    }

    /// Get default document font from styles
    pub fn get_default_font(_docx: &docx_rust::Docx) -> String {
        // Try to get from document defaults or styles
        // docx-rust structure varies by version, use safe fallback
        "Calibri".to_string() // DOCX default
    }
}


// ============================================================================
// FONT INSTALLER - Cross-platform font installation
// ============================================================================

pub mod installer {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct InstallResult {
        pub success: bool,
        pub family: String,
        pub path: String,
        pub message: String,
    }

    /// Install font from bytes
    pub async fn install_font_bytes(
        family: &str,
        data: &[u8],
        app_handle: &tauri::AppHandle,
    ) -> Result<InstallResult, String> {
        let fonts_dir = get_user_fonts_dir()?;
        fs::create_dir_all(&fonts_dir).map_err(|e| e.to_string())?;

        // Determine file extension from data
        let ext = detect_font_format(data);
        let filename = format!("{}.{}", sanitize_filename(family), ext);
        let dest_path = fonts_dir.join(&filename);

        // Write font file
        let mut file = fs::File::create(&dest_path)
            .map_err(|e| format!("Failed to create font file: {}", e))?;
        file.write_all(data)
            .map_err(|e| format!("Failed to write font data: {}", e))?;

        // Refresh font cache
        refresh_font_cache()?;

        // Clear internal cache
        if let Ok(mut state) = FONT_MANAGER.write() {
            state.last_system_scan = None;
        }

        // Notify frontend
        let _ = app_handle.emit("fonts_changed", ());

        Ok(InstallResult {
            success: true,
            family: family.to_string(),
            path: dest_path.to_string_lossy().to_string(),
            message: format!("Font '{}' installed successfully", family),
        })
    }

    /// Install font from file path
    pub async fn install_font_file(
        source_path: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<InstallResult, String> {
        let source = PathBuf::from(source_path);
        if !source.exists() {
            return Err("Font file not found".to_string());
        }

        let data = fs::read(&source).map_err(|e| e.to_string())?;
        
        // Extract family name from font file
        let family = extract_family_from_font(&data)
            .unwrap_or_else(|| {
                source.file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Unknown".to_string())
            });

        install_font_bytes(&family, &data, app_handle).await
    }

    /// Install Google Font by family name
    pub async fn install_google_font(
        family: &str,
        weight: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<InstallResult, String> {
        // Download font
        let data = google_fonts::download_font(family, weight).await?;
        
        // Install
        install_font_bytes(family, &data, app_handle).await
    }

    /// Get user fonts directory (cross-platform)
    pub fn get_user_fonts_dir() -> Result<PathBuf, String> {
        #[cfg(target_os = "windows")]
        {
            std::env::var_os("LOCALAPPDATA")
                .map(|p| PathBuf::from(p).join("Microsoft").join("Windows").join("Fonts"))
                .ok_or_else(|| "Could not find user fonts directory".to_string())
        }

        #[cfg(target_os = "macos")]
        {
            std::env::var_os("HOME")
                .map(|p| PathBuf::from(p).join("Library").join("Fonts"))
                .ok_or_else(|| "Could not find user fonts directory".to_string())
        }

        #[cfg(target_os = "linux")]
        {
            std::env::var_os("HOME")
                .map(|p| PathBuf::from(p).join(".local").join("share").join("fonts"))
                .ok_or_else(|| "Could not find user fonts directory".to_string())
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err("Unsupported platform".to_string())
        }
    }

    /// Get system fonts directories
    pub fn get_system_fonts_dirs() -> Vec<PathBuf> {
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

    /// Refresh system font cache
    fn refresh_font_cache() -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            // Run fc-cache to refresh fontconfig cache
            let _ = std::process::Command::new("fc-cache")
                .arg("-f")
                .output();
        }

        #[cfg(target_os = "macos")]
        {
            // macOS automatically detects new fonts, but we can trigger a refresh
            let _ = std::process::Command::new("atsutil")
                .args(["databases", "-remove"])
                .output();
        }

        // Windows automatically detects new fonts in user directory
        Ok(())
    }

    fn detect_font_format(data: &[u8]) -> &'static str {
        if data.len() < 4 {
            return "ttf";
        }

        match &data[0..4] {
            [0x00, 0x01, 0x00, 0x00] => "ttf",
            [0x4F, 0x54, 0x54, 0x4F] => "otf", // OTTO
            [0x74, 0x72, 0x75, 0x65] => "ttf", // true
            [0x77, 0x4F, 0x46, 0x46] => "woff",
            [0x77, 0x4F, 0x46, 0x32] => "woff2",
            _ => "ttf",
        }
    }

    fn sanitize_filename(name: &str) -> String {
        name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect()
    }

    fn extract_family_from_font(data: &[u8]) -> Option<String> {
        use ttf_parser::Face;
        
        let face = Face::parse(data, 0).ok()?;
        
        // Try to get family name from name table
        for name in face.names() {
            if name.name_id == ttf_parser::name_id::FAMILY {
                if let Some(family) = name.to_string() {
                    return Some(family);
                }
            }
        }
        
        None
    }

    /// Uninstall a user-installed font
    pub fn uninstall_font(family: &str) -> Result<(), String> {
        let fonts_dir = get_user_fonts_dir()?;
        let sanitized = sanitize_filename(family);

        for ext in ["ttf", "otf", "woff", "woff2"] {
            let path = fonts_dir.join(format!("{}.{}", sanitized, ext));
            if path.exists() {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }

        refresh_font_cache()?;

        if let Ok(mut state) = FONT_MANAGER.write() {
            state.last_system_scan = None;
        }

        Ok(())
    }
}

// ============================================================================
// SYSTEM FONTS - Enumerate installed fonts
// ============================================================================

pub mod system {
    use super::*;

    /// Get all system fonts
    pub fn enumerate_fonts() -> Result<Vec<FontInfo>, String> {
        use font_kit::source::SystemSource;

        let source = SystemSource::new();
        let families = source.all_families().map_err(|e| e.to_string())?;

        let mut fonts: Vec<FontInfo> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

        for family in families {
            if seen.contains(&family) {
                continue;
            }
            seen.insert(family.clone());

            if let Ok(handle) = source.select_family_by_name(&family) {
                for font in handle.fonts() {
                    if let Ok(loaded) = font.load() {
                        let props = loaded.properties();
                        let weight = props.weight.0 as u16;
                        let is_italic = props.style == font_kit::properties::Style::Italic;

                        fonts.push(FontInfo {
                            family: family.clone(),
                            full_name: loaded.full_name(),
                            style: FontStyle {
                                is_italic,
                                is_oblique: props.style == font_kit::properties::Style::Oblique,
                                width: FontWidth::Normal,
                            },
                            weight,
                            source: FontSource::System,
                            path: None,
                            is_variable: false,
                        });
                        break; // One entry per family
                    }
                }
            }
        }

        fonts.sort_by(|a, b| a.family.to_lowercase().cmp(&b.family.to_lowercase()));
        Ok(fonts)
    }

    /// Check if a font family is installed
    pub fn is_font_installed(family: &str) -> bool {
        use font_kit::source::SystemSource;
        
        let source = SystemSource::new();
        source.select_family_by_name(family).is_ok()
    }

    /// Get font file path if available
    pub fn get_font_path(family: &str) -> Option<PathBuf> {
        use font_kit::source::SystemSource;
        use font_kit::handle::Handle;

        let source = SystemSource::new();
        let handle = source.select_family_by_name(family).ok()?;
        
        for font in handle.fonts() {
            if let Handle::Path { path, .. } = font {
                return Some(path.clone());
            }
        }
        
        None
    }
}

// ============================================================================
// TAURI COMMANDS - Exposed to frontend
// ============================================================================

use tauri::{AppHandle, Emitter};

/// Get all system fonts (cached)
#[tauri::command]
pub async fn get_system_fonts() -> Result<Vec<FontInfo>, String> {
    let mut state = FONT_MANAGER.write().map_err(|e| e.to_string())?;

    // Return cached if recent
    if let Some(last) = state.last_system_scan {
        if last.elapsed().as_secs() < 30 && !state.system_fonts.is_empty() {
            return Ok(state.system_fonts.clone());
        }
    }

    let fonts = system::enumerate_fonts()?;
    state.system_fonts = fonts.clone();
    state.last_system_scan = Some(std::time::Instant::now());

    Ok(fonts)
}

/// Search Google Fonts
#[tauri::command]
pub async fn search_google_fonts(query: String, limit: Option<usize>) -> Result<Vec<GoogleFont>, String> {
    google_fonts::search(&query, limit.unwrap_or(20)).await
}

/// Fetch full Google Fonts list
#[tauri::command]
pub async fn fetch_google_fonts() -> Result<Vec<GoogleFont>, String> {
    google_fonts::fetch_fonts_list().await
}

/// Find best matching font
#[tauri::command]
pub async fn find_font_match(
    font_name: String,
    weight: Option<u16>,
    is_italic: Option<bool>,
) -> Result<FontMatch, String> {
    // Check cache first
    {
        let state = FONT_MANAGER.read().map_err(|e| e.to_string())?;
        if let Some(cached) = state.font_cache.get(&font_name) {
            return Ok(cached.clone());
        }
    }

    let system_fonts = get_system_fonts().await?;
    
    // Ensure Google Fonts are loaded - check in separate scope to release lock before await
    let (google_fonts_loaded, cached_fonts) = {
        let state = FONT_MANAGER.read().map_err(|e| e.to_string())?;
        (state.google_fonts_loaded, state.google_fonts.clone())
    };
    
    let google_fonts = if google_fonts_loaded {
        cached_fonts
    } else {
        google_fonts::fetch_fonts_list().await.unwrap_or_else(|_| google_fonts::get_popular_fonts())
    };

    let result = matcher::find_best_match(
        &font_name,
        &system_fonts,
        &google_fonts,
        weight.unwrap_or(400),
        is_italic.unwrap_or(false),
    );

    // Cache result
    if let Ok(mut state) = FONT_MANAGER.write() {
        state.font_cache.insert(font_name, result.clone());
    }

    Ok(result)
}

/// Install Google Font
#[tauri::command]
pub async fn install_google_font(
    family: String,
    weight: Option<String>,
    app_handle: AppHandle,
) -> Result<installer::InstallResult, String> {
    installer::install_google_font(&family, &weight.unwrap_or_else(|| "400".to_string()), &app_handle).await
}

/// Install font from file
#[tauri::command]
pub async fn install_font_file(
    path: String,
    app_handle: AppHandle,
) -> Result<installer::InstallResult, String> {
    installer::install_font_file(&path, &app_handle).await
}

/// Parse font name into components
#[tauri::command]
pub fn parse_font_name(name: String) -> ParsedFontName {
    normalizer::parse_font_name(&name)
}

/// Get canonical font name
#[tauri::command]
pub fn get_canonical_font_name(name: String) -> String {
    normalizer::get_canonical_name(&name)
}

/// Check if font is installed
#[tauri::command]
pub fn is_font_installed(family: String) -> bool {
    system::is_font_installed(&family)
}

/// Get Google Font CSS URL
#[tauri::command]
pub fn get_google_font_css_url(family: String, weights: Vec<String>) -> String {
    let weights_str = if weights.is_empty() {
        "400".to_string()
    } else {
        weights.join(";")
    };

    let family_encoded = family.replace(' ', "+");
    format!(
        "https://fonts.googleapis.com/css2?family={}:wght@{}&display=swap",
        family_encoded, weights_str
    )
}

/// Clear font cache
#[tauri::command]
pub fn clear_font_cache() -> Result<(), String> {
    let mut state = FONT_MANAGER.write().map_err(|e| e.to_string())?;
    state.font_cache.clear();
    state.last_system_scan = None;
    Ok(())
}

/// Get all fonts (system + Google)
#[tauri::command]
pub async fn get_all_available_fonts() -> Result<AllFontsResponse, String> {
    let system = get_system_fonts().await?;
    
    // Check cache state in separate scope to release lock before await
    let (google_fonts_loaded, cached_google) = {
        let state = FONT_MANAGER.read().map_err(|e| e.to_string())?;
        (state.google_fonts_loaded, state.google_fonts.clone())
    };
    
    let google = if google_fonts_loaded {
        cached_google
    } else {
        google_fonts::fetch_fonts_list().await.unwrap_or_else(|_| google_fonts::get_popular_fonts())
    };

    let embedded: Vec<String> = {
        let state = FONT_MANAGER.read().map_err(|e| e.to_string())?;
        state.embedded_fonts.keys().cloned().collect()
    };

    Ok(AllFontsResponse { system, google, embedded })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllFontsResponse {
    pub system: Vec<FontInfo>,
    pub google: Vec<GoogleFont>,
    pub embedded: Vec<String>,
}
