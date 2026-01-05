//! Data models for the Book Creation Converter
//!
//! This module defines the core data structures used throughout the application,
//! including layers, pages, documents, and related types.
//!
//! ## Optimizations
//! - `Copy` derive where possible for stack allocation
//! - `#[repr(u8)]` for compact enum representation
//! - `Eq` derive for hash-based collections
//! - `#[inline]` hints for hot paths

use serde::{Deserialize, Serialize};

/// Layer type enumeration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum LayerType {
    Text = 0,
    Image = 1,
    Vector = 2,
    Shape = 3,
}

impl std::fmt::Display for LayerType {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LayerType::Text => write!(f, "text"),
            LayerType::Image => write!(f, "image"),
            LayerType::Vector => write!(f, "vector"),
            LayerType::Shape => write!(f, "shape"),
        }
    }
}

/// Text alignment options
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum TextAlign {
    #[default]
    Left = 0,
    Center = 1,
    Right = 2,
}

/// Shape type enumeration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum ShapeType {
    Rectangle = 0,
    Circle = 1,
    Line = 2,
    Polygon = 3,
}

/// Source type indicating how the layer was created
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum SourceType {
    Extracted = 0,
    Manual = 1,
    Imported = 2,
}

impl std::fmt::Display for SourceType {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourceType::Extracted => write!(f, "extracted"),
            SourceType::Manual => write!(f, "manual"),
            SourceType::Imported => write!(f, "imported"),
        }
    }
}

/// Layer role in the document
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum LayerRole {
    Background = 0,
    Content = 1,
    Header = 2,
    Footer = 3,
    Annotation = 4,
}

impl std::fmt::Display for LayerRole {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LayerRole::Background => write!(f, "background"),
            LayerRole::Content => write!(f, "content"),
            LayerRole::Header => write!(f, "header"),
            LayerRole::Footer => write!(f, "footer"),
            LayerRole::Annotation => write!(f, "annotation"),
        }
    }
}

/// Bounding box coordinates in PDF points (1/72 inch)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Bounds {
    #[inline]
    pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self { x, y, width, height }
    }

    /// Clamp bounds to ensure positive dimensions
    #[inline]
    pub fn clamp_positive(&self) -> Self {
        Self {
            x: self.x,
            y: self.y,
            width: if self.width < 1.0 { 1.0 } else { self.width },
            height: if self.height < 1.0 { 1.0 } else { self.height },
        }
    }
}

/// 2D Transformation matrix [a, b, c, d, e, f]
/// Represents: | a  b  0 |
///             | c  d  0 |
///             | e  f  1 |
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct TransformMatrix {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub e: f32,
    pub f: f32,
}

impl TransformMatrix {
    #[inline]
    pub const fn identity() -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 }
    }

    #[inline]
    pub const fn translate(tx: f32, ty: f32) -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: tx, f: ty }
    }

    #[inline]
    pub const fn scale(sx: f32, sy: f32) -> Self {
        Self { a: sx, b: 0.0, c: 0.0, d: sy, e: 0.0, f: 0.0 }
    }

    #[inline]
    pub const fn multiply(&self, other: &Self) -> Self {
        Self {
            a: self.a * other.a + self.b * other.c,
            b: self.a * other.b + self.b * other.d,
            c: self.c * other.a + self.d * other.c,
            d: self.c * other.b + self.d * other.d,
            e: self.e * other.a + self.f * other.c + other.e,
            f: self.e * other.b + self.f * other.d + other.f,
        }
    }

    #[inline]
    pub const fn transform_point(&self, x: f32, y: f32) -> (f32, f32) {
        (
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        )
    }

    /// Get horizontal scale factor from matrix
    /// For matrix [a b; c d], scale_x = sqrt(a² + c²)
    #[inline]
    pub fn scale_x(&self) -> f32 {
        (self.a * self.a + self.c * self.c).sqrt()
    }

    /// Get vertical scale factor from matrix
    /// For matrix [a b; c d], scale_y = sqrt(b² + d²)
    #[inline]
    pub fn scale_y(&self) -> f32 {
        (self.b * self.b + self.d * self.d).sqrt()
    }
}

impl Default for TransformMatrix {
    #[inline]
    fn default() -> Self {
        Self::identity()
    }
}

