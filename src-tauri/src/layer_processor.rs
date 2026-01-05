//! Layer Processor Module
//!
//! Handles layer operations including updates, deletions, and z-index management.
//! Note: Layer state is primarily managed in the frontend (Pinia store).
//! These commands provide backend validation and can be extended for persistence.

use crate::models::{LayerObject, LayerUpdates, PageData};

/// Update a layer's properties
/// 
/// In the current architecture, layer state is managed in the frontend.
/// This command validates updates and returns the updated layer.
/// Can be extended to persist changes to a backend store.
#[tauri::command]
pub fn update_layer(
    _page_index: usize,
    layer_id: String,
    updates: LayerUpdates,
) -> Result<LayerObject, String> {
    // Create a placeholder layer with the updates applied
    // The frontend maintains the actual state; this validates the update
    let mut layer = LayerObject {
        id: layer_id,
        layer_type: crate::models::LayerType::Text,
        bounds: updates.bounds.clone().unwrap_or(crate::models::Bounds::new(0.0, 0.0, 100.0, 100.0)),
        visible: updates.visible.unwrap_or(true),
        locked: updates.locked.unwrap_or(false),
        z_index: updates.z_index.unwrap_or(0),
        opacity: updates.opacity.unwrap_or(1.0).clamp(0.0, 1.0),
        content: updates.content.clone(),
        font_family: updates.font_family.clone(),
        font_size: updates.font_size.map(|s| s.max(1.0)),
        font_weight: updates.font_weight,
        font_style: updates.font_style.clone(),
        color: updates.color.clone(),
        text_align: updates.text_align.clone(),
        text_decoration: updates.text_decoration.clone(),
        text_transform: updates.text_transform.clone(),
        line_height: updates.line_height,
        letter_spacing: updates.letter_spacing,
        background_color: updates.background_color.clone(),
        image_url: None,
        image_path: None,
        image_data: None,
        shape_type: None,
        stroke_color: None,
        stroke_width: None,
        fill_color: None,
        path_data: None,
        transform: None,
        source_type: crate::models::SourceType::Manual,
        role: updates.role.clone().unwrap_or(crate::models::LayerRole::Content),
    };
    
    LayerProcessor::apply_updates(&mut layer, &updates);
    Ok(layer)
}

/// Delete a layer from a page
/// 
/// In the current architecture, layer deletion is handled in the frontend.
/// This command acknowledges the deletion request.
#[tauri::command]
pub fn delete_layer(_page_index: usize, _layer_id: String) -> Result<(), String> {
    // Layer deletion is handled by the frontend store
    // This command can be extended to persist deletions
    Ok(())
}

/// Reorder layers on a page
/// 
/// In the current architecture, layer ordering is handled in the frontend.
/// This command acknowledges the reorder request.
#[tauri::command]
pub fn reorder_layers(_page_index: usize, _layer_ids: Vec<String>) -> Result<(), String> {
    // Layer reordering is handled by the frontend store
    // This command can be extended to persist the new order
    Ok(())
}

/// Layer processor for z-index and layer management operations
pub struct LayerProcessor;

