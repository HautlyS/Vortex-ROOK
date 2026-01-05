//! Graphics State Module
//! Manages PDF graphics state stack

use crate::models::TransformMatrix;

/// Graphics state for tracking transforms, colors, fonts
#[derive(Clone, Debug)]
pub struct GraphicsState {
    pub ctm: TransformMatrix,
    pub fill_color: [f32; 4],
    pub stroke_color: [f32; 4],
    pub line_width: f32,
    pub font_name: Option<String>,
    pub font_size: f32,
    pub text_matrix: TransformMatrix,
    pub line_matrix: TransformMatrix,
    pub char_spacing: f32,
    pub word_spacing: f32,
    pub text_rise: f32,
    pub leading: f32,
}

impl Default for GraphicsState {
    fn default() -> Self {
        Self {
            ctm: TransformMatrix::identity(),
            fill_color: [0.0, 0.0, 0.0, 1.0],
            stroke_color: [0.0, 0.0, 0.0, 1.0],
            line_width: 1.0,
            font_name: None,
            font_size: 12.0,
            text_matrix: TransformMatrix::identity(),
            line_matrix: TransformMatrix::identity(),
            char_spacing: 0.0,
            word_spacing: 0.0,
            text_rise: 0.0,
            leading: 0.0,
        }
    }
}

/// CMYK to RGB conversion
pub fn cmyk_to_rgb(c: f32, m: f32, y: f32, k: f32) -> (f32, f32, f32) {
    ((1.0 - c) * (1.0 - k), (1.0 - m) * (1.0 - k), (1.0 - y) * (1.0 - k))
}

/// Convert RGBA to hex string
pub fn rgba_to_hex(color: &[f32; 4]) -> String {
    format!(
        "#{:02x}{:02x}{:02x}",
        (color[0] * 255.0) as u8,
        (color[1] * 255.0) as u8,
        (color[2] * 255.0) as u8
    )
}

/// Normalize PDF font name to web font
pub fn normalize_font_name(pdf_name: &str) -> String {
    let lower = pdf_name.to_lowercase();
    if lower.contains("arial") || lower.contains("helvetica") {
        "Arial".to_string()
    } else if lower.contains("times") {
        "Times New Roman".to_string()
    } else if lower.contains("courier") {
        "Courier New".to_string()
    } else if lower.contains("georgia") {
        "Georgia".to_string()
    } else if let Some(pos) = pdf_name.find('+') {
        pdf_name[pos + 1..].to_string()
    } else {
        pdf_name.to_string()
    }
}
