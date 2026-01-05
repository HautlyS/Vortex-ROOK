//! DOCX Parser for WASM
//! Parses DOCX files (ZIP with XML) into document layers

use crate::models::*;
use std::io::{Cursor, Read};
use zip::ZipArchive;

pub fn parse_docx(data: &[u8]) -> Result<DocumentData, String> {
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| format!("Invalid DOCX: {}", e))?;

    let mut pages = Vec::new();
    let mut current_page = create_page(0);
    let mut layer_counter = 0;
    let mut y_offset: f32 = 50.0;

    // Parse document.xml
    if let Ok(mut file) = archive.by_name("word/document.xml") {
        let mut content = String::new();
        file.read_to_string(&mut content).map_err(|e| e.to_string())?;
        
        // Simple XML text extraction
        let paragraphs = extract_paragraphs(&content);
        
        for text in paragraphs {
            if text.trim().is_empty() {
                y_offset += 20.0;
                continue;
            }

            // Check for page break
            if y_offset > 700.0 {
                pages.push(current_page);
                current_page = create_page(pages.len());
                y_offset = 50.0;
            }

            let layer = LayerObject {
                id: format!("text-{}-{}", current_page.page_index, layer_counter),
                layer_type: "text".to_string(),
                bounds: Bounds { x: 50.0, y: y_offset, width: 500.0, height: 20.0 },
                visible: true,
                locked: false,
                z_index: layer_counter as i32,
                opacity: 1.0,
                content: Some(text),
                font_family: Some("Arial".to_string()),
                font_size: Some(12.0),
                font_weight: Some(400),
                color: Some("#000000".to_string()),
                text_align: Some("left".to_string()),
                image_url: None,
                image_path: None,
                image_data: None,
                shape_type: None,
                stroke_color: None,
                stroke_width: None,
                fill_color: None,
                source_type: "extracted".to_string(),
                role: "content".to_string(),
            };

            current_page.layers.push(layer);
            layer_counter += 1;
            y_offset += 25.0;
        }
    }

    pages.push(current_page);

    Ok(DocumentData {
        page_width: 612.0,
        page_height: 792.0,
        pages,
    })
}

fn create_page(index: usize) -> PageData {
    PageData {
        page_index: index,
        width: 612.0,
        height: 792.0,
        dpi: Some(72),
        layers: Vec::new(),
        metadata: None,
    }
}

fn extract_paragraphs(xml: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    let mut current_text = String::new();
    let mut in_text = false;
    let mut chars = xml.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '<' {
            let mut tag = String::new();
            while let Some(&nc) = chars.peek() {
                if nc == '>' {
                    chars.next();
                    break;
                }
                tag.push(chars.next().unwrap());
            }

            if tag.starts_with("w:t") && !tag.contains('/') {
                in_text = true;
            } else if tag == "/w:t" {
                in_text = false;
            } else if tag == "/w:p" {
                if !current_text.is_empty() {
                    paragraphs.push(current_text.clone());
                    current_text.clear();
                }
            }
        } else if in_text {
            current_text.push(c);
        }
    }

    if !current_text.is_empty() {
        paragraphs.push(current_text);
    }

    paragraphs
}
