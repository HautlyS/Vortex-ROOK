//! PDF Content Stream Parser
//! Parses PDF operators for exact element positioning
//!
//! ## Optimizations
//! - Pre-allocated vectors with capacity hints
//! - Inline hints for hot paths
//! - Efficient state stack management

#![allow(non_snake_case)]

use crate::graphics_state::{cmyk_to_rgb, normalize_font_name, rgba_to_hex, GraphicsState};
use crate::models::{
    Bounds, LayerObject, LayerRole, LayerType, PathCommand, PathData, SourceType, TextAlign,
    TransformMatrix,
};
use crate::path_ops::{transform_path, ExtractedPath};
use crate::text_ops::{create_text, ExtractedText};
use lopdf::{content::Content, Document, Object, ObjectId};

/// Initial capacity for path commands (most paths have < 32 commands)
const PATH_CAPACITY: usize = 32;

/// Initial capacity for state stack (rarely exceeds 8 levels)
const STATE_STACK_CAPACITY: usize = 8;

/// Parse content stream and extract all elements
#[inline]
pub fn parse_page_content(
    doc: &Document,
    page_id: ObjectId,
    page_height: f32,
) -> Result<(Vec<ExtractedText>, Vec<ExtractedPath>), String> {
    let content_data = doc
        .get_page_content(page_id)
        .map_err(|e| format!("Failed to get page content: {}", e))?;

    let content = Content::decode(&content_data)
        .map_err(|e| format!("Failed to decode content: {}", e))?;

    let mut ctx = ParseContext::new(page_height);

    for op in &content.operations {
        ctx.process_operator(&op.operator, &op.operands);
    }

    Ok((ctx.texts, ctx.paths))
}

/// Parsing context holding state and results
struct ParseContext {
    texts: Vec<ExtractedText>,
    paths: Vec<ExtractedPath>,
    state_stack: Vec<GraphicsState>,
    current_path: Vec<PathCommand>,
    path_start: (f32, f32),
    current_point: (f32, f32),
    page_height: f32,
}

impl ParseContext {
    #[inline]
    fn new(page_height: f32) -> Self {
        let mut state_stack = Vec::with_capacity(STATE_STACK_CAPACITY);
        state_stack.push(GraphicsState::default());
        
        Self {
            texts: Vec::with_capacity(64),
            paths: Vec::with_capacity(32),
            state_stack,
            current_path: Vec::with_capacity(PATH_CAPACITY),
            path_start: (0.0, 0.0),
            current_point: (0.0, 0.0),
            page_height,
        }
    }

    #[inline]
    fn state(&self) -> &GraphicsState {
        // SAFETY: state_stack always has at least one element
        self.state_stack.last().unwrap()
    }

    #[inline]
    fn state_mut(&mut self) -> &mut GraphicsState {
        // SAFETY: state_stack always has at least one element
        self.state_stack.last_mut().unwrap()
    }

    fn process_operator(&mut self, op: &str, operands: &[Object]) {
        match op {
            // Graphics state
            "q" => self.state_stack.push(self.state().clone()),
            "Q" => { if self.state_stack.len() > 1 { self.state_stack.pop(); } }
            "cm" => self.op_cm(operands),
            "w" => self.op_w(operands),

            // Path construction
            "m" => self.op_m(operands),
            "l" => self.op_l(operands),
            "c" => self.op_c(operands),
            "v" => self.op_v(operands),
            "y" => self.op_y(operands),
            "h" => self.op_h(),
            "re" => self.op_re(operands),

            // Path painting
            "S" => self.paint_stroke(false),
            "s" => self.paint_stroke(true),
            "f" | "F" | "f*" => self.paint_fill(),
            "B" | "B*" => self.paint_both(false),
            "b" | "b*" => self.paint_both(true),
            "n" => self.current_path.clear(),

            // Color
            "g" => self.op_g(operands),
            "G" => self.op_G(operands),
            "rg" => self.op_rg(operands),
            "RG" => self.op_RG(operands),
            "k" => self.op_k(operands),
            "K" => self.op_K(operands),

            // Text state
            "Tc" => if let Some(v) = get_float_opt(operands, 0) { self.state_mut().char_spacing = v; }
            "Tw" => if let Some(v) = get_float_opt(operands, 0) { self.state_mut().word_spacing = v; }
            "TL" => if let Some(v) = get_float_opt(operands, 0) { self.state_mut().leading = v; }
            "Ts" => if let Some(v) = get_float_opt(operands, 0) { self.state_mut().text_rise = v; }
            "Tf" => self.op_Tf(operands),

            // Text positioning
            "BT" => self.op_BT(),
            "Tm" => self.op_Tm(operands),
            "Td" => self.op_Td(operands),
            "TD" => self.op_TD(operands),
            "T*" => self.op_Tstar(),

            // Text showing
            "Tj" => self.op_Tj(operands),
            "TJ" => self.op_TJ(operands),
            "'" => self.op_quote(operands),
            "\"" => self.op_dquote(operands),

            _ => {}
        }
    }

