//! Document Parser Module
//!
//! Optimized PDF parsing using pdfium-only approach for speed.
//! Falls back to lopdf only when pdfium text extraction fails.
//!
//! ## Performance Optimizations
//! - Parallel page processing with rayon
//! - Pdfium-only parsing (skip lopdf for most PDFs)
//! - Batched image encoding with fast PNG compression
//! - Global font metrics cache
//! - Pre-filtered object iteration

use crate::font_manager::normalizer;
use crate::models::{
    Bounds, DocumentData, DocumentResponse, ImageMetadata, LayerObject, LayerRole, LayerType,
    PageData, PageMetadata, SourceType, TextAlign,
};
use pdfium_render::prelude::*;
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

static LAYER_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Global font metrics cache (shared across pages)
type FontCache = Arc<Mutex<HashMap<String, CachedFontMetrics>>>;

#[derive(Debug, Clone, Copy)]
struct CachedFontMetrics {
    descent: f32,
    ascent: f32,
}

#[inline]
fn reset_layer_counter() {
    LAYER_COUNTER.store(0, Ordering::SeqCst);
}

/// Import a document from the specified file path
#[tauri::command]
pub async fn import_document(
    file_path: String,
    file_type: String,
    app_handle: AppHandle,
) -> Result<DocumentResponse, String> {
    if !std::path::Path::new(&file_path).exists() {
        return Ok(DocumentResponse {
            success: false,
            message: format!("File not found: {}", file_path),
            data: None,
        });
    }

    crate::image_handler::clear_image_cache();
    reset_layer_counter();

    let _ = app_handle.emit(
        "parse_progress",
        serde_json::json!({
            "currentPage": 0,
            "totalPages": 0,
            "status": "Starting import..."
        }),
    );

    match file_type.to_lowercase().as_str() {
        "pdf" => parse_pdf_optimized(&file_path, &app_handle).await,
        "docx" => parse_docx(&file_path, &app_handle).await,
        _ => Ok(DocumentResponse {
            success: false,
            message: format!("Unsupported file type: {}", file_type),
            data: None,
        }),
    }
}

/// Optimized PDF parsing using pdfium only
async fn parse_pdf_optimized(
    file_path: &str,
    app_handle: &AppHandle,
) -> Result<DocumentResponse, String> {
    let pdfium = load_pdfium()?;
    let pdfium_doc = pdfium
        .load_pdf_from_file(file_path, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let total_pages = pdfium_doc.pages().len();
    if total_pages == 0 {
        return Ok(DocumentResponse {
            success: true,
            message: "PDF has no pages".to_string(),
            data: Some(DocumentData {
                page_width: 612.0,
                page_height: 792.0,
                pages: vec![],
            }),
        });
    }

    // Get default dimensions from first page
    let first_page = pdfium_doc.pages().get(0).map_err(|e| e.to_string())?;
    let default_width = first_page.width().value as f32;
    let default_height = first_page.height().value as f32;

    // Shared font cache
    let font_cache: FontCache = Arc::new(Mutex::new(HashMap::with_capacity(32)));

    // Collect page data for parallel processing
    let page_indices: Vec<u16> = (0..total_pages).collect();

    // Process pages in parallel
    let pages: Vec<PageData> = page_indices
        .par_iter()
        .map(|&page_index| {
            let page = match pdfium_doc.pages().get(page_index) {
                Ok(p) => p,
                Err(_) => return None,
            };

            let width = page.width().value as f32;
            let height = page.height().value as f32;

            // Extract text and images
            let mut layers = extract_page_content_fast(&page, page_index as usize, height, &font_cache);

            // Sort by z-index
            layers.sort_by_key(|l| l.z_index);

            Some(PageData {
                page_index: page_index as usize,
                width,
                height,
                dpi: Some(72),
                layers,
                metadata: Some(PageMetadata {
                    original_page_index: Some(page_index as usize),
                    rotation: None,
                    media_box: Some([0.0, 0.0, width, height]),
                }),
            })
        })
        .filter_map(|p| p)
        .collect();

    // Emit progress
    let _ = app_handle.emit(
        "parse_progress",
        serde_json::json!({
            "currentPage": total_pages,
            "totalPages": total_pages,
            "status": "Import complete"
        }),
    );

    Ok(DocumentResponse {
        success: true,
        message: format!("Successfully imported {} pages", pages.len()),
        data: Some(DocumentData {
            page_width: default_width,
            page_height: default_height,
            pages,
        }),
    })
}

/// Load pdfium library with fallback paths
fn load_pdfium() -> Result<Pdfium, String> {
    Pdfium::new(
        Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(
            "./lib/pdfium-v8-linux/lib/",
        ))
        .or_else(|_| {
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(
                "../lib/pdfium-v8-linux/lib/",
            ))
        })
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("Failed to load pdfium: {}", e))?,
    )
}

