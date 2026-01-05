//! OCR Handler Module - Enhanced
//! Provides text verification and recovery using Tesseract OCR with word-level detection

use crate::models::{Bounds, LayerObject, LayerType, SourceType, LayerRole, TextAlign};
use image::{GrayImage, RgbaImage, DynamicImage, imageops};
use pdfium_render::prelude::PdfRenderConfig;
use std::sync::atomic::{AtomicUsize, Ordering};

static OCR_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// OCR result for a text region with word-level data
#[derive(Debug, Clone)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
    pub bounds: Bounds,
    pub words: Vec<OcrWord>,
}

/// Individual word detected by OCR
#[derive(Debug, Clone)]
pub struct OcrWord {
    pub text: String,
    pub confidence: f32,
    pub bounds: Bounds,
}

/// OCR configuration options
#[derive(Debug, Clone)]
pub struct OcrConfig {
    pub language: String,
    pub min_confidence: f32,
    pub preprocess: bool,
    pub deskew: bool,
    pub psm: i32, // Page segmentation mode
}

impl Default for OcrConfig {
    fn default() -> Self {
        Self {
            language: "eng".to_string(),
            min_confidence: 0.5,
            preprocess: true,
            deskew: false,
            psm: 3, // Fully automatic page segmentation
        }
    }
}

/// OCR engine wrapper with enhanced capabilities
pub struct OcrEngine {
    config: OcrConfig,
    #[allow(dead_code)]
    initialized: bool,
}

impl OcrEngine {
    pub fn new() -> Self {
        Self {
            config: OcrConfig::default(),
            initialized: false,
        }
    }

    pub fn with_config(config: OcrConfig) -> Self {
        Self {
            config,
            initialized: false,
        }
    }

    /// Preprocess image for better OCR results
    fn preprocess_image(&self, image: &GrayImage) -> GrayImage {
        let mut processed = image.clone();

        // Apply adaptive thresholding for better text contrast
        let threshold = calculate_otsu_threshold(&processed);
        for pixel in processed.pixels_mut() {
            pixel.0[0] = if pixel.0[0] > threshold { 255 } else { 0 };
        }

        // Optional: Apply slight blur to reduce noise
        if self.config.preprocess {
            processed = imageops::blur(&processed, 0.5);
        }

        processed
    }

    /// Perform OCR on an image region with word-level detection
    pub fn recognize_region(
        &mut self,
        image: &RgbaImage,
        region: &Bounds,
    ) -> Result<OcrResult, String> {
        // Crop region from image
        let x = region.x.max(0.0) as u32;
        let y = region.y.max(0.0) as u32;
        let w = (region.width as u32).min(image.width().saturating_sub(x)).max(1);
        let h = (region.height as u32).min(image.height().saturating_sub(y)).max(1);

        if w < 2 || h < 2 {
            return Err("Region too small for OCR".to_string());
        }

        let cropped = imageops::crop_imm(image, x, y, w, h).to_image();
        let gray = DynamicImage::ImageRgba8(cropped).to_luma8();
        let processed = self.preprocess_image(&gray);

        // Perform OCR
        match perform_tesseract_ocr_enhanced(&processed, &self.config) {
            Ok((text, confidence, words)) => Ok(OcrResult {
                text,
                confidence,
                bounds: region.clone(),
                words,
            }),
            Err(e) => Err(format!("OCR failed: {}", e)),
        }
    }

    /// Perform full-page OCR and return detected text layers
    pub fn recognize_page(
        &mut self,
        image: &RgbaImage,
        page_index: usize,
        scale: f32,
    ) -> Result<Vec<LayerObject>, String> {
        let gray = DynamicImage::ImageRgba8(image.clone()).to_luma8();
        let processed = self.preprocess_image(&gray);

        let (_, _, words) = perform_tesseract_ocr_enhanced(&processed, &self.config)?;

        let mut layers = Vec::new();
        let mut current_line: Vec<OcrWord> = Vec::new();
        let mut last_y: Option<f32> = None;
        let line_threshold = 10.0 * scale;

        // Group words into lines
        for word in words {
            if word.confidence < self.config.min_confidence {
                continue;
            }

            let word_y = word.bounds.y;
            
            if let Some(ly) = last_y {
                if (word_y - ly).abs() > line_threshold && !current_line.is_empty() {
                    // New line detected, create layer from current line
                    if let Some(layer) = create_line_layer(&current_line, page_index, scale) {
                        layers.push(layer);
                    }
                    current_line.clear();
                }
            }

            current_line.push(word.clone());
            last_y = Some(word_y);
        }

        // Don't forget the last line
        if !current_line.is_empty() {
            if let Some(layer) = create_line_layer(&current_line, page_index, scale) {
                layers.push(layer);
            }
        }

        Ok(layers)
    }

