//! Print Service Module - Booklet Imposition
//!
//! Implements saddle-stitch booklet imposition with:
//! - Page ordering algorithm for correct folding sequence
//! - Transformation matrices for positioning and rotation
//! - Creep compensation for paper thickness
//! - Support for A4, A5, A3, Letter paper sizes

use crate::models::TransformMatrix;
use serde::{Deserialize, Serialize};

/// Paper dimensions in PDF points (1pt = 1/72 inch, 1mm = 2.83465pt)
const MM_TO_PT: f32 = 2.83465;

/// Standard paper sizes in points [width, height]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaperSize {
    A3,      // 297 × 420 mm
    A4,      // 210 × 297 mm
    A5,      // 148 × 210 mm
    Letter,  // 8.5 × 11 in
    Legal,   // 8.5 × 14 in
    Custom { width: f32, height: f32 },
}

impl PaperSize {
    /// Get dimensions in PDF points [width, height]
    pub fn dimensions(&self) -> (f32, f32) {
        match self {
            PaperSize::A3 => (297.0 * MM_TO_PT, 420.0 * MM_TO_PT),
            PaperSize::A4 => (210.0 * MM_TO_PT, 297.0 * MM_TO_PT),
            PaperSize::A5 => (148.0 * MM_TO_PT, 210.0 * MM_TO_PT),
            PaperSize::Letter => (612.0, 792.0),  // 8.5 × 11 in
            PaperSize::Legal => (612.0, 1008.0),  // 8.5 × 14 in
            PaperSize::Custom { width, height } => (*width, *height),
        }
    }

    /// Get landscape dimensions (swap width/height)
    pub fn landscape(&self) -> (f32, f32) {
        let (w, h) = self.dimensions();
        (h, w)
    }
}

/// Page position on sheet
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PagePosition {
    Left,
    Right,
}

/// Single page placement on a sheet
#[derive(Debug, Clone)]
pub struct PagePlacement {
    /// 1-indexed page number (0 = blank)
    pub page_num: u32,
    pub position: PagePosition,
    /// Rotation in degrees (0 or 180)
    pub rotation: u16,
}

/// Layout for one physical sheet (front and back)
#[derive(Debug, Clone)]
pub struct SheetLayout {
    pub sheet_index: usize,
    pub front: [PagePlacement; 2],  // [left, right]
    pub back: [PagePlacement; 2],   // [left, right]
}

/// Imposition configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpositionConfig {
    pub paper_size: PaperSize,
    pub final_size: PaperSize,
    /// Paper thickness in mm (default 0.1mm for 80gsm)
    pub paper_thickness_mm: f32,
    /// Apply creep compensation (recommended for 40+ pages)
    pub apply_creep: bool,
    /// Bleed in mm (default 3mm)
    pub bleed_mm: f32,
    /// Add crop marks
    pub crop_marks: bool,
    /// Add fold marks
    pub fold_marks: bool,
}

impl Default for ImpositionConfig {
    fn default() -> Self {
        Self {
            paper_size: PaperSize::A4,
            final_size: PaperSize::A5,
            paper_thickness_mm: 0.1,
            apply_creep: true,
            bleed_mm: 3.0,
            crop_marks: false,
            fold_marks: false,
        }
    }
}

/// Result of imposition calculation
#[derive(Debug, Clone)]
pub struct ImpositionResult {
    pub sheets: Vec<SheetLayout>,
    pub total_pages: u32,
    pub padded_pages: u32,
    pub total_creep_mm: f32,
}

