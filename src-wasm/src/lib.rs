//! WASM Entry Point
//! Exposes Rust functions to JavaScript via wasm-bindgen

mod docx_parser;
mod export;
mod image_cache;
mod models;

use models::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Parse DOCX file from bytes
#[wasm_bindgen]
pub fn parse_docx(data: &[u8]) -> Result<JsValue, JsValue> {
    let result = docx_parser::parse_docx(data);
    match result {
        Ok(doc) => {
            let response = DocumentResponse {
                success: true,
                message: "Document parsed successfully".to_string(),
                data: Some(doc),
            };
            serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Err(e) => {
            let response = DocumentResponse {
                success: false,
                message: e,
                data: None,
            };
            serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&e.to_string()))
        }
    }
}

/// Process PDF page data from pdf.js (receives extracted text/images)
#[wasm_bindgen]
pub fn process_pdf_page(page_data: JsValue) -> Result<JsValue, JsValue> {
    let page: PageData = serde_wasm_bindgen::from_value(page_data)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&page).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Create document from pdf.js extracted pages
#[wasm_bindgen]
pub fn create_document_from_pages(pages_js: JsValue, width: f32, height: f32) -> Result<JsValue, JsValue> {
    let pages: Vec<PageData> = serde_wasm_bindgen::from_value(pages_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    let doc = DocumentData {
        page_width: width,
        page_height: height,
        pages,
    };
    
    let response = DocumentResponse {
        success: true,
        message: "Document created".to_string(),
        data: Some(doc),
    };
    
    serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Export document to BookProject format
#[wasm_bindgen]
pub fn export_bookproj(pages_js: JsValue, metadata_js: JsValue) -> Result<Vec<u8>, JsValue> {
    let pages: Vec<PageData> = serde_wasm_bindgen::from_value(pages_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let metadata: DocumentMetadata = serde_wasm_bindgen::from_value(metadata_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    export::export_bookproj(&pages, &metadata).map_err(|e| JsValue::from_str(&e))
}

/// Export document to DOCX format
#[wasm_bindgen]
pub fn export_docx(pages_js: JsValue, metadata_js: JsValue) -> Result<Vec<u8>, JsValue> {
    let pages: Vec<PageData> = serde_wasm_bindgen::from_value(pages_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let metadata: DocumentMetadata = serde_wasm_bindgen::from_value(metadata_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    export::export_docx(&pages, &metadata).map_err(|e| JsValue::from_str(&e))
}

/// Load project from bytes
#[wasm_bindgen]
pub fn load_project(data: &[u8]) -> Result<JsValue, JsValue> {
    let project: BookProjectData = serde_json::from_slice(data)
        .map_err(|e| JsValue::from_str(&format!("Invalid project file: {}", e)))?;
    serde_wasm_bindgen::to_value(&project).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Save project to bytes
#[wasm_bindgen]
pub fn save_project(project_js: JsValue) -> Result<Vec<u8>, JsValue> {
    let project: BookProjectData = serde_wasm_bindgen::from_value(project_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_vec_pretty(&project).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Cache image data
#[wasm_bindgen]
pub fn cache_image(id: &str, data: &[u8]) {
    image_cache::cache_image(id, data.to_vec());
}

/// Get cached image
#[wasm_bindgen]
pub fn get_image(id: &str) -> Option<Vec<u8>> {
    image_cache::get_cached_image(id)
}

/// Clear image cache
#[wasm_bindgen]
pub fn clear_image_cache() {
    image_cache::clear_cache();
}

/// Update layer (returns updated layer)
#[wasm_bindgen]
pub fn update_layer(layer_js: JsValue, updates_js: JsValue) -> Result<JsValue, JsValue> {
    let mut layer: LayerObject = serde_wasm_bindgen::from_value(layer_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let updates: LayerUpdates = serde_wasm_bindgen::from_value(updates_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    if let Some(bounds) = updates.bounds { layer.bounds = bounds; }
    if let Some(visible) = updates.visible { layer.visible = visible; }
    if let Some(locked) = updates.locked { layer.locked = locked; }
    if let Some(z_index) = updates.z_index { layer.z_index = z_index; }
    if let Some(opacity) = updates.opacity { layer.opacity = opacity; }
    if let Some(content) = updates.content { layer.content = Some(content); }
    
    serde_wasm_bindgen::to_value(&layer).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Export with result status (wraps export functions)
#[wasm_bindgen]
pub fn export_with_result(pages_js: JsValue, metadata_js: JsValue, format: &str) -> Result<JsValue, JsValue> {
    let pages: Vec<PageData> = serde_wasm_bindgen::from_value(pages_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let metadata: DocumentMetadata = serde_wasm_bindgen::from_value(metadata_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    let result = match format {
        "bookproj" => export::export_bookproj(&pages, &metadata),
        "docx" => export::export_docx(&pages, &metadata),
        _ => Err(format!("Unsupported format: {}", format)),
    };
    
    let response = match result {
        Ok(data) => ExportResult {
            success: true,
            message: format!("Exported to {} successfully", format),
            data: Some(data),
        },
        Err(e) => ExportResult {
            success: false,
            message: e,
            data: None,
        },
    };
    
    serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&e.to_string()))
}