    /// Verify extracted text against OCR
    pub fn verify_text(
        &mut self,
        image: &RgbaImage,
        layer: &LayerObject,
    ) -> Result<TextVerification, String> {
        if layer.layer_type != LayerType::Text {
            return Err("Layer is not a text layer".to_string());
        }

        let extracted_text = layer.content.as_deref().unwrap_or("");
        let ocr_result = self.recognize_region(image, &layer.bounds)?;

        let similarity = calculate_similarity(extracted_text, &ocr_result.text);

        Ok(TextVerification {
            extracted_text: extracted_text.to_string(),
            ocr_text: ocr_result.text,
            ocr_confidence: ocr_result.confidence,
            similarity,
            needs_correction: similarity < 0.8 && ocr_result.confidence > 0.7,
            word_matches: compare_words(extracted_text, &ocr_result.words),
        })
    }
}

impl Default for OcrEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Text verification result with word-level comparison
#[derive(Debug, Clone)]
pub struct TextVerification {
    pub extracted_text: String,
    pub ocr_text: String,
    pub ocr_confidence: f32,
    pub similarity: f32,
    pub needs_correction: bool,
    pub word_matches: Vec<WordMatch>,
}

/// Word-level match result
#[derive(Debug, Clone)]
pub struct WordMatch {
    pub extracted: String,
    pub ocr: String,
    pub similarity: f32,
    pub is_match: bool,
}

/// Create a text layer from a line of OCR words
fn create_line_layer(words: &[OcrWord], page_index: usize, scale: f32) -> Option<LayerObject> {
    if words.is_empty() {
        return None;
    }

    let text: String = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
    if text.trim().is_empty() {
        return None;
    }

    // Calculate combined bounds
    let min_x = words.iter().map(|w| w.bounds.x).fold(f32::INFINITY, f32::min);
    let min_y = words.iter().map(|w| w.bounds.y).fold(f32::INFINITY, f32::min);
    let max_x = words.iter().map(|w| w.bounds.x + w.bounds.width).fold(0.0f32, f32::max);
    let max_y = words.iter().map(|w| w.bounds.y + w.bounds.height).fold(0.0f32, f32::max);

    let _avg_confidence: f32 = words.iter().map(|w| w.confidence).sum::<f32>() / words.len() as f32;
    let avg_height = words.iter().map(|w| w.bounds.height).sum::<f32>() / words.len() as f32;

    let idx = OCR_COUNTER.fetch_add(1, Ordering::SeqCst);

    Some(LayerObject {
        id: format!("ocr-{}-{}", page_index, idx),
        layer_type: LayerType::Text,
        bounds: Bounds::new(
            min_x / scale,
            min_y / scale,
            (max_x - min_x) / scale,
            (max_y - min_y) / scale,
        ),
        visible: true,
        locked: false,
        z_index: idx as i32,
        opacity: 1.0,
        content: Some(text),
        font_family: Some("Arial".to_string()),
        font_size: Some((avg_height / scale).max(8.0).min(72.0)),
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
    })
}

/// Perform OCR using Tesseract with word-level detection
fn perform_tesseract_ocr_enhanced(
    image: &GrayImage,
    config: &OcrConfig,
) -> Result<(String, f32, Vec<OcrWord>), String> {
    let width = image.width() as i32;
    let height = image.height() as i32;
    let bytes_per_pixel = 1;
    let bytes_per_line = width * bytes_per_pixel;

    #[cfg(feature = "ocr")]
    {
        use tesseract::Tesseract;

        let mut tess = Tesseract::new(None, Some(&config.language))
            .map_err(|e| format!("Tesseract init failed: {}", e))?;

        // Set page segmentation mode
        tess = tess
            .set_variable("tessedit_pageseg_mode", &config.psm.to_string())
            .map_err(|e| format!("Set PSM failed: {}", e))?;

        tess = tess
            .set_image_from_mem(image.as_raw(), width, height, bytes_per_pixel, bytes_per_line)
            .map_err(|e| format!("Set image failed: {}", e))?;

        let text = tess
            .get_text()
            .map_err(|e| format!("Get text failed: {}", e))?;

        let confidence = tess
            .mean_text_conf()
            .map(|c| c as f32 / 100.0)
            .unwrap_or(0.5);

        // Get word-level bounding boxes
        let mut words = Vec::new();
        if let Ok(boxes) = tess.get_hocr_text(0) {
            words = parse_hocr_words(&boxes);
        }

        Ok((text.trim().to_string(), confidence, words))
    }

    #[cfg(not(feature = "ocr"))]
    {
        // Fallback when OCR is not available
        let _ = (width, height, bytes_per_pixel, bytes_per_line, config);
        Ok((String::new(), 0.0, Vec::new()))
    }
}