/// Calculate page ordering for saddle-stitch booklet
///
/// For N pages (padded to multiple of 4):
/// - Sheet 0 front: [N, 1] back: [2, N-1] (rotated 180°)
/// - Sheet 1 front: [N-2, 3] back: [4, N-3] (rotated 180°)
/// - etc.
pub fn calculate_page_ordering(total_pages: u32) -> ImpositionResult {
    let padded = pad_to_multiple_of_4(total_pages);
    let sheets_count = padded / 4;
    let mut sheets = Vec::with_capacity(sheets_count as usize);

    for sheet_idx in 0..sheets_count {
        // Front side (normal orientation)
        let front_left = padded - (sheet_idx * 2);
        let front_right = 1 + (sheet_idx * 2);

        // Back side (180° rotation for duplex printing)
        let back_left = 2 + (sheet_idx * 2);
        let back_right = padded - 1 - (sheet_idx * 2);

        sheets.push(SheetLayout {
            sheet_index: sheet_idx as usize,
            front: [
                PagePlacement {
                    page_num: if front_left <= total_pages { front_left } else { 0 },
                    position: PagePosition::Left,
                    rotation: 0,
                },
                PagePlacement {
                    page_num: if front_right <= total_pages { front_right } else { 0 },
                    position: PagePosition::Right,
                    rotation: 0,
                },
            ],
            back: [
                PagePlacement {
                    page_num: if back_left <= total_pages { back_left } else { 0 },
                    position: PagePosition::Left,
                    rotation: 180,
                },
                PagePlacement {
                    page_num: if back_right <= total_pages { back_right } else { 0 },
                    position: PagePosition::Right,
                    rotation: 180,
                },
            ],
        });
    }

    ImpositionResult {
        sheets,
        total_pages,
        padded_pages: padded,
        total_creep_mm: 0.0,
    }
}

/// Pad page count to multiple of 4
#[inline]
pub fn pad_to_multiple_of_4(pages: u32) -> u32 {
    ((pages + 3) / 4) * 4
}

/// Calculate creep compensation for booklet
///
/// Creep = paper thickness accumulation causing inner pages to protrude
/// Total creep = (sheets - 1) × paper_thickness
/// Applied progressively: outer sheet = 0, inner sheets get more offset
pub fn calculate_creep(sheets_count: u32, paper_thickness_mm: f32) -> CreepData {
    if sheets_count <= 1 {
        return CreepData {
            total_creep_mm: 0.0,
            creep_per_sheet_mm: 0.0,
            sheet_offsets_mm: vec![0.0],
        };
    }

    let total_creep = (sheets_count - 1) as f32 * paper_thickness_mm;
    let creep_increment = total_creep / (sheets_count - 1) as f32;

    let offsets: Vec<f32> = (0..sheets_count)
        .map(|i| i as f32 * creep_increment)
        .collect();

    CreepData {
        total_creep_mm: total_creep,
        creep_per_sheet_mm: creep_increment,
        sheet_offsets_mm: offsets,
    }
}

/// Creep calculation result
#[derive(Debug, Clone)]
pub struct CreepData {
    pub total_creep_mm: f32,
    pub creep_per_sheet_mm: f32,
    /// Offset for each sheet (index 0 = outermost)
    pub sheet_offsets_mm: Vec<f32>,
}

/// Generate transformation matrix for page placement
///
/// PDF transformation matrix: [a b c d e f]
/// - Identity: [1 0 0 1 0 0]
/// - Translate: [1 0 0 1 tx ty]
/// - Scale: [sx 0 0 sy 0 0]
/// - Rotate 180°: [-1 0 0 -1 cx cy] (rotate around center)
pub fn generate_page_transform(
    position: PagePosition,
    rotation: u16,
    sheet_width: f32,
    sheet_height: f32,
    page_width: f32,
    page_height: f32,
    creep_offset_pt: f32,
) -> TransformMatrix {
    let half_width = sheet_width / 2.0;

    // Calculate scale to fit page into half-sheet
    let scale_x = half_width / page_width;
    let scale_y = sheet_height / page_height;
    let scale = scale_x.min(scale_y);

    // Base position
    let base_x = match position {
        PagePosition::Left => creep_offset_pt,
        PagePosition::Right => half_width + creep_offset_pt,
    };

    if rotation == 180 {
        // Rotate 180° around page center
        // Matrix: scale, then rotate, then translate
        TransformMatrix {
            a: -scale,
            b: 0.0,
            c: 0.0,
            d: -scale,
            e: base_x + (page_width * scale),
            f: sheet_height,
        }
    } else {
        // No rotation, just scale and translate
        TransformMatrix {
            a: scale,
            b: 0.0,
            c: 0.0,
            d: scale,
            e: base_x,
            f: 0.0,
        }
    }
}

