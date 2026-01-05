//! WASM-compatible models (mirrors src-tauri/src/models.rs)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub color_space: String,
    pub dpi: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerObject {
    pub id: String,
    #[serde(rename = "type")]
    pub layer_type: String,
    pub bounds: Bounds,
    pub visible: bool,
    pub locked: bool,
    #[serde(rename = "zIndex")]
    pub z_index: i32,
    pub opacity: f32,
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
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "textAlign")]
    pub text_align: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "imageUrl")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "imagePath")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "imageData")]
    pub image_data: Option<ImageMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "shapeType")]
    pub shape_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "strokeColor")]
    pub stroke_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "strokeWidth")]
    pub stroke_width: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fillColor")]
    pub fill_color: Option<String>,
    #[serde(rename = "sourceType")]
    pub source_type: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_page_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
        Self {
            title: String::new(),
            author: String::new(),
            created: String::new(),
            modified: String::new(),
            description: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentData {
    pub page_width: f32,
    pub page_height: f32,
    pub pages: Vec<PageData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookProjectData {
    pub format: String,
    pub version: String,
    pub metadata: DocumentMetadata,
    pub document: DocumentData,
    pub settings: ProjectSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<DocumentData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Vec<u8>>,
}

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
}