/// Parse hOCR output to extract word-level bounding boxes
#[cfg(feature = "ocr")]
fn parse_hocr_words(hocr: &str) -> Vec<OcrWord> {
    let mut words = Vec::new();
    
    // Simple regex-free parsing for word spans
    for line in hocr.lines() {
        if line.contains("ocrx_word") {
            // Extract bbox: title='bbox x1 y1 x2 y2; x_wconf conf'
            if let Some(bbox_start) = line.find("bbox ") {
                let bbox_str = &line[bbox_start + 5..];
                if let Some(bbox_end) = bbox_str.find(';').or_else(|| bbox_str.find('\'')) {
                    let coords: Vec<f32> = bbox_str[..bbox_end]
                        .split_whitespace()
                        .filter_map(|s| s.parse().ok())
                        .collect();
                    
                    if coords.len() >= 4 {
                        // Extract confidence
                        let conf = if let Some(conf_start) = line.find("x_wconf ") {
                            let conf_str = &line[conf_start + 8..];
                            conf_str.split(|c: char| !c.is_numeric())
                                .next()
                                .and_then(|s| s.parse::<f32>().ok())
                                .map(|c| c / 100.0)
                                .unwrap_or(0.5)
                        } else {
                            0.5
                        };

                        // Extract text content
                        if let Some(text_start) = line.find('>') {
                            if let Some(text_end) = line[text_start..].find("</") {
                                let text = &line[text_start + 1..text_start + text_end];
                                if !text.trim().is_empty() {
                                    words.push(OcrWord {
                                        text: html_decode(text),
                                        confidence: conf,
                                        bounds: Bounds::new(
                                            coords[0],
                                            coords[1],
                                            coords[2] - coords[0],
                                            coords[3] - coords[1],
                                        ),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    words
}

#[cfg(not(feature = "ocr"))]
#[allow(dead_code)]
fn parse_hocr_words(_hocr: &str) -> Vec<OcrWord> {
    Vec::new()
}

/// Decode HTML entities
#[allow(dead_code)]
fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

/// Calculate Otsu's threshold for binarization
fn calculate_otsu_threshold(image: &GrayImage) -> u8 {
    let mut histogram = [0u32; 256];
    for pixel in image.pixels() {
        histogram[pixel.0[0] as usize] += 1;
    }

    let total = image.width() * image.height();
    let mut sum = 0u64;
    for (i, &count) in histogram.iter().enumerate() {
        sum += i as u64 * count as u64;
    }

    let mut sum_b = 0u64;
    let mut w_b = 0u32;
    let mut max_variance = 0.0f64;
    let mut threshold = 0u8;

    for (i, &count) in histogram.iter().enumerate() {
        w_b += count;
        if w_b == 0 {
            continue;
        }

        let w_f = total - w_b;
        if w_f == 0 {
            break;
        }

        sum_b += i as u64 * count as u64;
        let m_b = sum_b as f64 / w_b as f64;
        let m_f = (sum - sum_b) as f64 / w_f as f64;

        let variance = w_b as f64 * w_f as f64 * (m_b - m_f).powi(2);
        if variance > max_variance {
            max_variance = variance;
            threshold = i as u8;
        }
    }

    threshold
}

/// Compare words between extracted and OCR text
fn compare_words(extracted: &str, ocr_words: &[OcrWord]) -> Vec<WordMatch> {
    let extracted_words: Vec<&str> = extracted.split_whitespace().collect();
    let ocr_texts: Vec<&str> = ocr_words.iter().map(|w| w.text.as_str()).collect();

    let mut matches = Vec::new();
    let max_len = extracted_words.len().max(ocr_texts.len());

    for i in 0..max_len {
        let ext = extracted_words.get(i).copied().unwrap_or("");
        let ocr = ocr_texts.get(i).copied().unwrap_or("");
        let sim = calculate_similarity(ext, ocr);

        matches.push(WordMatch {
            extracted: ext.to_string(),
            ocr: ocr.to_string(),
            similarity: sim,
            is_match: sim > 0.8,
        });
    }

    matches
}

/// Calculate text similarity using Levenshtein distance
fn calculate_similarity(s1: &str, s2: &str) -> f32 {
    if s1.is_empty() && s2.is_empty() {
        return 1.0;
    }
    if s1.is_empty() || s2.is_empty() {
        return 0.0;
    }

    let s1_lower = s1.to_lowercase();
    let s2_lower = s2.to_lowercase();

    let distance = levenshtein_distance(&s1_lower, &s2_lower);
    let max_len = s1_lower.len().max(s2_lower.len());

    1.0 - (distance as f32 / max_len as f32)
}

/// Levenshtein distance calculation
fn levenshtein_distance(s1: &str, s2: &str) -> usize {
    let s1_chars: Vec<char> = s1.chars().collect();
    let s2_chars: Vec<char> = s2.chars().collect();
    let m = s1_chars.len();
    let n = s2_chars.len();

    if m == 0 { return n; }
    if n == 0 { return m; }

    let mut prev_row: Vec<usize> = (0..=n).collect();
    let mut curr_row: Vec<usize> = vec![0; n + 1];

    for i in 1..=m {
        curr_row[0] = i;
        for j in 1..=n {
            let cost = if s1_chars[i - 1] == s2_chars[j - 1] { 0 } else { 1 };
            curr_row[j] = (prev_row[j] + 1)
                .min(curr_row[j - 1] + 1)
                .min(prev_row[j - 1] + cost);
        }
        std::mem::swap(&mut prev_row, &mut curr_row);
    }

    prev_row[n]
}

/// Render page to image for OCR verification
pub fn render_page_for_ocr(
    page: &pdfium_render::prelude::PdfPage,
    scale: f32,
) -> Result<RgbaImage, String> {
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

/// Verify all text layers on a page using OCR
pub fn verify_page_text(
    page: &pdfium_render::prelude::PdfPage,
    layers: &[LayerObject],
    scale: f32,
) -> Result<Vec<TextVerification>, String> {
    let image = render_page_for_ocr(page, scale)?;
    let mut engine = OcrEngine::new();
    let mut results = Vec::new();

    for layer in layers {
        if layer.layer_type == LayerType::Text {
            let scaled_bounds = Bounds::new(
                layer.bounds.x * scale,
                layer.bounds.y * scale,
                layer.bounds.width * scale,
                layer.bounds.height * scale,
            );

            let mut scaled_layer = layer.clone();
            scaled_layer.bounds = scaled_bounds;

            match engine.verify_text(&image, &scaled_layer) {
                Ok(verification) => results.push(verification),
                Err(e) => eprintln!("OCR verification failed for {}: {}", layer.id, e),
            }
        }
    }

    Ok(results)
}

/// Correct text layer using OCR result
pub fn correct_text_with_ocr(layer: &mut LayerObject, verification: &TextVerification) {
    if verification.needs_correction && verification.ocr_confidence > 0.8 {
        layer.content = Some(verification.ocr_text.clone());
    }
}

/// Reset OCR counter (call at start of each import)
pub fn reset_ocr_counter() {
    OCR_COUNTER.store(0, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_similarity_identical() {
        assert!((calculate_similarity("hello", "hello") - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_similarity_different() {
        let sim = calculate_similarity("hello", "world");
        assert!(sim < 0.5);
    }

    #[test]
    fn test_similarity_similar() {
        let sim = calculate_similarity("hello", "hallo");
        assert!(sim > 0.7);
    }

    #[test]
    fn test_levenshtein() {
        assert_eq!(levenshtein_distance("kitten", "sitting"), 3);
        assert_eq!(levenshtein_distance("", "abc"), 3);
        assert_eq!(levenshtein_distance("abc", "abc"), 0);
    }

    #[test]
    fn test_otsu_threshold() {
        // Create a gradient image with values from 50-200 for realistic threshold
        let img = GrayImage::from_raw(4, 4, vec![
            50, 80, 120, 150,
            60, 90, 130, 160,
            70, 100, 140, 180,
            80, 110, 150, 200,
        ]).unwrap();
        let threshold = calculate_otsu_threshold(&img);
        assert!(threshold >= 50 && threshold <= 200);
    }

    #[test]
    fn test_html_decode() {
        assert_eq!(html_decode("&amp;"), "&");
        assert_eq!(html_decode("&lt;test&gt;"), "<test>");
    }
}