/// Path command for vector graphics
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PathCommand {
    MoveTo { x: f32, y: f32 },
    LineTo { x: f32, y: f32 },
    CurveTo { x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32 },
    ClosePath,
}

/// Fill rule for paths
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum FillRule {
    NonZero = 0,
    EvenOdd = 1,
}

/// Path data for vector layers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathData {
    pub commands: Vec<PathCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_rule: Option<FillRule>,
}

/// Image metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub color_space: String,
    pub dpi: u32,
}

/// A discrete visual element on a page
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayerObject {
    pub id: String,
    #[serde(rename = "type")]
    pub layer_type: LayerType,
    pub bounds: Bounds,
    pub visible: bool,
    pub locked: bool,
    #[serde(rename = "zIndex")]
    pub z_index: i32,
    pub opacity: f32,

    // Text-specific fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fontFamily")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fontSize")]
    pub font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fontWeight")]
    pub font_weight: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fontStyle")]
    pub font_style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "textAlign")]
    pub text_align: Option<TextAlign>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "textDecoration")]
    pub text_decoration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "textTransform")]
    pub text_transform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lineHeight")]
    pub line_height: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "letterSpacing")]
    pub letter_spacing: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<String>,

    // Image-specific fields
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "imageUrl")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "imagePath")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "imageData")]
    pub image_data: Option<ImageMetadata>,

    // Shape-specific fields
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "shapeType")]
    pub shape_type: Option<ShapeType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "strokeColor")]
    pub stroke_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "strokeWidth")]
    pub stroke_width: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fillColor")]
    pub fill_color: Option<String>,

    // Vector path data
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "pathData")]
    pub path_data: Option<PathData>,

    // Transform matrix for exact positioning
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<TransformMatrix>,

    // Metadata
    #[serde(rename = "sourceType")]
    pub source_type: SourceType,
    pub role: LayerRole,
}

/// Page metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_page_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_box: Option<[f32; 4]>,
}

/// A single page containing multiple layers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageData {
    pub page_index: usize,
    pub width: f32,
    pub height: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dpi: Option<u32>,
    pub layers: Vec<LayerObject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<PageMetadata>,
}

/// Document metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub title: String,
    pub author: String,
    pub created: String,
    pub modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

impl Default for DocumentMetadata {
    fn default() -> Self {
        let now = iso8601_now();
        Self {
            title: String::new(),
            author: String::new(),
            created: now.clone(),
            modified: now,
            description: None,
        }
    }
}

/// Generate proper ISO8601 timestamp
fn iso8601_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();

    let total_secs = duration.as_secs();

    // Calculate date components
    let days_since_epoch = total_secs / 86400;
    let time_of_day = total_secs % 86400;

    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Calculate year, month, day from days since epoch (1970-01-01)
    let (year, month, day) = days_to_ymd(days_since_epoch as i64);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

/// Convert days since Unix epoch to year, month, day
fn days_to_ymd(days: i64) -> (i32, u32, u32) {
    // Algorithm from Howard Hinnant's date algorithms
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    (year as i32, m, d)
}

/// Document data containing all pages
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentData {
    pub page_width: f32,
    pub page_height: f32,
    pub pages: Vec<PageData>,
}

/// Project settings
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_font: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_quality: Option<String>,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            default_font: Some("Arial".to_string()),
            default_font_size: Some(12.0),
            export_quality: Some("standard".to_string()),
        }
    }
}

/// Complete book project data
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookProjectData {
    pub format: String,
    pub version: String,
    pub metadata: DocumentMetadata,
    pub document: DocumentData,
    pub settings: ProjectSettings,
}

impl Default for BookProjectData {
    fn default() -> Self {
        Self {
            format: "bookproj".to_string(),
            version: "1.0.0".to_string(),
            metadata: DocumentMetadata::default(),
            document: DocumentData {
                page_width: 612.0,  // US Letter width in points
                page_height: 792.0, // US Letter height in points
                pages: Vec::new(),
            },
            settings: ProjectSettings::default(),
        }
    }
}

/// Response from document import operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<DocumentData>,
}

/// Result from export operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
}