/// Full imposition with creep compensation
pub fn impose_booklet(total_pages: u32, config: &ImpositionConfig) -> ImpositionResult {
    let mut result = calculate_page_ordering(total_pages);
    let sheets_count = result.sheets.len() as u32;

    if config.apply_creep && sheets_count > 1 {
        let creep = calculate_creep(sheets_count, config.paper_thickness_mm);
        result.total_creep_mm = creep.total_creep_mm;
    }

    result
}

/// Tauri command: Calculate booklet imposition
#[tauri::command]
pub fn calculate_booklet_imposition(
    total_pages: u32,
    config: Option<ImpositionConfig>,
) -> Result<BookletImpositionResponse, String> {
    if total_pages == 0 {
        return Err("Page count must be greater than 0".to_string());
    }

    let cfg = config.unwrap_or_default();
    let result = impose_booklet(total_pages, &cfg);
    let sheets_count = result.sheets.len() as u32;

    let creep = if cfg.apply_creep && sheets_count > 1 {
        Some(calculate_creep(sheets_count, cfg.paper_thickness_mm))
    } else {
        None
    };

    let sheet_layouts: Vec<SheetLayoutResponse> = result
        .sheets
        .iter()
        .enumerate()
        .map(|(idx, sheet)| {
            let creep_offset = creep
                .as_ref()
                .map(|c| c.sheet_offsets_mm.get(idx).copied().unwrap_or(0.0))
                .unwrap_or(0.0);

            SheetLayoutResponse {
                sheet_index: idx,
                front_left: sheet.front[0].page_num,
                front_right: sheet.front[1].page_num,
                back_left: sheet.back[0].page_num,
                back_right: sheet.back[1].page_num,
                creep_offset_mm: creep_offset,
            }
        })
        .collect();

    Ok(BookletImpositionResponse {
        total_pages,
        padded_pages: result.padded_pages,
        sheets_count,
        total_creep_mm: result.total_creep_mm,
        sheets: sheet_layouts,
    })
}

/// Response for booklet imposition calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookletImpositionResponse {
    pub total_pages: u32,
    pub padded_pages: u32,
    pub sheets_count: u32,
    pub total_creep_mm: f32,
    pub sheets: Vec<SheetLayoutResponse>,
}

/// Sheet layout in response format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetLayoutResponse {
    pub sheet_index: usize,
    pub front_left: u32,
    pub front_right: u32,
    pub back_left: u32,
    pub back_right: u32,
    pub creep_offset_mm: f32,
}