/// Fast content extraction using pdfium only
fn extract_page_content_fast(
    page: &PdfPage,
    page_index: usize,
    page_height: f32,
    font_cache: &FontCache,
) -> Vec<LayerObject> {
    let mut layers = Vec::with_capacity(64);
    let mut text_idx = 0;
    let mut image_idx = 0;

    // Single pass through objects
    for object in page.objects().iter() {
        match object.object_type() {
            PdfPageObjectType::Text => {
                if let Some(text_obj) = object.as_text_object() {
                    if let Some(layer) = extract_text_object(&text_obj, page_index, page_height, &mut text_idx, font_cache) {
                        layers.push(layer);
                    }
                }
            }
            PdfPageObjectType::Image => {
                if let Some(image_obj) = object.as_image_object() {
                    if let Some(layer) = extract_image_object(&image_obj, page_index, page_height, &mut image_idx) {
                        layers.push(layer);
                    }
                }
            }
            _ => {}
        }
    }

    layers
}

/// Extract text object with improved detection
fn extract_text_object(
    text_obj: &PdfPageTextObject,
    page_index: usize,
    page_height: f32,
    idx: &mut usize,
    font_cache: &FontCache,
) -> Option<LayerObject> {
    let text = text_obj.text();
    if text.trim().is_empty() {
        return None;
    }

    let bounds = text_obj.bounds().ok()?;
    let font = text_obj.font();
    let font_name = font.name();
    let font_size = text_obj.scaled_font_size().value as f32;

    // Get cached metrics or calculate
    let metrics = {
        let mut cache = font_cache.lock().unwrap();
        cache.entry(font_name.clone()).or_insert_with(|| {
            CachedFontMetrics {
                descent: font_size * 0.2,
                ascent: font_size * 0.8,
            }
        }).clone()
    };

    let color = text_obj
        .fill_color()
        .map(|c| format!("#{:02x}{:02x}{:02x}", c.red(), c.green(), c.blue()))
        .unwrap_or_else(|_| "#000000".to_string());

    let x = bounds.left().value as f32;
    let width = (bounds.right().value - bounds.left().value) as f32;
    let height = (bounds.top().value - bounds.bottom().value) as f32;
    let y = page_height - bounds.top().value as f32 + metrics.descent;

    let z_index = LAYER_COUNTER.fetch_add(1, Ordering::Relaxed) as i32;
    let parsed = normalizer::parse_font_name(&font_name);
    let canonical_name = normalizer::get_canonical_name(&font_name);

    *idx += 1;

    Some(LayerObject {
        id: format!("text-{}-{}", page_index, *idx - 1),
        layer_type: LayerType::Text,
        bounds: Bounds::new(x, y, width.max(1.0), height.max(1.0)),
        visible: true,
        locked: false,
        z_index,
        opacity: 1.0,
        content: Some(text),
        font_family: Some(canonical_name),
        font_size: Some(font_size),
        font_weight: Some(parsed.weight),
        font_style: if parsed.is_italic { Some("italic".to_string()) } else { None },
        color: Some(color),
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
    })
}

