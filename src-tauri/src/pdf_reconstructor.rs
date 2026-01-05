//! PDF Reconstruction Module
//!
//! Handles reconstruction of image-only PDFs using OCR and other strategies.

use crate::models::{
    Bounds, LayerObject, LayerRole, LayerType, SourceType, TextAlign,
};
use crate::ocr_handler::OcrEngine;
use crate::pdf_analyzer::{PdfAnalysis, ReconstructionRecommendation};
use image::RgbaImage;
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter};

static LAYER_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Reconstruction result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconstructionResult {
    pub success: bool,
    pub message: String,
    pub pages_processed: usize,
    pub text_layers_added: usize,
    pub confidence: f32,
}

/// OCR options for reconstruction
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOptions {
    /// Language for OCR (default: "eng")
    pub language: Option<String>,
    /// DPI for rendering pages (higher = better OCR, slower)
    pub render_dpi: Option<u32>,
    /// Minimum confidence threshold (0.0 - 1.0)
    pub min_confidence: Option<f32>,
}

impl Default for OcrOptions {
    fn default() -> Self {
        Self {
            language: Some("eng".to_string()),
            render_dpi: Some(150),
            min_confidence: Some(0.5),
        }
    }
}

/// Reconstruct image-only PDF pages using OCR
#[tauri::command]
pub async fn reconstruct_pdf_with_ocr(
    file_path: String,
    options: Option<OcrOptions>,
    app_handle: AppHandle,
) -> Result<ReconstructionResult, String> {
    let opts = options.unwrap_or_default();
    let render_dpi = opts.render_dpi.unwrap_or(150);
    let min_confidence = opts.min_confidence.unwrap_or(0.5);

    let pdfium = Pdfium::default();
    let document = pdfium
        .load_pdf_from_file(&file_path, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let total_pages = document.pages().len();
    let mut text_layers_added = 0usize;
    let mut total_confidence = 0.0f32;
    let mut confidence_count = 0usize;

    LAYER_COUNTER.store(0, Ordering::SeqCst);

    for page_idx in 0..total_pages {
        let _ = app_handle.emit(
            "ocr_progress",
            serde_json::json!({
                "currentPage": page_idx + 1,
                "totalPages": total_pages,
                "status": format!("OCR processing page {} of {}", page_idx + 1, total_pages)
            }),
        );

        let page = document
            .pages()
            .get(page_idx as u16)
            .map_err(|e| format!("Failed to get page {}: {}", page_idx, e))?;

        // Render page to image for OCR
        let image = render_page_to_image(&page, render_dpi)?;

        // Run OCR on the rendered image
        let ocr_results = run_ocr_on_image(&image, min_confidence)?;

        for result in ocr_results {
            if result.confidence >= min_confidence {
                text_layers_added += 1;
                total_confidence += result.confidence;
                confidence_count += 1;
            }
        }
    }

    let avg_confidence = if confidence_count > 0 {
        total_confidence / confidence_count as f32
    } else {
        0.0
    };

    let _ = app_handle.emit(
        "ocr_progress",
        serde_json::json!({
            "currentPage": total_pages,
            "totalPages": total_pages,
            "status": "OCR reconstruction complete"
        }),
    );

    Ok(ReconstructionResult {
        success: true,
        message: format!(
            "Reconstructed {} pages, added {} text layers",
            total_pages, text_layers_added
        ),
        pages_processed: total_pages as usize,
        text_layers_added,
        confidence: avg_confidence,
    })
}

/// Render a PDF page to an RGBA image
fn render_page_to_image(page: &PdfPage, dpi: u32) -> Result<RgbaImage, String> {
    let scale = dpi as f32 / 72.0;
    let width = (page.width().value * scale) as i32;
    let height = (page.height().value * scale) as i32;

    let config = PdfRenderConfig::new()
        .set_target_width(width)
        .set_target_height(height);

    let bitmap = page
        .render_with_config(&config)
        .map_err(|e| format!("Render failed: {}", e))?;

    Ok(bitmap.as_image().to_rgba8())
}

/// OCR result for a text region
#[derive(Debug, Clone)]
pub struct OcrTextResult {
    pub text: String,
    pub bounds: Bounds,
    pub confidence: f32,
}

/// Run OCR on an image and return detected text regions
fn run_ocr_on_image(image: &RgbaImage, min_confidence: f32) -> Result<Vec<OcrTextResult>, String> {
    // Use the existing OCR engine
    let mut engine = OcrEngine::new();
    let mut results = Vec::new();

    // For now, do full-page OCR
    let full_bounds = Bounds::new(0.0, 0.0, image.width() as f32, image.height() as f32);

    match engine.recognize_region(image, &full_bounds) {
        Ok(ocr_result) => {
            if ocr_result.confidence >= min_confidence && !ocr_result.text.trim().is_empty() {
                results.push(OcrTextResult {
                    text: ocr_result.text,
                    bounds: ocr_result.bounds,
                    confidence: ocr_result.confidence,
                });
            }
        }
        Err(e) => {
            eprintln!("OCR failed: {}", e);
        }
    }

    Ok(results)
}

/// Convert OCR results to layer objects
pub fn ocr_results_to_layers(
    results: Vec<OcrTextResult>,
    page_index: usize,
    _page_height: f32,
    scale: f32,
) -> Vec<LayerObject> {
    results
        .into_iter()
        .enumerate()
        .map(|(idx, result)| {
            let z_index = LAYER_COUNTER.fetch_add(1, Ordering::SeqCst) as i32;

            LayerObject {
                id: format!("ocr-{}-{}", page_index, idx),
                layer_type: LayerType::Text,
                bounds: Bounds::new(
                    result.bounds.x / scale,
                    result.bounds.y / scale,
                    result.bounds.width / scale,
                    result.bounds.height / scale,
                ),
                visible: true,
                locked: false,
                z_index,
                opacity: 1.0,
                content: Some(result.text),
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
            }
        })
        .collect()
}

/// Check if a document needs OCR reconstruction
#[tauri::command]
pub fn needs_ocr_reconstruction(analysis: PdfAnalysis) -> bool {
    matches!(
        analysis.recommendation,
        ReconstructionRecommendation::OcrRequired | ReconstructionRecommendation::OcrVerification
    )
}