impl LayerProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Bring a layer to the front (highest z-index)
    pub fn bring_to_front(page: &mut PageData, layer_id: &str) -> Result<(), String> {
        let max_z = page.layers.iter().map(|l| l.z_index).max().unwrap_or(0);

        if let Some(layer) = page.layers.iter_mut().find(|l| l.id == layer_id) {
            layer.z_index = max_z + 1;
            Ok(())
        } else {
            Err(format!("Layer not found: {}", layer_id))
        }
    }

    /// Send a layer to the back (lowest z-index)
    pub fn send_to_back(page: &mut PageData, layer_id: &str) -> Result<(), String> {
        let min_z = page.layers.iter().map(|l| l.z_index).min().unwrap_or(0);

        if let Some(layer) = page.layers.iter_mut().find(|l| l.id == layer_id) {
            layer.z_index = min_z - 1;
            Ok(())
        } else {
            Err(format!("Layer not found: {}", layer_id))
        }
    }

    /// Move a layer up one position in z-order
    pub fn move_up(page: &mut PageData, layer_id: &str) -> Result<(), String> {
        // Find the layer and its current z-index
        let current_z = page
            .layers
            .iter()
            .find(|l| l.id == layer_id)
            .map(|l| l.z_index)
            .ok_or_else(|| format!("Layer not found: {}", layer_id))?;

        // Find the next higher z-index
        let next_z = page
            .layers
            .iter()
            .filter(|l| l.z_index > current_z)
            .map(|l| l.z_index)
            .min();

        if let Some(swap_z) = next_z {
            // Swap z-indices
            for layer in &mut page.layers {
                if layer.id == layer_id {
                    layer.z_index = swap_z;
                } else if layer.z_index == swap_z {
                    layer.z_index = current_z;
                }
            }
        }
        // If no higher layer exists, do nothing (already at top)

        Ok(())
    }

    /// Move a layer down one position in z-order
    pub fn move_down(page: &mut PageData, layer_id: &str) -> Result<(), String> {
        // Find the layer and its current z-index
        let current_z = page
            .layers
            .iter()
            .find(|l| l.id == layer_id)
            .map(|l| l.z_index)
            .ok_or_else(|| format!("Layer not found: {}", layer_id))?;

        // Find the next lower z-index
        let prev_z = page
            .layers
            .iter()
            .filter(|l| l.z_index < current_z)
            .map(|l| l.z_index)
            .max();

        if let Some(swap_z) = prev_z {
            // Swap z-indices
            for layer in &mut page.layers {
                if layer.id == layer_id {
                    layer.z_index = swap_z;
                } else if layer.z_index == swap_z {
                    layer.z_index = current_z;
                }
            }
        }
        // If no lower layer exists, do nothing (already at bottom)

        Ok(())
    }

    /// Apply layer updates to a layer object
    pub fn apply_updates(layer: &mut LayerObject, updates: &LayerUpdates) {
        if let Some(ref bounds) = updates.bounds {
            layer.bounds = bounds.clone();
        }
        if let Some(visible) = updates.visible {
            layer.visible = visible;
        }
        if let Some(locked) = updates.locked {
            layer.locked = locked;
        }
        if let Some(z_index) = updates.z_index {
            layer.z_index = z_index;
        }
        if let Some(opacity) = updates.opacity {
            // Clamp opacity to valid range
            layer.opacity = opacity.clamp(0.0, 1.0);
        }
        if let Some(ref content) = updates.content {
            layer.content = Some(content.clone());
        }
        if let Some(ref font_family) = updates.font_family {
            layer.font_family = Some(font_family.clone());
        }
        if let Some(font_size) = updates.font_size {
            // Ensure font size is positive
            layer.font_size = Some(font_size.max(1.0));
        }
        if let Some(font_weight) = updates.font_weight {
            layer.font_weight = Some(font_weight);
        }
        if let Some(ref color) = updates.color {
            layer.color = Some(color.clone());
        }
        if let Some(ref text_align) = updates.text_align {
            layer.text_align = Some(text_align.clone());
        }
        if let Some(ref role) = updates.role {
            layer.role = role.clone();
        }
    }

    /// Normalize z-indices to be sequential starting from 0
    pub fn normalize_z_indices(page: &mut PageData) {
        // Sort layers by current z-index
        page.layers.sort_by_key(|l| l.z_index);

        // Reassign sequential z-indices
        for (i, layer) in page.layers.iter_mut().enumerate() {
            layer.z_index = i as i32;
        }
    }
}

