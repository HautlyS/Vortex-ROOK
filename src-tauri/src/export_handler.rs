//! Export Handler Module
//!
//! Handles exporting documents to PDF, DOCX, and BookProject formats.
//!
//! ## Optimizations
//! - Uses `BufWriter` for efficient file I/O
//! - Pre-sorted layers to avoid repeated sorting
//! - Inline hints for hot paths

use crate::models::{BookProjectData, DocumentMetadata, ExportResult, PageData};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufWriter, Write};
use thiserror::Error;

/// Export-specific errors
#[derive(Debug, Error)]
pub enum ExportError {
    #[error("No pages to export")]
    NoPages,
    #[error("Invalid page range: {0}")]
    InvalidPageRange(String),
    #[error("Failed to create output file: {0}")]
    FileCreation(#[from] std::io::Error),
    #[error("PDF generation failed: {0}")]
    PdfGeneration(String),
    #[error("DOCX generation failed: {0}")]
    DocxGeneration(String),
    #[error("JSON serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Unsupported export format: {0}")]
    UnsupportedFormat(String),
}

impl From<ExportError> for String {
    fn from(err: ExportError) -> Self {
        err.to_string()
    }
}

/// Export format options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Pdf,
    Docx,
    BookProj,
}

/// Export options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub output_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_range: Option<(usize, usize)>,
    #[serde(default = "default_image_quality")]
    pub image_quality: u8,
    #[serde(default)]
    pub compress_text: bool,
    #[serde(default)]
    pub create_layers: bool,
}

fn default_image_quality() -> u8 {
    100
}

/// Export a document to the specified format
#[tauri::command]
pub async fn export_document(
    format: String,
    pages: Vec<PageData>,
    output_path: String,
    metadata: DocumentMetadata,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    // Spawn blocking task for CPU-intensive export operations
    let result = tokio::task::spawn_blocking(move || {
        match format.to_lowercase().as_str() {
            "pdf" => export_pdf_sync(&pages, &output_path, &metadata, &options),
            "docx" => export_docx_sync(&pages, &output_path, &metadata, &options),
            "bookproj" => export_bookproj_sync(&pages, &output_path, &metadata, &options),
            _ => Err(ExportError::UnsupportedFormat(format)),
        }
    })
    .await
    .map_err(|e| format!("Export task failed: {}", e))?;

    match result {
        Ok(r) => Ok(r),
        Err(e) => Ok(ExportResult {
            success: false,
            message: e.to_string(),
            output_path: None,
        }),
    }
}

/// Synchronous PDF export (runs in blocking task)
fn export_pdf_sync(
    pages: &[PageData],
    output_path: &str,
    metadata: &DocumentMetadata,
    options: &ExportOptions,
) -> Result<ExportResult, ExportError> {
    use printpdf::*;

    let page_range = options
        .page_range
        .unwrap_or((0, pages.len().saturating_sub(1)));

    // Validate page range
    if page_range.0 > page_range.1 || page_range.1 >= pages.len() {
        return Err(ExportError::InvalidPageRange(format!(
            "Range {}-{} is invalid for {} pages",
            page_range.0,
            page_range.1,
            pages.len()
        )));
    }

    let pages_to_export: Vec<_> = pages
        .iter()
        .enumerate()
        .filter(|(i, _)| *i >= page_range.0 && *i <= page_range.1)
        .map(|(_, p)| p)
        .collect();

    if pages_to_export.is_empty() {
        return Err(ExportError::NoPages);
    }

    let first_page = pages_to_export[0];
    let (doc, page1, layer1) = PdfDocument::new(
        &metadata.title,
        Mm(first_page.width as f32 * 0.352778),
        Mm(first_page.height as f32 * 0.352778),
        "Layer 1",
    );

    let mut doc = doc;

    // Set metadata
    doc = doc.with_title(&metadata.title);
    if !metadata.author.is_empty() {
        doc = doc.with_author(&metadata.author);
    }

    // Render first page
    render_page_to_pdf(&doc, page1, layer1, first_page)
        .map_err(ExportError::PdfGeneration)?;

    // Add remaining pages
    for page_data in pages_to_export.iter().skip(1) {
        let (page_idx, layer_idx) = doc.add_page(
            Mm(page_data.width as f32 * 0.352778),
            Mm(page_data.height as f32 * 0.352778),
            "Layer 1",
        );
        render_page_to_pdf(&doc, page_idx, layer_idx, page_data)
            .map_err(ExportError::PdfGeneration)?;
    }

    // Save to file with buffered writer
    let file = File::create(output_path)?;
    let mut writer = BufWriter::with_capacity(64 * 1024, file);
    doc.save(&mut writer)
        .map_err(|e| ExportError::PdfGeneration(e.to_string()))?;

    Ok(ExportResult {
        success: true,
        message: format!("Exported {} pages to PDF", pages_to_export.len()),
        output_path: Some(output_path.to_string()),
    })
}