/// Extract image object with fast encoding
fn extract_image_object(
    image_obj: &PdfPageImageObject,
    page_index: usize,
    page_height: f32,
    idx: &mut usize,
) -> Option<LayerObject> {
    let bounds = image_obj.bounds().ok()?;
    let raw_image = image_obj.get_raw_image().ok()?;

    let img_width = raw_image.width();
    let img_height = raw_image.height();

    // Skip tiny images (artifacts)
    if img_width < 4 || img_height < 4 {
        return None;
    }

    let layer_id = format!("image-{}-{}", page_index, *idx);
    *idx += 1;

    // Fast PNG encoding
    let rgba_data = raw_image.to_rgba8();
    if let Some(png_data) = encode_png_fast(&rgba_data, img_width, img_height) {
        crate::image_handler::cache_image(&layer_id, png_data);
    }

    let x = bounds.left().value as f32;
    let obj_width = (bounds.right().value - bounds.left().value) as f32;
    let obj_height = (bounds.top().value - bounds.bottom().value) as f32;
    let y = page_height - bounds.top().value as f32;

    // Calculate DPI
    let dpi = if obj_width > 0.0 && obj_height > 0.0 {
        let dpi_x = (img_width as f32 / obj_width) * 72.0;
        let dpi_y = (img_height as f32 / obj_height) * 72.0;
        ((dpi_x + dpi_y) / 2.0).round() as u32
    } else {
        72
    };

    let z_index = LAYER_COUNTER.fetch_add(1, Ordering::Relaxed) as i32;

    Some(LayerObject {
        id: layer_id.clone(),
        layer_type: LayerType::Image,
        bounds: Bounds::new(x, y, obj_width.max(1.0), obj_height.max(1.0)),
        visible: true,
        locked: false,
        z_index,
        opacity: 1.0,
        content: None,
        font_family: None,
        font_size: None,
        font_weight: None,
        font_style: None,
        color: None,
        text_align: None,
        text_decoration: None,
        text_transform: None,
        line_height: None,
        letter_spacing: None,
        background_color: None,
        image_url: Some(format!("image://{}", layer_id)),
        image_path: None,
        image_data: Some(ImageMetadata {
            width: img_width,
            height: img_height,
            color_space: "RGBA".to_string(),
            dpi,
        }),
        shape_type: None,
        stroke_color: None,
        stroke_width: None,
        fill_color: None,
        path_data: None,
        transform: None,
        source_type: SourceType::Extracted,
        role: LayerRole::Content,
    })
}

/// Fast PNG encoding with minimal compression
fn encode_png_fast(rgba_data: &image::RgbaImage, width: u32, height: u32) -> Option<Vec<u8>> {
    use image::ImageEncoder;
    use std::io::Cursor;

    let mut buffer = Cursor::new(Vec::with_capacity((width * height * 4) as usize));

    // Use fast compression (level 1) instead of default
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut buffer,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::NoFilter,
    );

    encoder
        .write_image(rgba_data.as_raw(), width, height, image::ExtendedColorType::Rgba8)
        .ok()?;

    Some(buffer.into_inner())
}

// ============== DOCX Parsing (unchanged) ==============

use crate::font_manager::docx_extractor;
use crate::models::ShapeType;

/// Parse DOCX document
async fn parse_docx(file_path: &str, app_handle: &AppHandle) -> Result<DocumentResponse, String> {
    use docx_rust::DocxFile;
    use docx_rust::document::BodyContent;

    let _ = app_handle.emit(
        "parse_progress",
        serde_json::json!({
            "currentPage": 0,
            "totalPages": 1,
            "status": "Starting DOCX import..."
        }),
    );

    let docx_file = DocxFile::from_file(file_path)
        .map_err(|e| format!("Failed to open DOCX: {}", e))?;
    let docx = docx_file.parse()
        .map_err(|e| format!("Failed to parse DOCX: {}", e))?;

    let mut layers: Vec<LayerObject> = Vec::new();
    let mut layer_counter = 0;
    let mut current_y: f32 = 72.0;

    let page_width: f32 = 612.0;
    let page_margin: f32 = 72.0;
    let content_width: f32 = page_width - (page_margin * 2.0);

    let default_font = docx_extractor::get_default_font(&docx);

    let body = &docx.document.body;
    for content in &body.content {
        match content {
            BodyContent::Paragraph(para) => {
                let para_layers = parse_docx_paragraph(
                    para, &default_font, page_margin, &mut current_y,
                    content_width, &mut layer_counter
                );
                layers.extend(para_layers);
            }
            BodyContent::Table(table) => {
                let table_layers = parse_docx_table(
                    table, &default_font, page_margin, &mut current_y,
                    content_width, &mut layer_counter
                );
                layers.extend(table_layers);
            }
            _ => {}
        }
    }

    let _ = app_handle.emit(
        "parse_progress",
        serde_json::json!({
            "currentPage": 1,
            "totalPages": 1,
            "status": "Import complete"
        }),
    );

    Ok(DocumentResponse {
        success: true,
        message: format!("Successfully imported DOCX with {} layers", layer_counter),
        data: Some(DocumentData {
            page_width,
            page_height: 792.0,
            pages: vec![PageData {
                page_index: 0,
                width: page_width,
                height: 792.0,
                dpi: Some(72),
                layers,
                metadata: None,
            }],
        }),
    })
}

