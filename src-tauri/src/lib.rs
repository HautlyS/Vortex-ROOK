//! Book Creation Converter - Rust Backend
//!
//! This module provides the core backend functionality for the Book Creation Converter
//! application, including document parsing, layer processing, image handling, and export.

pub mod content_parser;
pub mod document_parser;
pub mod export_handler;
pub mod font_handler;
pub mod font_manager;
pub mod font_service;
pub mod graphics_state;
pub mod image_handler;
pub mod layer_processor;
pub mod live_sync;
pub mod models;
pub mod ocr_handler;
pub mod path_ops;
pub mod pdf_analyzer;
pub mod pdf_reconstructor;
pub mod text_ops;

use tauri::http::{Request, Response};
use tauri::UriSchemeContext;
#[cfg(debug_assertions)]
use tauri::Manager;

/// Clear the image cache (called when closing documents)
#[tauri::command]
fn clear_image_cache() {
    image_handler::clear_image_cache();
}

/// Handle image protocol requests
fn handle_image_protocol<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let path = request.uri().path();
    // Path format: /image-id
    let image_id = path.trim_start_matches('/');
    
    match image_handler::get_image_bytes(image_id) {
        Some(data) => Response::builder()
            .status(200)
            .header("Content-Type", "image/png")
            .header("Access-Control-Allow-Origin", "*")
            .body(data)
            .unwrap(),
        None => Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap(),
    }
}

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .register_uri_scheme_protocol("image", handle_image_protocol)
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            // Start font watcher for async updates
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = font_service::start_font_watcher(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            document_parser::import_document,
            layer_processor::update_layer,
            layer_processor::delete_layer,
            layer_processor::reorder_layers,
            export_handler::export_document,
            export_handler::load_project,
            export_handler::save_project,
            image_handler::get_image,
            image_handler::export_layer_image,
            clear_image_cache,
            // PDF analyzer commands
            pdf_analyzer::analyze_pdf_content,
            // PDF reconstruction commands
            pdf_reconstructor::reconstruct_pdf_with_ocr,
            pdf_reconstructor::needs_ocr_reconstruction,
            // Font service commands (legacy - delegates to font_manager)
            font_service::get_google_font_url,
            font_service::store_embedded_font,
            font_service::get_embedded_font,
            font_service::list_embedded_fonts,
            font_service::find_matching_font,
            font_service::get_all_fonts,
            font_service::fetch_google_fonts_api,
            font_service::install_custom_font,
            // Font manager commands (primary)
            font_manager::get_system_fonts,
            font_manager::search_google_fonts,
            font_manager::fetch_google_fonts,
            font_manager::find_font_match,
            font_manager::install_google_font,
            font_manager::install_font_file,
            font_manager::parse_font_name,
            font_manager::get_canonical_font_name,
            font_manager::is_font_installed,
            font_manager::get_google_font_css_url,
            font_manager::clear_font_cache,
            font_manager::get_all_available_fonts,
            // Live sync commands
            live_sync::create_sync_session,
            live_sync::generate_permission_link,
            live_sync::parse_permission_link,
            live_sync::validate_permission,
            live_sync::get_rtc_config,
            live_sync::generate_peer_id,
            live_sync::create_join_message,
            live_sync::create_offer_message,
            live_sync::create_answer_message,
            live_sync::create_ice_candidate_message,
            live_sync::parse_signal_message,
            live_sync::serialize_signal_message,
            live_sync::set_signaling_state,
            live_sync::get_signaling_state,
            live_sync::clear_signaling_state,
            live_sync::create_sync_message,
            live_sync::serialize_sync_message,
            live_sync::parse_sync_message,
            live_sync::create_layer_update_op,
            live_sync::create_cursor_op,
            live_sync::create_presence_op,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
