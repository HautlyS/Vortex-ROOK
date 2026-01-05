//! Font Handler Module
//! Extracts and manages font information from PDFs

use lopdf::{Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Font metrics extracted from PDF
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub cap_height: f32,
    pub x_height: Option<f32>,
    pub bbox: [f32; 4],
    pub italic_angle: f32,
    pub stem_v: f32,
    pub avg_width: f32,
}

impl Default for FontMetrics {
    fn default() -> Self {
        Self {
            ascent: 800.0,
            descent: -200.0,
            cap_height: 700.0,
            x_height: Some(500.0),
            bbox: [-100.0, -300.0, 1100.0, 900.0],
            italic_angle: 0.0,
            stem_v: 80.0,
            avg_width: 500.0,
        }
    }
}

/// Extracted font information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedFont {
    pub name: String,
    pub base_font: String,
    pub font_type: String,
    pub encoding: Option<String>,
    pub metrics: FontMetrics,
    pub is_embedded: bool,
    pub is_bold: bool,
    pub is_italic: bool,
}

/// Extract all fonts from a PDF page
pub fn extract_page_fonts(
    doc: &Document,
    page_id: ObjectId,
) -> Result<HashMap<String, ExtractedFont>, String> {
    let mut fonts = HashMap::new();

    let page = doc
        .get_dictionary(page_id)
        .map_err(|e| format!("Failed to get page: {}", e))?;

    // Get Resources dictionary
    let resources = match page.get(b"Resources") {
        Ok(Object::Reference(id)) => doc.get_dictionary(*id).ok(),
        Ok(Object::Dictionary(d)) => Some(d),
        _ => None,
    };

    let resources = match resources {
        Some(r) => r,
        None => return Ok(fonts),
    };

    // Get Font dictionary from Resources
    let font_dict = match resources.get(b"Font") {
        Ok(Object::Reference(id)) => doc.get_dictionary(*id).ok(),
        Ok(Object::Dictionary(d)) => Some(d),
        _ => None,
    };

    let font_dict = match font_dict {
        Some(f) => f,
        None => return Ok(fonts),
    };

    // Extract each font
    for (name, obj) in font_dict.iter() {
        let font_name = String::from_utf8_lossy(name).to_string();

        let font_obj = match obj {
            Object::Reference(id) => doc.get_dictionary(*id).ok(),
            Object::Dictionary(d) => Some(d),
            _ => None,
        };

        if let Some(font) = font_obj {
            if let Some(extracted) = extract_font_info(doc, font, &font_name) {
                fonts.insert(font_name, extracted);
            }
        }
    }

    Ok(fonts)
}

fn extract_font_info(
    doc: &Document,
    font: &lopdf::Dictionary,
    name: &str,
) -> Option<ExtractedFont> {
    // Get font type
    let font_type = font
        .get(b"Subtype")
        .ok()
        .and_then(|o| o.as_name().ok())
        .map(|n| String::from_utf8_lossy(n).to_string())
        .unwrap_or_else(|| "Type1".to_string());

    // Get base font name
    let base_font = font
        .get(b"BaseFont")
        .ok()
        .and_then(|o| o.as_name().ok())
        .map(|n| String::from_utf8_lossy(n).to_string())
        .unwrap_or_else(|| name.to_string());

    // Get encoding
    let encoding = font
        .get(b"Encoding")
        .ok()
        .and_then(|o| match o {
            Object::Name(n) => Some(String::from_utf8_lossy(n).to_string()),
            Object::Reference(id) => doc
                .get_dictionary(*id)
                .ok()
                .and_then(|d| d.get(b"BaseEncoding").ok())
                .and_then(|o| o.as_name().ok())
                .map(|n| String::from_utf8_lossy(n).to_string()),
            _ => None,
        });

    // Get font descriptor for metrics
    let metrics = font
        .get(b"FontDescriptor")
        .ok()
        .and_then(|o| o.as_reference().ok())
        .and_then(|id| doc.get_dictionary(id).ok())
        .map(|desc| extract_metrics(desc))
        .unwrap_or_default();

    // Check if embedded
    let is_embedded = font
        .get(b"FontDescriptor")
        .ok()
        .and_then(|o| o.as_reference().ok())
        .and_then(|id| doc.get_dictionary(id).ok())
        .map(|desc| {
            desc.get(b"FontFile").is_ok()
                || desc.get(b"FontFile2").is_ok()
                || desc.get(b"FontFile3").is_ok()
        })
        .unwrap_or(false);

    // Detect style from name
    let lower_name = base_font.to_lowercase();
    let is_bold = lower_name.contains("bold") || lower_name.contains("black");
    let is_italic = lower_name.contains("italic") || lower_name.contains("oblique");

    Some(ExtractedFont {
        name: name.to_string(),
        base_font,
        font_type,
        encoding,
        metrics,
        is_embedded,
        is_bold,
        is_italic,
    })
}