/// Layer update request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerUpdates {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<Bounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<TextAlign>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_decoration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_transform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<LayerRole>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layer_serialization_roundtrip() {
        let layer = LayerObject {
            id: "text-0-1".to_string(),
            layer_type: LayerType::Text,
            bounds: Bounds::new(10.0, 20.0, 100.0, 50.0),
            visible: true,
            locked: false,
            z_index: 1,
            opacity: 1.0,
            content: Some("Hello World".to_string()),
            font_family: Some("Arial".to_string()),
            font_size: Some(12.0),
            font_weight: Some(400),
            font_style: None,
            color: Some("#000000".to_string()),
            text_align: Some(TextAlign::Left),
            text_decoration: None,
            text_transform: None,
            line_height: None,
            letter_spacing: None,
            background_color: None,
            image_url: None,
            image_path: None,
            image_data: None,
            shape_type: None,
            stroke_color: None,
            stroke_width: None,
            fill_color: None,
            path_data: None,
            transform: None,
            source_type: SourceType::Extracted,
            role: LayerRole::Content,
        };

        let json = serde_json::to_string(&layer).unwrap();
        let deserialized: LayerObject = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, deserialized);
    }

    #[test]
    fn test_transform_matrix_identity() {
        let m = TransformMatrix::identity();
        let (x, y) = m.transform_point(10.0, 20.0);
        assert!((x - 10.0).abs() < 0.001);
        assert!((y - 20.0).abs() < 0.001);
    }

    #[test]
    fn test_transform_matrix_translate() {
        let m = TransformMatrix::translate(5.0, 10.0);
        let (x, y) = m.transform_point(10.0, 20.0);
        assert!((x - 15.0).abs() < 0.001);
        assert!((y - 30.0).abs() < 0.001);
    }

    #[test]
    fn test_transform_matrix_scale() {
        let m = TransformMatrix::scale(2.0, 3.0);
        let (x, y) = m.transform_point(10.0, 20.0);
        assert!((x - 20.0).abs() < 0.001);
        assert!((y - 60.0).abs() < 0.001);
    }

    #[test]
    fn test_transform_matrix_multiply() {
        let t = TransformMatrix::translate(10.0, 20.0);
        let s = TransformMatrix::scale(2.0, 2.0);
        let combined = t.multiply(&s);
        let (x, y) = combined.transform_point(5.0, 5.0);
        // First translate: (5+10, 5+20) = (15, 25)
        // Then scale: (15*2, 25*2) = (30, 50)
        assert!((x - 30.0).abs() < 0.001);
        assert!((y - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_bounds_creation() {
        let bounds = Bounds::new(10.0, 20.0, 100.0, 50.0);
        assert_eq!(bounds.x, 10.0);
        assert_eq!(bounds.y, 20.0);
        assert_eq!(bounds.width, 100.0);
        assert_eq!(bounds.height, 50.0);
    }

    #[test]
    fn test_bounds_clamp_positive() {
        let bounds = Bounds::new(10.0, 20.0, -5.0, 0.0);
        let clamped = bounds.clamp_positive();
        assert_eq!(clamped.width, 1.0);
        assert_eq!(clamped.height, 1.0);
    }

    #[test]
    fn test_iso8601_now_format() {
        let timestamp = iso8601_now();
        // Should match format: YYYY-MM-DDTHH:MM:SSZ
        assert!(timestamp.len() == 20);
        assert!(timestamp.ends_with('Z'));
        assert!(timestamp.contains('T'));
        // Year should be >= 2024
        let year: i32 = timestamp[0..4].parse().unwrap();
        assert!(year >= 2024);
    }

    #[test]
    fn test_layer_type_display() {
        assert_eq!(LayerType::Text.to_string(), "text");
        assert_eq!(LayerType::Image.to_string(), "image");
        assert_eq!(LayerType::Vector.to_string(), "vector");
        assert_eq!(LayerType::Shape.to_string(), "shape");
    }

    #[test]
    fn test_source_type_display() {
        assert_eq!(SourceType::Extracted.to_string(), "extracted");
        assert_eq!(SourceType::Manual.to_string(), "manual");
        assert_eq!(SourceType::Imported.to_string(), "imported");
    }

    #[test]
    fn test_layer_role_display() {
        assert_eq!(LayerRole::Background.to_string(), "background");
        assert_eq!(LayerRole::Content.to_string(), "content");
        assert_eq!(LayerRole::Header.to_string(), "header");
        assert_eq!(LayerRole::Footer.to_string(), "footer");
        assert_eq!(LayerRole::Annotation.to_string(), "annotation");
    }
}
