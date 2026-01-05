//! Document Parser Module
//!
//! Enhanced hybrid PDF parsing using pdfium for images and lopdf for content streams.
//! Provides exact positioning, font metrics, and preserves all visual elements.
//! Uses font_manager for proper font detection and normalization.
//!
//! ## Optimizations
//! - Iterator chains instead of intermediate collections
//! - Pre-allocated vectors with capacity hints
//! - Inline hints for hot paths

use crate::content_parser::{parse_page_content, to_layer_objects};
use crate::font_handler::extract_page_fonts;
use crate::font_manager::{normalizer, docx_extractor};
use crate::models::{
    Bounds, DocumentData, DocumentResponse, ImageMetadata, LayerObject, LayerRole, LayerType,
    PageData, PageMetadata, ShapeType, SourceType, TextAlign,
};
use lopdf::Document as LopdfDocument;
use pdfium_render::prelude::*;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter};

static LAYER_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Font metrics cache for better text positioning
#[derive(Debug, Clone, Copy, Default)]
struct FontMetrics {
    #[allow(dead_code)]
    ascent: f32,
    descent: f32,
    #[allow(dead_code)]
    line_height: f32,
    #[allow(dead_code)]
    avg_char_width: f32,
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
        "pdf" => parse_pdf_hybrid(&file_path, &app_handle).await,
        "docx" => parse_docx(&file_path, &app_handle).await,
        _ => Ok(DocumentResponse {
            success: false,
            message: format!("Unsupported file type: {}", file_type),
            data: None,
        }),
    }
}

/// Hybrid PDF parsing: lopdf for content streams, pdfium for images
async fn parse_pdf_hybrid(
    file_path: &str,
    app_handle: &AppHandle,
) -> Result<DocumentResponse, String> {
    // Load pdfium from bundled library
    let pdfium = Pdfium::new(
        Pdfium::bind_to_library(
            Pdfium::pdfium_platform_library_name_at_path("./lib/pdfium-v8-linux/lib/")
        ).or_else(|_| Pdfium::bind_to_library(
            Pdfium::pdfium_platform_library_name_at_path("../lib/pdfium-v8-linux/lib/")
        )).or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("Failed to load pdfium: {}", e))?
    );
    let pdfium_doc = pdfium
        .load_pdf_from_file(file_path, None)
        .map_err(|e| format!("Pdfium error: {}", e))?;

    // Load with lopdf for content parsing
    let lopdf_doc = LopdfDocument::load(file_path)
        .map_err(|e| format!("lopdf error: {}", e))?;

    let total_pages = pdfium_doc.pages().len();
    let mut pages: Vec<PageData> = Vec::with_capacity(total_pages as usize);

    let (default_width, default_height) = if total_pages > 0 {
        let first_page = pdfium_doc.pages().get(0).map_err(|e| e.to_string())?;
        (first_page.width().value as f32, first_page.height().value as f32)
    } else {
        (612.0, 792.0)
    };

    let lopdf_pages = lopdf_doc.get_pages();

    for page_index in 0..total_pages {
        let _ = app_handle.emit(
            "parse_progress",
            serde_json::json!({
                "currentPage": page_index + 1,
                "totalPages": total_pages,
                "status": format!("Processing page {} of {}", page_index + 1, total_pages)
            }),
        );

        let pdfium_page = pdfium_doc
            .pages()
            .get(page_index as u16)
            .map_err(|e| e.to_string())?;

        let width = pdfium_page.width().value as f32;
        let height = pdfium_page.height().value as f32;

        let mut layers: Vec<LayerObject> = Vec::new();

        // Try lopdf content parsing first for vectors and text
        let page_num = (page_index + 1) as u32;
        if let Some(&page_id) = lopdf_pages.get(&page_num) {
            // Extract fonts for this page
            let _fonts = extract_page_fonts(&lopdf_doc, page_id).unwrap_or_default();

            // Parse content stream
            match parse_page_content(&lopdf_doc, page_id, height) {
                Ok((texts, paths)) => {
                    let content_layers = to_layer_objects(texts, paths, page_index as usize);
                    layers.extend(content_layers);
                }
                Err(e) => {
                    eprintln!("Content parsing failed for page {}: {}", page_index, e);
                    // Fallback to pdfium text extraction
                    let text_layers = extract_text_pdfium(&pdfium_page, page_index as usize, height);
                    layers.extend(text_layers);
                }
            }
        } else {
            // Fallback to pdfium
            let text_layers = extract_text_pdfium(&pdfium_page, page_index as usize, height);
            layers.extend(text_layers);
        }

        // Extract images via pdfium (better quality)
        let image_layers = extract_images_pdfium(&pdfium_page, page_index as usize, height);
        layers.extend(image_layers);

        // Sort by z-index
        layers.sort_by_key(|l| l.z_index);

        pages.push(PageData {
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
        });
    }

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