/// Tauri command: Get paper size dimensions
#[tauri::command]
pub fn get_paper_dimensions(paper_size: PaperSize, landscape: bool) -> (f32, f32) {
    if landscape {
        paper_size.landscape()
    } else {
        paper_size.dimensions()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== Paper Size Tests ====================

    #[test]
    fn test_a4_dimensions() {
        let (w, h) = PaperSize::A4.dimensions();
        // A4 = 210 × 297 mm = 595.28 × 841.89 pt
        assert!((w - 595.28).abs() < 0.1);
        assert!((h - 841.89).abs() < 0.1);
    }

    #[test]
    fn test_a5_dimensions() {
        let (w, h) = PaperSize::A5.dimensions();
        // A5 = 148 × 210 mm = 419.53 × 595.28 pt
        assert!((w - 419.53).abs() < 0.1);
        assert!((h - 595.28).abs() < 0.1);
    }

    #[test]
    fn test_a3_dimensions() {
        let (w, h) = PaperSize::A3.dimensions();
        // A3 = 297 × 420 mm = 841.89 × 1190.55 pt
        assert!((w - 841.89).abs() < 0.1);
        assert!((h - 1190.55).abs() < 0.1);
    }

    #[test]
    fn test_letter_dimensions() {
        let (w, h) = PaperSize::Letter.dimensions();
        assert_eq!(w, 612.0);
        assert_eq!(h, 792.0);
    }

    #[test]
    fn test_landscape_swap() {
        let (w, h) = PaperSize::A4.landscape();
        let (pw, ph) = PaperSize::A4.dimensions();
        assert_eq!(w, ph);
        assert_eq!(h, pw);
    }

    // ==================== Page Padding Tests ====================

    #[test]
    fn test_pad_to_multiple_of_4() {
        assert_eq!(pad_to_multiple_of_4(1), 4);
        assert_eq!(pad_to_multiple_of_4(4), 4);
        assert_eq!(pad_to_multiple_of_4(5), 8);
        assert_eq!(pad_to_multiple_of_4(8), 8);
        assert_eq!(pad_to_multiple_of_4(9), 12);
        assert_eq!(pad_to_multiple_of_4(16), 16);
        assert_eq!(pad_to_multiple_of_4(17), 20);
    }

    // ==================== Page Ordering Tests ====================

    #[test]
    fn test_8_page_booklet_ordering() {
        // 8 pages = 2 sheets
        // Sheet 0 front: [8, 1], back: [2, 7]
        // Sheet 1 front: [6, 3], back: [4, 5]
        let result = calculate_page_ordering(8);

        assert_eq!(result.total_pages, 8);
        assert_eq!(result.padded_pages, 8);
        assert_eq!(result.sheets.len(), 2);

        // Sheet 0
        assert_eq!(result.sheets[0].front[0].page_num, 8); // left
        assert_eq!(result.sheets[0].front[1].page_num, 1); // right
        assert_eq!(result.sheets[0].back[0].page_num, 2);  // left (rotated)
        assert_eq!(result.sheets[0].back[1].page_num, 7);  // right (rotated)

        // Sheet 1
        assert_eq!(result.sheets[1].front[0].page_num, 6);
        assert_eq!(result.sheets[1].front[1].page_num, 3);
        assert_eq!(result.sheets[1].back[0].page_num, 4);
        assert_eq!(result.sheets[1].back[1].page_num, 5);
    }

    #[test]
    fn test_16_page_booklet_ordering() {
        // 16 pages = 4 sheets
        let result = calculate_page_ordering(16);

        assert_eq!(result.sheets.len(), 4);

        // Sheet 0 (outer): front [16, 1], back [2, 15]
        assert_eq!(result.sheets[0].front[0].page_num, 16);
        assert_eq!(result.sheets[0].front[1].page_num, 1);
        assert_eq!(result.sheets[0].back[0].page_num, 2);
        assert_eq!(result.sheets[0].back[1].page_num, 15);

        // Sheet 1: front [14, 3], back [4, 13]
        assert_eq!(result.sheets[1].front[0].page_num, 14);
        assert_eq!(result.sheets[1].front[1].page_num, 3);
        assert_eq!(result.sheets[1].back[0].page_num, 4);
        assert_eq!(result.sheets[1].back[1].page_num, 13);

        // Sheet 2: front [12, 5], back [6, 11]
        assert_eq!(result.sheets[2].front[0].page_num, 12);
        assert_eq!(result.sheets[2].front[1].page_num, 5);
        assert_eq!(result.sheets[2].back[0].page_num, 6);
        assert_eq!(result.sheets[2].back[1].page_num, 11);

        // Sheet 3 (inner): front [10, 7], back [8, 9]
        assert_eq!(result.sheets[3].front[0].page_num, 10);
        assert_eq!(result.sheets[3].front[1].page_num, 7);
        assert_eq!(result.sheets[3].back[0].page_num, 8);
        assert_eq!(result.sheets[3].back[1].page_num, 9);
    }

    #[test]
    fn test_4_page_booklet_single_sheet() {
        let result = calculate_page_ordering(4);

        assert_eq!(result.sheets.len(), 1);
        assert_eq!(result.sheets[0].front[0].page_num, 4);
        assert_eq!(result.sheets[0].front[1].page_num, 1);
        assert_eq!(result.sheets[0].back[0].page_num, 2);
        assert_eq!(result.sheets[0].back[1].page_num, 3);
    }

    #[test]
    fn test_odd_page_count_padding() {
        // 5 pages should pad to 8, with blanks for pages 6, 7, 8
        let result = calculate_page_ordering(5);

        assert_eq!(result.total_pages, 5);
        assert_eq!(result.padded_pages, 8);
        assert_eq!(result.sheets.len(), 2);

        // Sheet 0: front [8(blank), 1], back [2, 7(blank)]
        assert_eq!(result.sheets[0].front[0].page_num, 0); // blank (8 > 5)
        assert_eq!(result.sheets[0].front[1].page_num, 1);
        assert_eq!(result.sheets[0].back[0].page_num, 2);
        assert_eq!(result.sheets[0].back[1].page_num, 0); // blank (7 > 5)

        // Sheet 1: front [6(blank), 3], back [4, 5]
        assert_eq!(result.sheets[1].front[0].page_num, 0); // blank (6 > 5)
        assert_eq!(result.sheets[1].front[1].page_num, 3);
        assert_eq!(result.sheets[1].back[0].page_num, 4);
        assert_eq!(result.sheets[1].back[1].page_num, 5);
    }

    // ==================== Creep Calculation Tests ====================

    #[test]
    fn test_creep_single_sheet() {
        let creep = calculate_creep(1, 0.1);
        assert_eq!(creep.total_creep_mm, 0.0);
        assert_eq!(creep.sheet_offsets_mm.len(), 1);
        assert_eq!(creep.sheet_offsets_mm[0], 0.0);
    }

    #[test]
    fn test_creep_8_sheets() {
        // 32 pages = 8 sheets
        // Total creep = (8-1) × 0.1 = 0.7mm
        let creep = calculate_creep(8, 0.1);

        assert!((creep.total_creep_mm - 0.7).abs() < 0.001);
        assert!((creep.creep_per_sheet_mm - 0.1).abs() < 0.001);
        assert_eq!(creep.sheet_offsets_mm.len(), 8);

        // Outer sheet = 0, inner sheets progressively more
        assert!((creep.sheet_offsets_mm[0] - 0.0).abs() < 0.001);
        assert!((creep.sheet_offsets_mm[1] - 0.1).abs() < 0.001);
        assert!((creep.sheet_offsets_mm[7] - 0.7).abs() < 0.001);
    }

    #[test]
    fn test_creep_16_page_booklet() {
        // 16 pages = 4 sheets
        // Total creep = (4-1) × 0.1 = 0.3mm
        let creep = calculate_creep(4, 0.1);

        assert!((creep.total_creep_mm - 0.3).abs() < 0.001);
        assert_eq!(creep.sheet_offsets_mm.len(), 4);
        assert!((creep.sheet_offsets_mm[0] - 0.0).abs() < 0.001);
        assert!((creep.sheet_offsets_mm[3] - 0.3).abs() < 0.001);
    }

    #[test]
    fn test_creep_thicker_paper() {
        // 80gsm ≈ 0.1mm, 120gsm ≈ 0.15mm
        let creep = calculate_creep(4, 0.15);
        assert!((creep.total_creep_mm - 0.45).abs() < 0.001);
    }

    // ==================== Transformation Matrix Tests ====================

    #[test]
    fn test_transform_no_rotation() {
        let transform = generate_page_transform(
            PagePosition::Left,
            0,
            841.89,  // A3 width
            595.28,  // A3 height (landscape)
            419.53,  // A5 width
            595.28,  // A5 height
            0.0,
        );

        // Scale should fit A5 into half of A3
        let expected_scale = (841.89 / 2.0) / 419.53;
        assert!((transform.a - expected_scale).abs() < 0.01);
        assert!((transform.d - expected_scale).abs() < 0.01);
        assert_eq!(transform.b, 0.0);
        assert_eq!(transform.c, 0.0);
    }

    #[test]
    fn test_transform_180_rotation() {
        let transform = generate_page_transform(
            PagePosition::Left,
            180,
            841.89,
            595.28,
            419.53,
            595.28,
            0.0,
        );

        // Rotation 180° means negative scale
        assert!(transform.a < 0.0);
        assert!(transform.d < 0.0);
    }

    #[test]
    fn test_transform_right_position() {
        let sheet_width = 841.89;
        let transform = generate_page_transform(
            PagePosition::Right,
            0,
            sheet_width,
            595.28,
            419.53,
            595.28,
            0.0,
        );

        // Right position should start at half width
        assert!(transform.e >= sheet_width / 2.0);
    }

    #[test]
    fn test_transform_with_creep() {
        let creep_pt = 5.0;
        let transform_left = generate_page_transform(
            PagePosition::Left,
            0,
            841.89,
            595.28,
            419.53,
            595.28,
            creep_pt,
        );

        // Creep should offset the position
        assert!((transform_left.e - creep_pt).abs() < 0.01);
    }

    // ==================== Integration Tests ====================

    #[test]
    fn test_full_imposition_a5_booklet_on_a4() {
        let config = ImpositionConfig {
            paper_size: PaperSize::A4,
            final_size: PaperSize::A5,
            paper_thickness_mm: 0.1,
            apply_creep: true,
            ..Default::default()
        };

        let result = impose_booklet(16, &config);

        assert_eq!(result.sheets.len(), 4);
        assert_eq!(result.padded_pages, 16);
    }

    #[test]
    fn test_tauri_command_response() {
        let response = calculate_booklet_imposition(16, None).unwrap();

        assert_eq!(response.total_pages, 16);
        assert_eq!(response.padded_pages, 16);
        assert_eq!(response.sheets_count, 4);
        assert_eq!(response.sheets.len(), 4);

        // Verify first sheet
        assert_eq!(response.sheets[0].front_left, 16);
        assert_eq!(response.sheets[0].front_right, 1);
        assert_eq!(response.sheets[0].back_left, 2);
        assert_eq!(response.sheets[0].back_right, 15);
    }

    #[test]
    fn test_tauri_command_with_config() {
        let config = ImpositionConfig {
            paper_thickness_mm: 0.15,
            apply_creep: true,
            ..Default::default()
        };

        let response = calculate_booklet_imposition(32, Some(config)).unwrap();

        assert_eq!(response.sheets_count, 8);
        // Total creep = (8-1) × 0.15 = 1.05mm
        assert!((response.total_creep_mm - 1.05).abs() < 0.01);
    }

    #[test]
    fn test_tauri_command_zero_pages_error() {
        let result = calculate_booklet_imposition(0, None);
        assert!(result.is_err());
    }

    // ==================== Edge Cases ====================

    #[test]
    fn test_large_booklet_64_pages() {
        let result = calculate_page_ordering(64);

        assert_eq!(result.sheets.len(), 16);

        // First sheet: [64, 1] / [2, 63]
        assert_eq!(result.sheets[0].front[0].page_num, 64);
        assert_eq!(result.sheets[0].front[1].page_num, 1);

        // Last sheet (center): [34, 31] / [32, 33]
        assert_eq!(result.sheets[15].front[0].page_num, 34);
        assert_eq!(result.sheets[15].front[1].page_num, 31);
        assert_eq!(result.sheets[15].back[0].page_num, 32);
        assert_eq!(result.sheets[15].back[1].page_num, 33);
    }

    #[test]
    fn test_rotation_values() {
        let result = calculate_page_ordering(8);

        // Front pages should have 0 rotation
        assert_eq!(result.sheets[0].front[0].rotation, 0);
        assert_eq!(result.sheets[0].front[1].rotation, 0);

        // Back pages should have 180 rotation
        assert_eq!(result.sheets[0].back[0].rotation, 180);
        assert_eq!(result.sheets[0].back[1].rotation, 180);
    }

    #[test]
    fn test_page_positions() {
        let result = calculate_page_ordering(4);

        assert_eq!(result.sheets[0].front[0].position, PagePosition::Left);
        assert_eq!(result.sheets[0].front[1].position, PagePosition::Right);
        assert_eq!(result.sheets[0].back[0].position, PagePosition::Left);
        assert_eq!(result.sheets[0].back[1].position, PagePosition::Right);
    }
}