fn render_page_to_pdf(
    doc: &printpdf::PdfDocumentReference,
    page_idx: printpdf::PdfPageIndex,
    layer_idx: printpdf::PdfLayerIndex,
    page: &PageData,
) -> Result<(), String> {
    use printpdf::*;

    let layer = doc.get_page(page_idx).get_layer(layer_idx);
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    // Sort layers by z-index for proper rendering order
    let mut sorted_layers: Vec<_> = page.layers.iter().filter(|l| l.visible).collect();
    sorted_layers.sort_by_key(|l| l.z_index);

    for layer_obj in sorted_layers {
        match layer_obj.layer_type.to_string().as_str() {
            "text" => {
                if let Some(content) = &layer_obj.content {
                    let font_size = layer_obj.font_size.unwrap_or(12.0);
                    let x = Mm(layer_obj.bounds.x as f32 * 0.352778);
                    let y = Mm((page.height - layer_obj.bounds.y - font_size as f32) * 0.352778);

                    // Use bold font if weight >= 700
                    let use_font = if layer_obj.font_weight.unwrap_or(400) >= 700 {
                        &font_bold
                    } else {
                        &font
                    };

                    // Set text color if specified
                    if let Some(color) = &layer_obj.color {
                        if let Some((r, g, b)) = parse_hex_color(color) {
                            layer.set_fill_color(Color::Rgb(Rgb::new(
                                r as f32 / 255.0,
                                g as f32 / 255.0,
                                b as f32 / 255.0,
                                None,
                            )));
                        }
                    }

                    layer.use_text(content, font_size as f32, x, y, use_font);
                }
            }
            "shape" => {
                // Render shapes
                let x = Mm(layer_obj.bounds.x as f32 * 0.352778);
                let y = Mm((page.height - layer_obj.bounds.y - layer_obj.bounds.height) * 0.352778);
                let w = Mm(layer_obj.bounds.width as f32 * 0.352778);
                let h = Mm(layer_obj.bounds.height as f32 * 0.352778);

                // Set fill color
                if let Some(fill) = &layer_obj.fill_color {
                    if let Some((r, g, b)) = parse_hex_color(fill) {
                        layer.set_fill_color(Color::Rgb(Rgb::new(
                            r as f32 / 255.0,
                            g as f32 / 255.0,
                            b as f32 / 255.0,
                            None,
                        )));
                    }
                }

                // Set stroke color and width
                if let Some(stroke) = &layer_obj.stroke_color {
                    if let Some((r, g, b)) = parse_hex_color(stroke) {
                        layer.set_outline_color(Color::Rgb(Rgb::new(
                            r as f32 / 255.0,
                            g as f32 / 255.0,
                            b as f32 / 255.0,
                            None,
                        )));
                    }
                }
                
                let stroke_width = layer_obj.stroke_width.unwrap_or(1.0);
                layer.set_outline_thickness(stroke_width);

                // Draw rectangle using line operations
                let points = vec![
                    (Point::new(x, y), false),
                    (Point::new(x + w, y), false),
                    (Point::new(x + w, y + h), false),
                    (Point::new(x, y + h), false),
                ];
                
                let line = Line {
                    points,
                    is_closed: true,
                };
                
                layer.add_line(line);
            }
            "image" => {
                // Image embedding in printpdf 0.7 requires specific decoder setup
                // For now, skip image embedding - images will need to be re-added manually
                // TODO: Implement proper image embedding with printpdf's RawImage API
            }
            _ => {
                // Skip other layer types
            }
        }
    }

    Ok(())
}