impl Default for LayerProcessor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Bounds, LayerRole, LayerType, SourceType};

    fn create_test_layer(id: &str, z_index: i32) -> LayerObject {
        LayerObject {
            id: id.to_string(),
            layer_type: LayerType::Text,
            bounds: Bounds::new(0.0, 0.0, 100.0, 50.0),
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
            image_url: None,
            image_path: None,
            image_data: None,
            shape_type: None,
            stroke_color: None,
            stroke_width: None,
            fill_color: None,
            path_data: None,
            transform: None,
            source_type: SourceType::Manual,
            role: LayerRole::Content,
        }
    }

    fn create_test_page() -> PageData {
        PageData {
            page_index: 0,
            width: 612.0,
            height: 792.0,
            dpi: Some(72),
            layers: vec![
                create_test_layer("layer-1", 1),
                create_test_layer("layer-2", 2),
                create_test_layer("layer-3", 3),
            ],
            metadata: None,
        }
    }

    #[test]
    fn test_bring_to_front() {
        let mut page = create_test_page();
        LayerProcessor::bring_to_front(&mut page, "layer-1").unwrap();

        let layer = page.layers.iter().find(|l| l.id == "layer-1").unwrap();
        assert_eq!(layer.z_index, 4); // Should be max + 1
    }

    #[test]
    fn test_send_to_back() {
        let mut page = create_test_page();
        LayerProcessor::send_to_back(&mut page, "layer-3").unwrap();

        let layer = page.layers.iter().find(|l| l.id == "layer-3").unwrap();
        assert_eq!(layer.z_index, 0); // Should be min - 1
    }

    #[test]
    fn test_move_up() {
        let mut page = create_test_page();
        LayerProcessor::move_up(&mut page, "layer-1").unwrap();

        let layer1 = page.layers.iter().find(|l| l.id == "layer-1").unwrap();
        let layer2 = page.layers.iter().find(|l| l.id == "layer-2").unwrap();
        assert_eq!(layer1.z_index, 2);
        assert_eq!(layer2.z_index, 1);
    }

    #[test]
    fn test_move_down() {
        let mut page = create_test_page();
        LayerProcessor::move_down(&mut page, "layer-3").unwrap();

        let layer2 = page.layers.iter().find(|l| l.id == "layer-2").unwrap();
        let layer3 = page.layers.iter().find(|l| l.id == "layer-3").unwrap();
        assert_eq!(layer3.z_index, 2);
        assert_eq!(layer2.z_index, 3);
    }

    #[test]
    fn test_normalize_z_indices() {
        let mut page = PageData {
            page_index: 0,
            width: 612.0,
            height: 792.0,
            dpi: Some(72),
            layers: vec![
                create_test_layer("layer-a", 10),
                create_test_layer("layer-b", 5),
                create_test_layer("layer-c", 100),
            ],
            metadata: None,
        };

        LayerProcessor::normalize_z_indices(&mut page);

        // After normalization, z-indices should be 0, 1, 2
        assert_eq!(page.layers[0].z_index, 0);
        assert_eq!(page.layers[1].z_index, 1);
        assert_eq!(page.layers[2].z_index, 2);

        // Order should be by original z-index: layer-b (5), layer-a (10), layer-c (100)
        assert_eq!(page.layers[0].id, "layer-b");
        assert_eq!(page.layers[1].id, "layer-a");
        assert_eq!(page.layers[2].id, "layer-c");
    }

    #[test]
    fn test_apply_updates_clamps_opacity() {
        let mut layer = create_test_layer("test", 0);

        let updates = LayerUpdates {
            opacity: Some(1.5), // Invalid: > 1.0
            ..Default::default()
        };

        LayerProcessor::apply_updates(&mut layer, &updates);
        assert_eq!(layer.opacity, 1.0); // Should be clamped to 1.0
    }

    #[test]
    fn test_apply_updates_clamps_font_size() {
        let mut layer = create_test_layer("test", 0);

        let updates = LayerUpdates {
            font_size: Some(-5.0), // Invalid: negative
            ..Default::default()
        };

        LayerProcessor::apply_updates(&mut layer, &updates);
        assert_eq!(layer.font_size, Some(1.0)); // Should be clamped to 1.0
    }

    #[test]
    fn test_layer_not_found() {
        let mut page = create_test_page();
        let result = LayerProcessor::bring_to_front(&mut page, "nonexistent");
        assert!(result.is_err());
    }
}

impl Default for LayerUpdates {
    fn default() -> Self {
        Self {
            bounds: None,
            visible: None,
            locked: None,
            z_index: None,
            opacity: None,
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
            role: None,
        }
    }
}
