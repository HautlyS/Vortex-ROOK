//! PDF Content Analyzer Module
//!
//! Detects PDF content type (image-only, text-based, mixed, vector-heavy)
//! and provides reconstruction strategies.

use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};

/// PDF content type classification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum PdfContentType {
    /// Scanned document - only images, no extractable text
    ImageOnly,
    /// Native text PDF - primarily text with optional images
    TextBased,
    /// Mixed content - significant text and images
    Mixed,
    /// Vector graphics heavy - diagrams, charts, illustrations
    VectorHeavy,
    /// Empty or unreadable
    Empty,
}

/// Content statistics for a single page
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageContentStats {
    pub page_index: usize,
    pub text_objects: usize,
    pub image_objects: usize,
    pub path_objects: usize,
    pub text_char_count: usize,
    /// Ratio of image area to page area (0.0 - 1.0)
    pub image_coverage: f32,
    /// Ratio of text area to page area (0.0 - 1.0)  
    pub text_coverage: f32,
}

/// Complete PDF analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnalysis {
    pub content_type: PdfContentType,
    pub total_pages: usize,
    pub total_text_objects: usize,
    pub total_image_objects: usize,
    pub total_path_objects: usize,
    pub total_char_count: usize,
    pub avg_image_coverage: f32,
    pub avg_text_coverage: f32,
    pub page_stats: Vec<PageContentStats>,
    /// Confidence score for the classification (0.0 - 1.0)
    pub confidence: f32,
    /// Recommended action based on analysis
    pub recommendation: ReconstructionRecommendation,
}

/// Reconstruction recommendation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ReconstructionRecommendation {
    /// No reconstruction needed - text is extractable
    None,
    /// Run OCR on image-only pages
    OcrRequired,
    /// Enhance text extraction with OCR verification
    OcrVerification,
    /// Vector to editable conversion available
    VectorConversion,
}