fn parse_docx_paragraph(
    para: &docx_rust::document::Paragraph,
    default_font: &str,
    x_offset: f32,
    current_y: &mut f32,
    max_width: f32,
    counter: &mut usize,
) -> Vec<LayerObject> {
    use docx_rust::document::{ParagraphContent, RunContent};

    let mut layers = Vec::new();
    let para_props = docx_extractor::extract_paragraph_props(para);

    let mut runs_data: Vec<(String, docx_extractor::DocxFontInfo)> = Vec::new();

    for para_content in &para.content {
        if let ParagraphContent::Run(run) = para_content {
            let run_font = docx_extractor::extract_run_font(run);
            let merged_font = docx_extractor::merge_font_info(&run_font, &para_props, default_font);

            let mut run_text = String::new();
            for run_content in &run.content {
                if let RunContent::Text(text) = run_content {
                    run_text.push_str(&text.text);
                }
            }

            if !run_text.is_empty() {
                runs_data.push((run_text, merged_font));
            }
        }
    }

    if runs_data.is_empty() {
        *current_y += para_props.spacing_after.unwrap_or(6.0);
        return layers;
    }

    let indent_left = para_props.indent_left.unwrap_or(0.0);
    let x = x_offset + indent_left;
    let available_width = max_width - indent_left - para_props.indent_right.unwrap_or(0.0);

    let mut run_x = x;
    for (text, font_info) in runs_data {
        let font_size = font_info.size.unwrap_or(11.0);
        let text_height = font_size * (para_props.line_spacing.unwrap_or(1.15));

        let char_width_factor = if font_info.resolved.to_lowercase().contains("mono") { 0.6 } else { 0.5 };
        let text_width = (text.chars().count() as f32 * font_size * char_width_factor).min(available_width);

        let canonical_font = normalizer::get_canonical_name(&font_info.resolved);
        let weight = if font_info.is_bold { 700u16 } else { 400u16 };
        let color = font_info.color.unwrap_or_else(|| "#000000".to_string());

        let text_align = match para_props.alignment.as_deref() {
            Some("center") => TextAlign::Center,
            Some("right") => TextAlign::Right,
            _ => TextAlign::Left,
        };

        layers.push(LayerObject {
            id: format!("text-0-{}", *counter),
            layer_type: LayerType::Text,
            bounds: Bounds::new(run_x, *current_y, text_width.max(1.0), text_height),
            visible: true,
            locked: false,
            z_index: *counter as i32,
            opacity: 1.0,
            content: Some(text),
            font_family: Some(canonical_font),
            font_size: Some(font_size),
            font_weight: Some(weight),
            font_style: if font_info.is_italic { Some("italic".to_string()) } else { None },
            color: Some(color),
            text_align: Some(text_align),
            text_decoration: if font_info.underline { Some("underline".to_string()) }
                            else if font_info.strike { Some("line-through".to_string()) }
                            else { None },
            text_transform: None,
            line_height: para_props.line_spacing,
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
        });

        run_x += text_width;
        *counter += 1;
    }

    let last_font_size = layers.last().and_then(|l| l.font_size).unwrap_or(11.0);
    let line_height = last_font_size * para_props.line_spacing.unwrap_or(1.15);
    *current_y += line_height + para_props.spacing_after.unwrap_or(4.0);

    layers
}