    // Transform operations
    fn op_cm(&mut self, ops: &[Object]) {
        if ops.len() >= 6 {
            let m = parse_matrix(ops);
            let state = self.state_mut();
            state.ctm = state.ctm.multiply(&m);
        }
    }

    fn op_w(&mut self, ops: &[Object]) {
        if let Some(w) = get_float_opt(ops, 0) {
            self.state_mut().line_width = w;
        }
    }

    // Path construction
    fn op_m(&mut self, ops: &[Object]) {
        if let (Some(x), Some(y)) = (get_float_opt(ops, 0), get_float_opt(ops, 1)) {
            self.current_path.push(PathCommand::MoveTo { x, y });
            self.path_start = (x, y);
            self.current_point = (x, y);
        }
    }

    fn op_l(&mut self, ops: &[Object]) {
        if let (Some(x), Some(y)) = (get_float_opt(ops, 0), get_float_opt(ops, 1)) {
            self.current_path.push(PathCommand::LineTo { x, y });
            self.current_point = (x, y);
        }
    }

    fn op_c(&mut self, ops: &[Object]) {
        if ops.len() >= 6 {
            let cmd = PathCommand::CurveTo {
                x1: get_float(ops, 0), y1: get_float(ops, 1),
                x2: get_float(ops, 2), y2: get_float(ops, 3),
                x: get_float(ops, 4), y: get_float(ops, 5),
            };
            self.current_path.push(cmd);
            self.current_point = (get_float(ops, 4), get_float(ops, 5));
        }
    }

    fn op_v(&mut self, ops: &[Object]) {
        if ops.len() >= 4 {
            let cmd = PathCommand::CurveTo {
                x1: self.current_point.0, y1: self.current_point.1,
                x2: get_float(ops, 0), y2: get_float(ops, 1),
                x: get_float(ops, 2), y: get_float(ops, 3),
            };
            self.current_path.push(cmd);
            self.current_point = (get_float(ops, 2), get_float(ops, 3));
        }
    }

    fn op_y(&mut self, ops: &[Object]) {
        if ops.len() >= 4 {
            let x = get_float(ops, 2);
            let y = get_float(ops, 3);
            self.current_path.push(PathCommand::CurveTo {
                x1: get_float(ops, 0), y1: get_float(ops, 1),
                x2: x, y2: y, x, y,
            });
            self.current_point = (x, y);
        }
    }

    fn op_h(&mut self) {
        self.current_path.push(PathCommand::ClosePath);
        self.current_point = self.path_start;
    }

    fn op_re(&mut self, ops: &[Object]) {
        if ops.len() >= 4 {
            let (x, y, w, h) = (get_float(ops, 0), get_float(ops, 1), get_float(ops, 2), get_float(ops, 3));
            self.current_path.push(PathCommand::MoveTo { x, y });
            self.current_path.push(PathCommand::LineTo { x: x + w, y });
            self.current_path.push(PathCommand::LineTo { x: x + w, y: y + h });
            self.current_path.push(PathCommand::LineTo { x, y: y + h });
            self.current_path.push(PathCommand::ClosePath);
            self.path_start = (x, y);
            self.current_point = (x, y);
        }
    }

    // Path painting
    fn paint_stroke(&mut self, close: bool) {
        if close { self.current_path.push(PathCommand::ClosePath); }
        if !self.current_path.is_empty() {
            let state = self.state();
            self.paths.push(transform_path(
                &self.current_path, Some(state.stroke_color), None,
                state.line_width, &state.ctm, self.page_height,
            ));
            self.current_path.clear();
        }
    }

    fn paint_fill(&mut self) {
        if !self.current_path.is_empty() {
            let state = self.state();
            self.paths.push(transform_path(
                &self.current_path, None, Some(state.fill_color),
                state.line_width, &state.ctm, self.page_height,
            ));
            self.current_path.clear();
        }
    }

    fn paint_both(&mut self, close: bool) {
        if close { self.current_path.push(PathCommand::ClosePath); }
        if !self.current_path.is_empty() {
            let state = self.state();
            self.paths.push(transform_path(
                &self.current_path, Some(state.stroke_color), Some(state.fill_color),
                state.line_width, &state.ctm, self.page_height,
            ));
            self.current_path.clear();
        }
    }

    // Color operations
    fn op_g(&mut self, ops: &[Object]) {
        if let Some(g) = get_float_opt(ops, 0) {
            self.state_mut().fill_color = [g, g, g, 1.0];
        }
    }