/// Parse hex color string to RGB values
#[inline]
fn parse_hex_color(color: &str) -> Option<(u8, u8, u8)> {
    let color = color.trim_start_matches('#');
    if color.len() != 6 {
        return None;
    }
    
    let r = u8::from_str_radix(&color[0..2], 16).ok()?;
    let g = u8::from_str_radix(&color[2..4], 16).ok()?;
    let b = u8::from_str_radix(&color[4..6], 16).ok()?;
    
    Some((r, g, b))
}

/// Export to DOCX format (synchronous)
fn export_docx_sync(
    pages: &[PageData],
    output_path: &str,
    _metadata: &DocumentMetadata,
    options: &ExportOptions,
) -> Result<ExportResult, ExportError> {
    use docx_rust::document::Paragraph;
    use docx_rust::Docx;

    let page_range = options
        .page_range
        .unwrap_or((0, pages.len().saturating_sub(1)));

    let mut docx = Docx::default();

    for (i, page) in pages.iter().enumerate() {
        if i < page_range.0 || i > page_range.1 {
            continue;
        }

        // Sort layers by z-index
        let mut sorted_layers: Vec<_> = page.layers.iter().filter(|l| l.visible).collect();
        sorted_layers.sort_by_key(|l| l.z_index);

        for layer in sorted_layers {
            if layer.layer_type.to_string() == "text" {
                if let Some(content) = &layer.content {
                    let para = Paragraph::default().push_text(content.as_str());
                    docx.document.push(para);
                }
            }
        }
    }

    // Write to file
    let file = File::create(output_path)?;
    docx.write(file)
        .map_err(|e| ExportError::DocxGeneration(e.to_string()))?;

    Ok(ExportResult {
        success: true,
        message: format!("Exported to DOCX: {}", output_path),
        output_path: Some(output_path.to_string()),
    })
}

/// Export to BookProject format (JSON + assets) (synchronous)
fn export_bookproj_sync(
    pages: &[PageData],
    output_path: &str,
    metadata: &DocumentMetadata,
    _options: &ExportOptions,
) -> Result<ExportResult, ExportError> {
    let project = BookProjectData {
        format: "bookproj".to_string(),
        version: "1.0.0".to_string(),
        metadata: metadata.clone(),
        document: crate::models::DocumentData {
            page_width: pages.first().map(|p| p.width).unwrap_or(612.0),
            page_height: pages.first().map(|p| p.height).unwrap_or(792.0),
            pages: pages.to_vec(),
        },
        settings: crate::models::ProjectSettings {
            default_font: Some("Arial".to_string()),
            default_font_size: Some(12.0),
            export_quality: Some("standard".to_string()),
        },
    };

    let json = serde_json::to_string_pretty(&project)?;

    let file = File::create(output_path)?;
    let mut writer = BufWriter::with_capacity(32 * 1024, file);
    writer.write_all(json.as_bytes())?;

    Ok(ExportResult {
        success: true,
        message: format!("Project saved to: {}", output_path),
        output_path: Some(output_path.to_string()),
    })
}

/// Load a BookProject file
#[tauri::command]
pub async fn load_project(file_path: String) -> Result<BookProjectData, String> {
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let project: BookProjectData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(project)
}

/// Save current project
#[tauri::command]
pub async fn save_project(
    project: BookProjectData,
    output_path: String,
) -> Result<ExportResult, String> {
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;

    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(ExportResult {
        success: true,
        message: format!("Project saved: {}", output_path),
        output_path: Some(output_path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_options_defaults() {
        let json = r#"{
            "format": "pdf",
            "outputPath": "/tmp/test.pdf"
        }"#;

        let options: ExportOptions = serde_json::from_str(json).unwrap();
        assert_eq!(options.image_quality, 100);
        assert!(!options.compress_text);
        assert!(!options.create_layers);
    }

    #[test]
    fn test_export_error_display() {
        let err = ExportError::NoPages;
        assert_eq!(err.to_string(), "No pages to export");

        let err = ExportError::UnsupportedFormat("xyz".to_string());
        assert_eq!(err.to_string(), "Unsupported export format: xyz");
    }

    #[test]
    fn test_export_error_to_string() {
        let err = ExportError::InvalidPageRange("0-100".to_string());
        let s: String = err.into();
        assert!(s.contains("Invalid page range"));
    }
}