/// Extract text using pdfium with enhanced font metrics
fn extract_text_pdfium(
    page: &PdfPage,
    page_index: usize,
    page_height: f32,
) -> Vec<LayerObject> {
    let mut layers = Vec::new();
    let mut idx = 0;
    let mut font_cache: HashMap<String, FontMetrics> = HashMap::new();

    for object in page.objects().iter() {
        if let PdfPageObjectType::Text = object.object_type() {
            if let Some(text_obj) = object.as_text_object() {
                let text = text_obj.text();
                if text.trim().is_empty() {
                    continue;
                }

                let bounds = match text_obj.bounds() {
                    Ok(b) => b,
                    Err(_) => continue,
                };

                let font = text_obj.font();
                let font_name = font.name();
                let font_size = text_obj.scaled_font_size().value as f32;

                // Get or calculate font metrics
                let metrics = font_cache.entry(font_name.clone()).or_insert_with(|| {
                    calculate_font_metrics(&font, font_size)
                });

                let color = text_obj
                    .fill_color()
                    .map(|c| format!("#{:02x}{:02x}{:02x}", c.red(), c.green(), c.blue()))
                    .unwrap_or_else(|_| "#000000".to_string());

                let x = bounds.left().value as f32;
                let width = (bounds.right().value - bounds.left().value) as f32;
                let height = (bounds.top().value - bounds.bottom().value) as f32;
                
                // Adjust y position using font metrics for better baseline alignment
                let y = page_height - bounds.top().value as f32 + metrics.descent;

                let z_index = LAYER_COUNTER.fetch_add(1, Ordering::SeqCst) as i32;

                // Use font_manager for proper font parsing
                let parsed = normalizer::parse_font_name(&font_name);
                let canonical_name = normalizer::get_canonical_name(&font_name);

                layers.push(LayerObject {
                    id: format!("text-{}-{}", page_index, idx),
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
                });
                idx += 1;
            }
        }
    }

    layers
}

/// Calculate font metrics from pdfium font
#[inline]
fn calculate_font_metrics(_font: &PdfFont, font_size: f32) -> FontMetrics {
    // Use font's built-in metrics if available, otherwise estimate
    FontMetrics {
        ascent: font_size * 0.8,  // Typical ascent ratio
        descent: font_size * 0.2, // Typical descent ratio
        line_height: font_size * 1.2,
        avg_char_width: font_size * 0.5,
    }
}

/// Extract images using pdfium with enhanced format detection
fn extract_images_pdfium(
    page: &PdfPage,
    page_index: usize,
    page_height: f32,
) -> Vec<LayerObject> {
    let mut layers = Vec::new();
    let mut idx = 0;

    for object in page.objects().iter() {
        if let PdfPageObjectType::Image = object.object_type() {
            if let Some(image_obj) = object.as_image_object() {
                let bounds = match image_obj.bounds() {
                    Ok(b) => b,
                    Err(_) => continue,
                };

                let raw_image = match image_obj.get_raw_image() {
                    Ok(img) => img,
                    Err(_) => continue,
                };

                let img_width = raw_image.width();
                let img_height = raw_image.height();
                
                // Skip very small images (likely artifacts)
                if img_width < 4 || img_height < 4 {
                    continue;
                }

                let layer_id = format!("image-{}-{}", page_index, idx);

                // Determine color space
                let color_space = determine_color_space(&raw_image);

                // Convert to RGBA8 and cache as PNG
                let rgba_data = raw_image.to_rgba8();
                if let Some(png_data) = encode_image_optimized(&rgba_data, img_width, img_height) {
                    crate::image_handler::cache_image(&layer_id, png_data);
                }

                let x = bounds.left().value as f32;
                let obj_width = (bounds.right().value - bounds.left().value) as f32;
                let obj_height = (bounds.top().value - bounds.bottom().value) as f32;
                let y = page_height - bounds.top().value as f32;

                // Calculate DPI based on image vs display size
                let dpi_x = if obj_width > 0.0 { (img_width as f32 / obj_width) * 72.0 } else { 72.0 };
                let dpi_y = if obj_height > 0.0 { (img_height as f32 / obj_height) * 72.0 } else { 72.0 };
                let dpi = ((dpi_x + dpi_y) / 2.0).round() as u32;

                let z_index = LAYER_COUNTER.fetch_add(1, Ordering::SeqCst) as i32;

                layers.push(LayerObject {
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
                        color_space: color_space.to_string(),
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
                });
                idx += 1;
            }
        }
    }

    layers
}

/// Determine color space from image
#[inline]
fn determine_color_space(image: &image::DynamicImage) -> &'static str {
    match image.color() {
        image::ColorType::L8 | image::ColorType::L16 => "Grayscale",
        image::ColorType::La8 | image::ColorType::La16 => "GrayscaleAlpha",
        image::ColorType::Rgb8 | image::ColorType::Rgb16 => "RGB",
        image::ColorType::Rgba8 | image::ColorType::Rgba16 => "RGBA",
        _ => "Unknown",
    }
}