fn extract_metrics(desc: &lopdf::Dictionary) -> FontMetrics {
    let get_num = |key: &[u8]| -> f32 {
        desc.get(key)
            .ok()
            .and_then(|o| match o {
                Object::Integer(i) => Some(*i as f32),
                Object::Real(f) => Some(*f),
                _ => None,
            })
            .unwrap_or(0.0)
    };

    let bbox = desc
        .get(b"FontBBox")
        .ok()
        .and_then(|o| o.as_array().ok())
        .map(|arr| {
            let mut b = [0.0f32; 4];
            for (i, obj) in arr.iter().take(4).enumerate() {
                b[i] = match obj {
                    Object::Integer(n) => *n as f32,
                    Object::Real(f) => *f,
                    _ => 0.0,
                };
            }
            b
        })
        .unwrap_or([-100.0, -300.0, 1100.0, 900.0]);

    FontMetrics {
        ascent: get_num(b"Ascent"),
        descent: get_num(b"Descent"),
        cap_height: get_num(b"CapHeight"),
        x_height: desc.get(b"XHeight").ok().and_then(|o| match o {
            Object::Integer(i) => Some(*i as f32),
            Object::Real(f) => Some(*f),
            _ => None,
        }),
        bbox,
        italic_angle: get_num(b"ItalicAngle"),
        stem_v: get_num(b"StemV"),
        avg_width: get_num(b"AvgWidth"),
    }
}

/// Calculate text width using font metrics
pub fn calculate_text_width(
    text: &str,
    font: &ExtractedFont,
    font_size: f32,
) -> f32 {
    let avg_char_width = if font.metrics.avg_width > 0.0 {
        font.metrics.avg_width / 1000.0
    } else {
        0.5 // Default to half em
    };

    text.chars().count() as f32 * avg_char_width * font_size
}

/// Calculate text height using font metrics
pub fn calculate_text_height(font: &ExtractedFont, font_size: f32) -> f32 {
    let ascent = font.metrics.ascent / 1000.0;
    let descent = font.metrics.descent.abs() / 1000.0;
    (ascent + descent) * font_size
}

/// Get font weight from font info
pub fn get_font_weight(font: &ExtractedFont) -> u16 {
    if font.is_bold {
        700
    } else {
        400
    }
}

/// Get CSS font-style from font info
pub fn get_font_style(font: &ExtractedFont) -> &'static str {
    if font.is_italic {
        "italic"
    } else {
        "normal"
    }
}

/// Map PDF font name to web-safe font family
pub fn map_to_web_font(base_font: &str) -> String {
    let lower = base_font.to_lowercase();

    // Remove subset prefix
    let name = if let Some(pos) = lower.find('+') {
        &lower[pos + 1..]
    } else {
        &lower
    };

    if name.contains("arial") || name.contains("helvetica") {
        "Arial, Helvetica, sans-serif".to_string()
    } else if name.contains("times") {
        "Times New Roman, Times, serif".to_string()
    } else if name.contains("courier") {
        "Courier New, Courier, monospace".to_string()
    } else if name.contains("georgia") {
        "Georgia, serif".to_string()
    } else if name.contains("verdana") {
        "Verdana, sans-serif".to_string()
    } else if name.contains("tahoma") {
        "Tahoma, sans-serif".to_string()
    } else if name.contains("trebuchet") {
        "Trebuchet MS, sans-serif".to_string()
    } else if name.contains("palatino") {
        "Palatino Linotype, Palatino, serif".to_string()
    } else if name.contains("garamond") {
        "Garamond, serif".to_string()
    } else if name.contains("comic") {
        "Comic Sans MS, cursive".to_string()
    } else if name.contains("impact") {
        "Impact, sans-serif".to_string()
    } else {
        // Default fallback
        "Arial, sans-serif".to_string()
    }
}
