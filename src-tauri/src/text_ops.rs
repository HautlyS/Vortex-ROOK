//! Text Operations Module
//! Handles PDF text extraction with positioning

use crate::graphics_state::GraphicsState;
use crate::models::TransformMatrix;

/// Extracted text with exact position
#[derive(Debug, Clone)]
pub struct ExtractedText {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub font_name: String,
    pub font_size: f32,
    pub color: [f32; 4],
    pub transform: TransformMatrix,
}

/// Calculate text width based on character count and font metrics
fn calculate_text_width(text: &str, font_size: f32, font_name: &str) -> f32 {
    let char_count = text.chars().count() as f32;

    // Average character width factor based on font type
    let width_factor = if font_name.to_lowercase().contains("courier")
        || font_name.to_lowercase().contains("mono")
    {
        0.6 // Monospace fonts
    } else if font_name.to_lowercase().contains("times") {
        0.45 // Times is narrower
    } else {
        0.52 // Default for Arial/Helvetica-like fonts
    };

    char_count * font_size * width_factor
}

/// Create extracted text from current state
pub fn create_text(text: &str, state: &GraphicsState, page_height: f32) -> ExtractedText {
    // Combine CTM with text matrix: CTM * Tm
    let combined = state.ctm.multiply(&state.text_matrix);
    
    // The text position is in the translation components (e, f) of the combined matrix
    // Apply text rise to the y position
    let pdf_x = combined.e;
    let pdf_y = combined.f + state.text_rise;

    // Get effective font size after transformation
    // Use scale_y for vertical scaling (font height)
    let scale = combined.scale_y().abs().max(0.1);
    let effective_font_size = state.font_size * scale;

    let font_name = state
        .font_name
        .clone()
        .unwrap_or_else(|| "Helvetica".to_string());
    let width = calculate_text_width(text, effective_font_size, &font_name);
    let height = effective_font_size * 1.15;

    // PDF coordinates: origin at bottom-left, Y increases upward
    // Screen coordinates: origin at top-left, Y increases downward
    // pdf_y is the baseline position in PDF coords
    // The baseline is typically ~80% down from the top of the text box
    // So the top of the text box is: pdf_y + (height * 0.8) in PDF coords
    // Converting to screen: page_height - (pdf_y + ascent)
    let ascent = effective_font_size * 0.8;
    let screen_y = page_height - pdf_y - ascent;

    ExtractedText {
        text: text.to_string(),
        x: pdf_x,
        y: screen_y,
        width: width.max(1.0),
        height: height.max(1.0),
        font_name,
        font_size: effective_font_size,
        color: state.fill_color,
        transform: combined,
    }
}