    fn op_G(&mut self, ops: &[Object]) {
        if let Some(g) = get_float_opt(ops, 0) {
            self.state_mut().stroke_color = [g, g, g, 1.0];
        }
    }

    fn op_rg(&mut self, ops: &[Object]) {
        if ops.len() >= 3 {
            self.state_mut().fill_color = [get_float(ops, 0), get_float(ops, 1), get_float(ops, 2), 1.0];
        }
    }

    fn op_RG(&mut self, ops: &[Object]) {
        if ops.len() >= 3 {
            self.state_mut().stroke_color = [get_float(ops, 0), get_float(ops, 1), get_float(ops, 2), 1.0];
        }
    }

    fn op_k(&mut self, ops: &[Object]) {
        if ops.len() >= 4 {
            let (r, g, b) = cmyk_to_rgb(get_float(ops, 0), get_float(ops, 1), get_float(ops, 2), get_float(ops, 3));
            self.state_mut().fill_color = [r, g, b, 1.0];
        }
    }

    fn op_K(&mut self, ops: &[Object]) {
        if ops.len() >= 4 {
            let (r, g, b) = cmyk_to_rgb(get_float(ops, 0), get_float(ops, 1), get_float(ops, 2), get_float(ops, 3));
            self.state_mut().stroke_color = [r, g, b, 1.0];
        }
    }

    // Text state
    fn op_Tf(&mut self, ops: &[Object]) {
        if ops.len() >= 2 {
            if let Ok(name) = ops[0].as_name() {
                self.state_mut().font_name = Some(String::from_utf8_lossy(name).to_string());
            }
            self.state_mut().font_size = get_float(ops, 1);
        }
    }

    // Text positioning
    fn op_BT(&mut self) {
        let state = self.state_mut();
        state.text_matrix = TransformMatrix::identity();
        state.line_matrix = TransformMatrix::identity();
    }

    fn op_Tm(&mut self, ops: &[Object]) {
        if ops.len() >= 6 {
            let m = parse_matrix(ops);
            let state = self.state_mut();
            state.text_matrix = m.clone();
            state.line_matrix = m;
        }
    }

    fn op_Td(&mut self, ops: &[Object]) {
        if let (Some(tx), Some(ty)) = (get_float_opt(ops, 0), get_float_opt(ops, 1)) {
            let translate = TransformMatrix::translate(tx, ty);
            let state = self.state_mut();
            state.line_matrix = state.line_matrix.multiply(&translate);
            state.text_matrix = state.line_matrix.clone();
        }
    }

    fn op_TD(&mut self, ops: &[Object]) {
        if let (Some(tx), Some(ty)) = (get_float_opt(ops, 0), get_float_opt(ops, 1)) {
            let state = self.state_mut();
            state.leading = -ty;
            let translate = TransformMatrix::translate(tx, ty);
            state.line_matrix = state.line_matrix.multiply(&translate);
            state.text_matrix = state.line_matrix.clone();
        }
    }

    fn op_Tstar(&mut self) {
        let leading = self.state().leading;
        let translate = TransformMatrix::translate(0.0, -leading);
        let state = self.state_mut();
        state.line_matrix = state.line_matrix.multiply(&translate);
        state.text_matrix = state.line_matrix.clone();
    }

    // Text showing
    fn op_Tj(&mut self, ops: &[Object]) {
        if let Some(text) = extract_string(ops, 0) {
            if !text.trim().is_empty() {
                let state = self.state();
                self.texts.push(create_text(&text, state, self.page_height));
            }
        }
    }

    fn op_TJ(&mut self, ops: &[Object]) {
        if ops.is_empty() {
            return;
        }
        if let Ok(array) = ops[0].as_array() {
            let mut combined = String::new();
            for item in array {
                match item {
                    Object::String(bytes, _) => {
                        // Try UTF-8 first
                        if let Ok(s) = std::str::from_utf8(bytes) {
                            combined.push_str(s);
                        } else if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                            // UTF-16BE
                            if let Some(s) = decode_utf16be(&bytes[2..]) {
                                combined.push_str(&s);
                            }
                        } else {
                            combined.push_str(&String::from_utf8_lossy(bytes));
                        }
                    }
                    Object::Integer(_) | Object::Real(_) => {
                        // Positioning adjustment - large negative values often indicate space
                        if let Some(adj) = get_float_opt(&[item.clone()], 0) {
                            if adj < -100.0 {
                                combined.push(' ');
                            }
                        }
                    }
                    _ => {}
                }
            }
            if !combined.trim().is_empty() {
                let state = self.state();
                self.texts.push(create_text(&combined, state, self.page_height));
            }
        }
    }

    fn op_quote(&mut self, ops: &[Object]) {
        self.op_Tstar();
        self.op_Tj(ops);
    }

    fn op_dquote(&mut self, ops: &[Object]) {
        if ops.len() >= 3 {
            self.state_mut().word_spacing = get_float(ops, 0);
            self.state_mut().char_spacing = get_float(ops, 1);
            self.op_Tstar();
            if let Some(text) = extract_string(ops, 2) {
                if !text.trim().is_empty() {
                    let state = self.state();
                    self.texts.push(create_text(&text, state, self.page_height));
                }
            }
        }
    }
}