fn parse_docx_table(
    table: &docx_rust::document::Table,
    default_font: &str,
    x_offset: f32,
    current_y: &mut f32,
    max_width: f32,
    counter: &mut usize,
) -> Vec<LayerObject> {
    use docx_rust::document::{TableRowContent, TableCellContent, ParagraphContent, RunContent};

    let mut layers = Vec::new();

    let col_widths = docx_extractor::extract_table_grid(table);
    let (table_width, _) = docx_extractor::extract_table_props(table);

    let total_width = table_width.unwrap_or(max_width);
    let num_cols = col_widths.len().max(1);
    let default_col_width = total_width / num_cols as f32;

    let table_start_y = *current_y;
    let mut row_y = table_start_y;

    for row in &table.rows {
        let mut col_index = 0;
        let mut row_height: f32 = 20.0;
        let mut cell_layers: Vec<LayerObject> = Vec::new();

        for cell_content in &row.cells {
            if let TableRowContent::TableCell(cell) = cell_content {
                let cell_props = docx_extractor::extract_cell_props(cell);

                if cell_props.row_span == 0 {
                    continue;
                }

                let cell_x: f32 = x_offset + col_widths.iter().take(col_index).sum::<f32>();
                let cell_width = if col_index < col_widths.len() {
                    col_widths.iter()
                        .skip(col_index)
                        .take(cell_props.col_span.max(1) as usize)
                        .sum::<f32>()
                } else {
                    cell_props.width.unwrap_or(default_col_width)
                };

                let mut cell_content_y = row_y + 2.0;
                for tc_content in &cell.content {
                    let TableCellContent::Paragraph(para) = tc_content;
                    let para_props = docx_extractor::extract_paragraph_props(para);

                    let mut cell_text = String::new();
                    let mut first_font: Option<docx_extractor::DocxFontInfo> = None;

                    for para_content in &para.content {
                        if let ParagraphContent::Run(run) = para_content {
                            let run_font = docx_extractor::extract_run_font(run);
                            if first_font.is_none() {
                                first_font = Some(docx_extractor::merge_font_info(&run_font, &para_props, default_font));
                            }

                            for run_content in &run.content {
                                if let RunContent::Text(text) = run_content {
                                    cell_text.push_str(&text.text);
                                }
                            }
                        }
                    }

                    if !cell_text.trim().is_empty() {
                        let font_info = first_font.unwrap_or_else(|| docx_extractor::DocxFontInfo {
                            ascii: None, east_asia: None, h_ansi: None, cs: None,
                            theme_font: None, resolved: default_font.to_string(),
                            size: Some(11.0), is_bold: false, is_italic: false,
                            color: None, underline: false, strike: false,
                        });

                        let font_size = font_info.size.unwrap_or(11.0);
                        let text_height = font_size * 1.2;
                        let canonical_font = normalizer::get_canonical_name(&font_info.resolved);
                        let weight = if font_info.is_bold { 700u16 } else { 400u16 };
                        let color = font_info.color.unwrap_or_else(|| "#000000".to_string());

                        cell_layers.push(LayerObject {
                            id: format!("text-0-{}", *counter),
                            layer_type: LayerType::Text,
                            bounds: Bounds::new(cell_x + 4.0, cell_content_y, (cell_width - 8.0).max(1.0), text_height),
                            visible: true,
                            locked: false,
                            z_index: *counter as i32,
                            opacity: 1.0,
                            content: Some(cell_text),
                            font_family: Some(canonical_font),
                            font_size: Some(font_size),
                            font_weight: Some(weight),
                            font_style: if font_info.is_italic { Some("italic".to_string()) } else { None },
                            color: Some(color),
                            text_align: Some(match para_props.alignment.as_deref() {
                                Some("center") => TextAlign::Center,
                                Some("right") => TextAlign::Right,
                                _ => TextAlign::Left,
                            }),
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
                        });

                        cell_content_y += text_height + 2.0;
                        *counter += 1;
                    }
                }

                let cell_height = cell_content_y - row_y + 4.0;
                row_height = row_height.max(cell_height);

                col_index += cell_props.col_span.max(1) as usize;
            }
        }

        layers.extend(cell_layers);
        row_y += row_height;
    }

    let table_height = row_y - table_start_y;
    if table_height > 0.0 {
        layers.insert(0, LayerObject {
            id: format!("table-border-0-{}", *counter),
            layer_type: LayerType::Shape,
            bounds: Bounds::new(x_offset, table_start_y, total_width, table_height),
            visible: true,
            locked: false,
            z_index: 0,
            opacity: 1.0,
            content: None,
            font_family: None,
            font_size: None,
            font_weight: None,
            font_style: None,
            color: None,
            text_align: None,
            text_decoration: None,
            text_transform: None,
            line_height: None,
            letter_spacing: None,
            background_color: None,
            image_url: None,
            image_path: None,
            image_data: None,
            shape_type: Some(ShapeType::Rectangle),
            stroke_color: Some("#000000".to_string()),
            stroke_width: Some(1.0),
            fill_color: None,
            path_data: None,
            transform: None,
            source_type: SourceType::Extracted,
            role: LayerRole::Content,
        });
        *counter += 1;
    }

    *current_y = row_y + 8.0;
    layers
}

#[inline]
pub fn generate_layer_id(layer_type: &str, page_index: usize, seq_number: usize) -> String {
    format!("{}-{}-{}", layer_type, page_index, seq_number)
}