/// Analyze a PDF file and return content classification
pub fn analyze_pdf(file_path: &str) -> Result<PdfAnalysis, String> {
    let pdfium = Pdfium::default();
    let document = pdfium
        .load_pdf_from_file(file_path, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let total_pages = document.pages().len() as usize;
    if total_pages == 0 {
        return Ok(PdfAnalysis {
            content_type: PdfContentType::Empty,
            total_pages: 0,
            total_text_objects: 0,
            total_image_objects: 0,
            total_path_objects: 0,
            total_char_count: 0,
            avg_image_coverage: 0.0,
            avg_text_coverage: 0.0,
            page_stats: vec![],
            confidence: 1.0,
            recommendation: ReconstructionRecommendation::None,
        });
    }

    let mut page_stats = Vec::with_capacity(total_pages);
    let mut total_text = 0usize;
    let mut total_images = 0usize;
    let mut total_paths = 0usize;
    let mut total_chars = 0usize;
    let mut total_image_coverage = 0.0f32;
    let mut total_text_coverage = 0.0f32;

    for page_idx in 0..total_pages {
        let page = document
            .pages()
            .get(page_idx as u16)
            .map_err(|e| format!("Failed to get page {}: {}", page_idx, e))?;

        let stats = analyze_page(&page, page_idx);
        
        total_text += stats.text_objects;
        total_images += stats.image_objects;
        total_paths += stats.path_objects;
        total_chars += stats.text_char_count;
        total_image_coverage += stats.image_coverage;
        total_text_coverage += stats.text_coverage;
        
        page_stats.push(stats);
    }

    let avg_image_coverage = total_image_coverage / total_pages as f32;
    let avg_text_coverage = total_text_coverage / total_pages as f32;

    // Classify content type
    let (content_type, confidence) = classify_content(
        total_text,
        total_images,
        total_paths,
        total_chars,
        avg_image_coverage,
        avg_text_coverage,
    );

    let recommendation = determine_recommendation(&content_type, avg_image_coverage);

    Ok(PdfAnalysis {
        content_type,
        total_pages,
        total_text_objects: total_text,
        total_image_objects: total_images,
        total_path_objects: total_paths,
        total_char_count: total_chars,
        avg_image_coverage,
        avg_text_coverage,
        page_stats,
        confidence,
        recommendation,
    })
}

/// Analyze a single page
fn analyze_page(page: &PdfPage, page_index: usize) -> PageContentStats {
    let page_width = page.width().value as f32;
    let page_height = page.height().value as f32;
    let page_area = page_width * page_height;

    let mut text_objects = 0usize;
    let mut image_objects = 0usize;
    let mut path_objects = 0usize;
    let mut text_char_count = 0usize;
    let mut image_area = 0.0f32;
    let mut text_area = 0.0f32;

    for object in page.objects().iter() {
        match object.object_type() {
            PdfPageObjectType::Text => {
                text_objects += 1;
                if let Some(text_obj) = object.as_text_object() {
                    text_char_count += text_obj.text().chars().count();
                    if let Ok(bounds) = text_obj.bounds() {
                        let w = (bounds.right().value - bounds.left().value) as f32;
                        let h = (bounds.top().value - bounds.bottom().value) as f32;
                        text_area += w * h;
                    }
                }
            }
            PdfPageObjectType::Image => {
                image_objects += 1;
                if let Some(image_obj) = object.as_image_object() {
                    if let Ok(bounds) = image_obj.bounds() {
                        let w = (bounds.right().value - bounds.left().value) as f32;
                        let h = (bounds.top().value - bounds.bottom().value) as f32;
                        image_area += w * h;
                    }
                }
            }
            PdfPageObjectType::Path => {
                path_objects += 1;
            }
            _ => {}
        }
    }

    PageContentStats {
        page_index,
        text_objects,
        image_objects,
        path_objects,
        text_char_count,
        image_coverage: (image_area / page_area).min(1.0),
        text_coverage: (text_area / page_area).min(1.0),
    }
}

/// Classify PDF content type based on statistics
fn classify_content(
    text_objects: usize,
    image_objects: usize,
    path_objects: usize,
    char_count: usize,
    avg_image_coverage: f32,
    _avg_text_coverage: f32,
) -> (PdfContentType, f32) {
    // Image-only: high image coverage, minimal text
    if avg_image_coverage > 0.7 && char_count < 50 && text_objects < 5 {
        return (PdfContentType::ImageOnly, 0.95);
    }

    // Text-based: significant text, low image coverage
    if char_count > 100 && avg_image_coverage < 0.2 && text_objects > image_objects * 2 {
        return (PdfContentType::TextBased, 0.9);
    }

    // Vector-heavy: many path objects, low text/image
    if path_objects > (text_objects + image_objects) * 2 && path_objects > 50 {
        return (PdfContentType::VectorHeavy, 0.85);
    }

    // Mixed: significant both text and images
    if char_count > 50 && image_objects > 0 && avg_image_coverage > 0.1 {
        return (PdfContentType::Mixed, 0.8);
    }

    // Default to text-based if there's any text
    if char_count > 0 || text_objects > 0 {
        return (PdfContentType::TextBased, 0.7);
    }

    // Empty or unclassifiable
    (PdfContentType::Empty, 0.5)
}

/// Determine reconstruction recommendation
fn determine_recommendation(
    content_type: &PdfContentType,
    avg_image_coverage: f32,
) -> ReconstructionRecommendation {
    match content_type {
        PdfContentType::ImageOnly => ReconstructionRecommendation::OcrRequired,
        PdfContentType::Mixed if avg_image_coverage > 0.5 => {
            ReconstructionRecommendation::OcrVerification
        }
        PdfContentType::VectorHeavy => ReconstructionRecommendation::VectorConversion,
        _ => ReconstructionRecommendation::None,
    }
}

/// Tauri command to analyze PDF
#[tauri::command]
pub async fn analyze_pdf_content(file_path: String) -> Result<PdfAnalysis, String> {
    analyze_pdf(&file_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_image_only() {
        let (content_type, _) = classify_content(2, 5, 0, 10, 0.85, 0.01);
        assert_eq!(content_type, PdfContentType::ImageOnly);
    }

    #[test]
    fn test_classify_text_based() {
        let (content_type, _) = classify_content(100, 2, 10, 5000, 0.05, 0.6);
        assert_eq!(content_type, PdfContentType::TextBased);
    }

    #[test]
    fn test_classify_mixed() {
        let (content_type, _) = classify_content(50, 10, 20, 500, 0.3, 0.4);
        assert_eq!(content_type, PdfContentType::Mixed);
    }

    #[test]
    fn test_recommendation_ocr() {
        let rec = determine_recommendation(&PdfContentType::ImageOnly, 0.9);
        assert_eq!(rec, ReconstructionRecommendation::OcrRequired);
    }
}