// Helper functions
#[inline]
fn get_float(ops: &[Object], idx: usize) -> f32 {
    get_float_opt(ops, idx).unwrap_or(0.0)
}

#[inline]
fn get_float_opt(ops: &[Object], idx: usize) -> Option<f32> {
    ops.get(idx).and_then(|o| match o {
        Object::Integer(i) => Some(*i as f32),
        Object::Real(f) => Some(*f),
        _ => None,
    })
}

/// Extract string from PDF object, handling both literal and hex strings
#[inline]
fn extract_string(ops: &[Object], idx: usize) -> Option<String> {
    ops.get(idx).and_then(extract_text_from_object)
}

/// Extract text from a PDF object (handles String, Name, and hex-encoded data)
#[inline]
fn extract_text_from_object(obj: &Object) -> Option<String> {
    match obj {
        Object::String(bytes, _format) => {
            // Try UTF-8 first
            if let Ok(s) = std::str::from_utf8(bytes) {
                return Some(s.to_string());
            }
            // Try UTF-16BE (common in PDFs)
            if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                return decode_utf16be(&bytes[2..]);
            }
            // Fall back to lossy conversion
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
        Object::Name(bytes) => {
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
        _ => None,
    }
}

/// Decode UTF-16BE bytes to String
#[inline]
fn decode_utf16be(bytes: &[u8]) -> Option<String> {
    if bytes.len() % 2 != 0 {
        return None;
    }
    let u16_chars: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
        .collect();
    String::from_utf16(&u16_chars).ok()
}

#[inline]
fn parse_matrix(ops: &[Object]) -> TransformMatrix {
    TransformMatrix {
        a: get_float(ops, 0), b: get_float(ops, 1),
        c: get_float(ops, 2), d: get_float(ops, 3),
        e: get_float(ops, 4), f: get_float(ops, 5),
    }
}

/// Convert extracted elements to LayerObjects
pub fn to_layer_objects(
    texts: Vec<ExtractedText>,
    paths: Vec<ExtractedPath>,
    page_index: usize,
) -> Vec<LayerObject> {
    let mut layers = Vec::new();
    let mut z = 0;

    for (i, path) in paths.into_iter().enumerate() {
        layers.push(LayerObject {
            id: format!("vector-{}-{}", page_index, i),
            layer_type: LayerType::Vector,
            bounds: path.bounds,
            visible: true,
            locked: false,
            z_index: z,
            opacity: 1.0,
            content: None,
            font_family: None,
            font_size: None,
            font_weight: None,
            font_style: None,
            color: path.fill_color.map(|c| rgba_to_hex(&c)),
            text_align: None,
            text_decoration: None,
            text_transform: None,
            line_height: None,
            letter_spacing: None,
            background_color: None,
            image_url: None,
            image_path: None,
            image_data: None,
            shape_type: None,
            stroke_color: path.stroke_color.map(|c| rgba_to_hex(&c)),
            stroke_width: Some(path.line_width),
            fill_color: path.fill_color.map(|c| rgba_to_hex(&c)),
            source_type: SourceType::Extracted,
            role: LayerRole::Content,
            path_data: Some(PathData { commands: path.commands, fill_rule: None }),
            transform: Some(path.transform),
        });
        z += 1;
    }

    for (i, text) in texts.into_iter().enumerate() {
        let is_italic = text.font_name.to_lowercase().contains("italic");
        layers.push(LayerObject {
            id: format!("text-{}-{}", page_index, i),
            layer_type: LayerType::Text,
            bounds: Bounds::new(text.x, text.y, text.width, text.height),
            visible: true,
            locked: false,
            z_index: z,
            opacity: 1.0,
            content: Some(text.text),
            font_family: Some(normalize_font_name(&text.font_name)),
            font_size: Some(text.font_size),
            font_weight: Some(if text.font_name.to_lowercase().contains("bold") { 700u16 } else { 400u16 }),
            font_style: if is_italic { Some("italic".to_string()) } else { None },
            color: Some(rgba_to_hex(&text.color)),
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
            source_type: SourceType::Extracted,
            role: LayerRole::Content,
            path_data: None,
            transform: Some(text.transform),
        });
        z += 1;
    }

    layers
}