/// Encode image with optimization
fn encode_image_optimized(rgba_data: &image::RgbaImage, width: u32, height: u32) -> Option<Vec<u8>> {
    use image::ImageEncoder;
    use std::io::Cursor;

    let mut buffer = Cursor::new(Vec::new());
    
    // Use PNG with compression
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut buffer,
        image::codecs::png::CompressionType::Default,
        image::codecs::png::FilterType::Adaptive,
    );
    
    encoder
        .write_image(rgba_data.as_raw(), width, height, image::ExtendedColorType::Rgba8)
        .ok()?;
    
    Some(buffer.into_inner())
}

/// Parse DOCX document with proper font extraction and table support
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
    let mut current_y: f32 = 72.0; // Start with 1 inch margin
    
    // Page dimensions (US Letter)
    let page_width: f32 = 612.0;
    let page_margin: f32 = 72.0;
    let content_width: f32 = page_width - (page_margin * 2.0);

    // Get default document font
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

/// Parse a DOCX paragraph into layers
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
    
    // Collect all runs with their formatting
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
        // Empty paragraph - add spacing
        *current_y += para_props.spacing_after.unwrap_or(6.0);
        return layers;
    }

    // Calculate x position with indentation
    let indent_left = para_props.indent_left.unwrap_or(0.0);
    let x = x_offset + indent_left;
    let available_width = max_width - indent_left - para_props.indent_right.unwrap_or(0.0);

    // Create layers for each run (preserving individual formatting)
    let mut run_x = x;
    for (text, font_info) in runs_data {
        let font_size = font_info.size.unwrap_or(11.0);
        let text_height = font_size * (para_props.line_spacing.unwrap_or(1.15));
        
        // Estimate text width
        let char_width_factor = if font_info.resolved.to_lowercase().contains("mono") { 0.6 } else { 0.5 };
        let text_width = (text.chars().count() as f32 * font_size * char_width_factor).min(available_width);
        
        let canonical_font = normalizer::get_canonical_name(&font_info.resolved);
        let weight = if font_info.is_bold { 700u16 } else { 400u16 };
        let color = font_info.color.unwrap_or_else(|| "#000000".to_string());

        // Determine text alignment
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

    // Update Y position for next element
    let last_font_size = layers.last()
        .and_then(|l| l.font_size)
        .unwrap_or(11.0);
    let line_height = last_font_size * para_props.line_spacing.unwrap_or(1.15);
    *current_y += line_height + para_props.spacing_after.unwrap_or(4.0);

    layers
}

/// Parse a DOCX table into layers with proper cell positioning
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
    
    // Extract table grid for column widths
    let col_widths = docx_extractor::extract_table_grid(table);
    let (table_width, _alignment) = docx_extractor::extract_table_props(table);
    
    // Calculate column widths - use grid or distribute evenly
    let total_width = table_width.unwrap_or(max_width);
    let num_cols = col_widths.len().max(1);
    let default_col_width = total_width / num_cols as f32;
    
    let table_start_y = *current_y;
    let mut row_y = table_start_y;

    // Process each row
    for row in &table.rows {
        let mut col_index = 0;
        let mut row_height: f32 = 20.0; // Minimum row height
        let mut cell_layers: Vec<LayerObject> = Vec::new();

        // Iterate over cells in the row
        for cell_content in &row.cells {
            if let TableRowContent::TableCell(cell) = cell_content {
                let cell_props = docx_extractor::extract_cell_props(cell);
                
                // Skip merged cells (row_span = 0)
                if cell_props.row_span == 0 {
                    continue;
                }

                // Calculate cell position
                let cell_x: f32 = x_offset + col_widths.iter().take(col_index).sum::<f32>();
                let cell_width = if col_index < col_widths.len() {
                    // Sum widths for column span
                    col_widths.iter()
                        .skip(col_index)
                        .take(cell_props.col_span.max(1) as usize)
                        .sum::<f32>()
                } else {
                    cell_props.width.unwrap_or(default_col_width)
                };

                // Process cell content (paragraphs)
                let mut cell_content_y = row_y + 2.0; // Cell padding
                for tc_content in &cell.content {
                    let TableCellContent::Paragraph(para) = tc_content;
                    let para_props = docx_extractor::extract_paragraph_props(para);
                    
                    // Collect text from runs
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

                // Update row height based on cell content
                let cell_height = cell_content_y - row_y + 4.0; // Add bottom padding
                row_height = row_height.max(cell_height);
                
                col_index += cell_props.col_span.max(1) as usize;
            }
        }

        layers.extend(cell_layers);
        row_y += row_height;
    }

    // Add table border (outer rectangle)
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

    *current_y = row_y + 8.0; // Space after table
    layers
}

#[inline]
pub fn generate_layer_id(layer_type: &str, page_index: usize, seq_number: usize) -> String {
    format!("{}-{}-{}", layer_type, page_index, seq_number)
}
