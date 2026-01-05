//! Path Operations Module
//! Handles PDF path construction and painting

use crate::models::{Bounds, PathCommand, TransformMatrix};

/// Extracted path/vector data
#[derive(Debug, Clone)]
pub struct ExtractedPath {
    pub commands: Vec<PathCommand>,
    pub stroke_color: Option<[f32; 4]>,
    pub fill_color: Option<[f32; 4]>,
    pub line_width: f32,
    pub bounds: Bounds,
    pub transform: TransformMatrix,
}

/// Transform path commands and calculate bounds
pub fn transform_path(
    commands: &[PathCommand],
    stroke: Option<[f32; 4]>,
    fill: Option<[f32; 4]>,
    line_width: f32,
    ctm: &TransformMatrix,
    page_height: f32,
) -> ExtractedPath {
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;

    let transformed: Vec<PathCommand> = commands
        .iter()
        .map(|cmd| transform_command(cmd, ctm, page_height, &mut min_x, &mut min_y, &mut max_x, &mut max_y))
        .collect();

    ExtractedPath {
        commands: transformed,
        stroke_color: stroke,
        fill_color: fill,
        line_width: line_width * ctm.scale_x().abs(),
        bounds: Bounds::new(min_x, min_y, (max_x - min_x).max(1.0), (max_y - min_y).max(1.0)),
        transform: ctm.clone(),
    }
}

fn transform_command(
    cmd: &PathCommand,
    ctm: &TransformMatrix,
    page_height: f32,
    min_x: &mut f32,
    min_y: &mut f32,
    max_x: &mut f32,
    max_y: &mut f32,
) -> PathCommand {
    match cmd {
        PathCommand::MoveTo { x, y } => {
            let (tx, ty) = ctm.transform_point(*x, *y);
            let ty = page_height - ty;
            update_bounds(tx, ty, min_x, min_y, max_x, max_y);
            PathCommand::MoveTo { x: tx, y: ty }
        }
        PathCommand::LineTo { x, y } => {
            let (tx, ty) = ctm.transform_point(*x, *y);
            let ty = page_height - ty;
            update_bounds(tx, ty, min_x, min_y, max_x, max_y);
            PathCommand::LineTo { x: tx, y: ty }
        }
        PathCommand::CurveTo { x1, y1, x2, y2, x, y } => {
            let (tx1, ty1) = ctm.transform_point(*x1, *y1);
            let (tx2, ty2) = ctm.transform_point(*x2, *y2);
            let (tx, ty) = ctm.transform_point(*x, *y);
            let ty1 = page_height - ty1;
            let ty2 = page_height - ty2;
            let ty = page_height - ty;
            update_bounds(tx1, ty1, min_x, min_y, max_x, max_y);
            update_bounds(tx2, ty2, min_x, min_y, max_x, max_y);
            update_bounds(tx, ty, min_x, min_y, max_x, max_y);
            PathCommand::CurveTo { x1: tx1, y1: ty1, x2: tx2, y2: ty2, x: tx, y: ty }
        }
        PathCommand::ClosePath => PathCommand::ClosePath,
    }
}

fn update_bounds(x: f32, y: f32, min_x: &mut f32, min_y: &mut f32, max_x: &mut f32, max_y: &mut f32) {
    *min_x = min_x.min(x);
    *min_y = min_y.min(y);
    *max_x = max_x.max(x);
    *max_y = max_y.max(y);
}
