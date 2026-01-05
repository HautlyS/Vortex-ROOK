# Implementation Plan: Book Creation Converter

## Overview

This implementation plan covers building a cross-platform desktop application using Vue.js 3.5+, Tauri v2, Fabric.js 6+, and Rust. The plan follows an incremental approach, building core functionality first and adding features progressively.

## Tasks

- [x] 1. Project Setup and Core Infrastructure
  - [x] 1.1 Initialize Tauri v2 + Vue.js 3.5 project with TypeScript
    - Create project using `npm create tauri-app@latest` with Vue template
    - Configure Vite 6.0+ with TypeScript 5.6+
    - Set up Tailwind CSS
    - Configure ESLint and Prettier
    - _Requirements: 21.1, 21.2, 21.3_

  - [x] 1.2 Set up Pinia stores structure
    - Create documentStore with Composition API (Setup Store syntax)
    - Create uiStore for UI state management
    - Configure store persistence if needed
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.3 Set up Rust backend structure
    - Create module structure: document_parser, layer_processor, export_handler, image_handler
    - Add dependencies: pdfium-render, docx-rust, tokio, serde, image
    - Configure Tauri commands registration
    - _Requirements: 1.1, 2.1_

  - [x] 1.4 Set up testing infrastructure
    - Configure Vitest 3.0+ with fast-check 3.22+ for property-based testing
    - Configure proptest 1.5+ for Rust property-based testing
    - Create test project configuration for unit and property tests
    - _Requirements: Testing Strategy_

- [x] 2. Data Models and Serialization
  - [x] 2.1 Implement TypeScript data models
    - Create LayerObject, Bounds, PageData, BookProjectData interfaces
    - Create ImageMetadata, DocumentMetadata, HistoryEntry types
    - Implement type guards and validation functions
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.2 Implement Rust data models
    - Create LayerObject, Bounds, PageData structs with serde derive
    - Create enums: LayerType, TextAlign, ShapeType, SourceType, LayerRole
    - Implement DocumentResponse and ExportResult structs
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.3 Write property test for Layer serialization round-trip
    - **Property 3: Layer Serialization Round-Trip**
    - **Validates: Requirements 3.9, 3.10, 3.11**

  - [x] 2.4 Write property test for Layer model validity
    - **Property 2: Layer Model Validity**
    - **Validates: Requirements 3.1-3.8**

- [x] 3. Checkpoint - Core Models Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. PDF Document Import
  - [x] 4.1 Implement PDF parser with pdfium-render
    - Create PdfParser struct with parse_pdf method
    - Implement page extraction with dimensions
    - Extract text elements with bounding boxes
    - Extract images with lossless quality
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 4.2 Implement layer ID generation
    - Create unique ID generator in format `{type}-{pageIndex}-{seqNumber}`
    - Ensure uniqueness across all pages
    - _Requirements: 1.5_

  - [x] 4.3 Write property test for Layer ID uniqueness
    - **Property 1: Layer ID Uniqueness and Format**
    - **Validates: Requirements 1.5, 2.5**

  - [x] 4.4 Implement import_document Tauri command
    - Create async command handler
    - Implement progress event emission
    - Handle errors gracefully (skip corrupted pages)
    - _Requirements: 1.6, 1.7, 19.1, 19.2, 19.4_

  - [x] 4.5 Write property test for progress events
    - **Property 29: Progress Events Completeness**
    - **Validates: Requirements 19.1, 19.2, 19.4**

- [x] 5. DOCX Document Import
  - [x] 5.1 Implement DOCX parser with docx-rust
    - Create DocxParser struct with parse_docx method
    - Extract paragraphs and runs with style information
    - Extract embedded images from media folder
    - Parse table structures
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.2 Implement encoding detection and conversion
    - Auto-detect text encoding (UTF-8, UTF-16, Latin-1)
    - Convert to UTF-8 for consistent handling
    - _Requirements: 2.6_

- [x] 6. Checkpoint - Document Import Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Image Streaming via Custom Protocol
  - [x] 7.1 Implement ImageHandler with Tauri v2 custom protocol
    - Create image cache with HashMap
    - Implement get_image_response returning tauri::ipc::Response
    - Implement stream_image using Channel API for large images
    - _Requirements: 18.1, 18.2, 18.3_

  - [x] 7.2 Register custom protocol in Tauri
    - Configure protocol handler for `tauri://localhost/image/{image_id}`
    - Implement binary data response bypassing JSON serialization
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ] 7.3 Write property test for image streaming
    - **Property 28: Image Streaming Returns Binary Data**
    - **Validates: Requirements 18.1, 18.2, 18.3**


- [x] 8. Canvas Rendering with Fabric.js 6+
  - [x] 8.1 Implement CanvasManager class
    - Initialize Fabric.js 6+ Canvas with modern ES modules
    - Implement renderPage method for layer rendering
    - Implement addLayer, removeLayer, updateLayer methods
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 8.2 Implement zoom functionality
    - Implement setZoom with clamping to [0.1, 3.0]
    - Implement coordinate transformation formula
    - Implement zoomToFit method
    - _Requirements: 4.5, 4.6_

  - [ ] 8.3 Write property test for zoom clamping
    - **Property 6: Zoom Range Clamping**
    - **Validates: Requirements 4.6**

  - [ ] 8.4 Write property test for coordinate transformation
    - **Property 5: Coordinate Transformation Formula**
    - **Validates: Requirements 4.5**

  - [x] 8.5 Create CanvasComponent.vue
    - Implement Vue component with `<script setup lang="ts">`
    - Integrate CanvasManager
    - Add zoom controls UI
    - _Requirements: 4.1, 16.4_

- [x] 9. Layer Selection and Manipulation
  - [x] 9.1 Implement layer selection with Fabric.js events
    - Handle selection:created, selection:updated, selection:cleared events
    - Implement selectLayer, selectLayers, deselectAll methods
    - Support multi-select with Shift+click using ActiveSelection
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

  - [x] 9.2 Implement layer manipulation
    - Handle object:moving event for drag updates
    - Handle object:scaling event for resize
    - Implement aspect ratio preservation option
    - _Requirements: 5.3, 5.4_

  - [ ] 9.3 Write property test for drag coordinate updates
    - **Property 7: Layer Drag Updates Coordinates**
    - **Validates: Requirements 5.3**

  - [ ] 9.4 Write property test for aspect ratio preservation
    - **Property 8: Aspect Ratio Preservation on Resize**
    - **Validates: Requirements 5.4**

- [-] 10. Checkpoint - Canvas Rendering Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 11. Layer Z-Index Management
  - [x] 11.1 Implement LayerProcessor z-index operations in Rust
    - Implement bring_to_front, send_to_back methods
    - Implement move_up, move_down methods
    - Implement reorder_layers for batch reordering
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.2 Create Tauri commands for z-index operations
    - Register reorder_layers command
    - Trigger canvas re-render via requestRenderAll
    - _Requirements: 6.5_

  - [ ] 11.3 Write property test for bring to front
    - **Property 9: Z-Index Bring to Front**
    - **Validates: Requirements 6.1**

  - [ ] 11.4 Write property test for send to back
    - **Property 10: Z-Index Send to Back**
    - **Validates: Requirements 6.2**

  - [ ] 11.5 Write property test for move up
    - **Property 11: Z-Index Move Up**
    - **Validates: Requirements 6.3**

  - [ ] 11.6 Write property test for move down
    - **Property 12: Z-Index Move Down**
    - **Validates: Requirements 6.4**

- [x] 12. Layer Visibility and Locking
  - [x] 12.1 Implement visibility and lock toggles
    - Implement toggle methods in LayerManager
    - Set selectable=false for locked layers in Fabric.js
    - Hide layers with visible=false from canvas
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 12.2 Implement background layer auto-lock
    - Set locked=true for all background layers after import
    - _Requirements: 7.5_

  - [ ] 12.3 Write property test for boolean toggle idempotence
    - **Property 13: Boolean Toggle Idempotence**
    - **Validates: Requirements 7.1, 7.3**

  - [ ] 12.4 Write property test for locked layer manipulation prevention
    - **Property 14: Locked Layer Prevents Manipulation**
    - **Validates: Requirements 7.4**

  - [ ] 12.5 Write property test for background layer default lock
    - **Property 15: Background Layer Locked by Default**
    - **Validates: Requirements 7.5**

- [-] 13. Checkpoint - Layer Management Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 14. Text Layer Editing
  - [x] 14.1 Implement text editing with Fabric.js IText
    - Enable edit mode on double-click using enterEditing
    - Handle text content updates
    - Implement exitEditing on blur/escape
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 14.2 Implement text property updates
    - Update fontFamily, fontSize, fontWeight, color, textAlign
    - Trigger canvas re-render on property change
    - _Requirements: 8.3, 8.4_

  - [ ] 14.3 Write property test for text property updates
    - **Property 16: Text Property Updates**
    - **Validates: Requirements 8.3**

- [x] 15. Image Layer Editing
  - [x] 15.1 Implement image replacement
    - Open file picker on "Replace Image" action
    - Update imageUrl and imageData while preserving position
    - _Requirements: 9.1, 9.5_

  - [x] 15.2 Implement image cropping
    - Handle crop handles for bounds adjustment
    - _Requirements: 9.2_

  - [x] 15.3 Implement image filters
    - Apply Fabric.js filters for brightness/contrast/saturation
    - _Requirements: 9.3_

  - [x] 15.4 Implement image export
    - Export layer image as lossless PNG or TIFF
    - _Requirements: 9.4_

  - [ ] 15.5 Write property test for image replacement position preservation
    - **Property 17: Image Replacement Preserves Position**
    - **Validates: Requirements 9.5**

- [x] 16. Header/Footer Management
  - [x] 16.1 Implement header/footer role assignment
    - Set layer role to "header" or "footer"
    - _Requirements: 10.1_

  - [x] 16.2 Implement header/footer page range application
    - Duplicate layer to specified page range
    - Support global header/footer (all pages)
    - _Requirements: 10.2, 10.3_

  - [ ] 16.3 Implement auto-detection during import
    - Detect repeated content patterns
    - _Requirements: 10.4_

  - [ ] 16.4 Write property test for role assignment
    - **Property 18: Header/Footer Role Assignment**
    - **Validates: Requirements 10.1**

  - [ ] 16.5 Write property test for page range application
    - **Property 19: Header/Footer Page Range Application**
    - **Validates: Requirements 10.2, 10.3**

- [-] 17. Checkpoint - Layer Editing Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 18. Page Navigation and Management
  - [x] 18.1 Implement page thumbnail sidebar
    - Create PageThumbnails.vue component
    - Display 100x150px previews
    - Show current page indicator
    - _Requirements: 11.1, 11.7_

  - [x] 18.2 Implement page navigation
    - Load page on thumbnail click
    - _Requirements: 11.2_

  - [x] 18.3 Implement page reordering
    - Drag thumbnails to reorder
    - Preserve all layers during reorder
    - _Requirements: 11.3_

  - [x] 18.4 Implement page operations
    - Duplicate page with all layers
    - Delete page with confirmation
    - Add blank page at position
    - _Requirements: 11.4, 11.5, 11.6_

  - [ ] 18.5 Write property test for page reorder content preservation
    - **Property 20: Page Reorder Preserves Content**
    - **Validates: Requirements 11.3**

  - [ ] 18.6 Write property test for page duplication
    - **Property 21: Page Duplication Preserves Layers**
    - **Validates: Requirements 11.4**

  - [ ] 18.7 Write property test for page deletion
    - **Property 22: Page Deletion Reduces Count**
    - **Validates: Requirements 11.5**

  - [ ] 18.8 Write property test for page addition
    - **Property 23: Page Addition Increases Count**
    - **Validates: Requirements 11.6**

- [x] 19. Undo/Redo System
  - [x] 19.1 Implement History_Manager in documentStore
    - Maintain undo/redo stacks with minimum 20 entries
    - Track layer mutations, additions, deletions
    - Track page operations
    - _Requirements: 15.3, 15.5_

  - [x] 19.2 Implement undo/redo actions
    - Undo: restore previous state
    - Redo: restore undone state
    - Trigger canvas re-render
    - _Requirements: 15.1, 15.2, 15.4_

  - [ ] 19.3 Write property test for undo restores state
    - **Property 25: Undo Restores Previous State**
    - **Validates: Requirements 15.1**

  - [ ] 19.4 Write property test for redo restores action
    - **Property 26: Redo Restores Undone Action**
    - **Validates: Requirements 15.2**

  - [ ] 19.5 Write property test for history minimum entries
    - **Property 27: History Maintains Minimum Entries**
    - **Validates: Requirements 15.3**

- [-] 20. Checkpoint - Page Management Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 21. Export to PDF
  - [x] 21.1 Implement PdfExporter in Rust
    - Reconstruct PDF from page layers
    - Preserve image quality (lossless)
    - Maintain positional accuracy within ±2 points
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ] 21.2 Implement PDF OCG layers option
    - Create PDF layers for editability when enabled
    - _Requirements: 12.4_

  - [x] 21.3 Implement export options
    - Output path, page range, metadata
    - _Requirements: 12.6_

  - [ ] 21.4 Write property test for positional accuracy
    - **Property 24: Export Positional Accuracy**
    - **Validates: Requirements 12.3**

- [x] 22. Export to DOCX
  - [x] 22.1 Implement DocxExporter in Rust
    - Convert text layers to paragraphs
    - Embed image layers with positioning
    - Include metadata
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 22.2 Implement export options
    - Output path, page range
    - _Requirements: 13.4_

- [x] 23. Project Save and Load
  - [x] 23.1 Implement ProjectExporter for .bookproj format
    - Serialize to JSON + binary assets
    - Include version, metadata, pages, layers, settings
    - Optionally include undo/redo history
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 23.2 Implement project loading
    - Deserialize and restore complete document state
    - _Requirements: 14.3_

  - [ ] 23.3 Write property test for project save/load round-trip
    - **Property 4: Project Save/Load Round-Trip**
    - **Validates: Requirements 14.5, 14.6, 14.7**

- [x] 24. Checkpoint - Export Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 25. User Interface Layout
  - [x] 25.1 Implement main layout structure
    - Menu bar with File, Edit, View, Help
    - Toolbar with Zoom, Undo/Redo, Export, Settings
    - _Requirements: 16.1, 16.2_

  - [x] 25.2 Implement sidebar panels
    - Pages Panel (left) with thumbnails
    - Layers Panel (right) with layer list and controls
    - _Requirements: 16.3, 16.5_

  - [x] 25.3 Implement Properties Inspector
    - Context-dependent layer properties
    - _Requirements: 16.6_

  - [x] 25.4 Implement Status Bar
    - Document status and page count
    - _Requirements: 16.7_

- [x] 26. Keyboard Shortcuts
  - [x] 26.1 Implement document shortcuts
    - Ctrl+O: Open import dialog
    - Ctrl+E: Open export dialog
    - _Requirements: 17.1, 17.2_

  - [x] 26.2 Implement layer shortcuts
    - Delete: Delete selected layer
    - Ctrl+D: Duplicate layer
    - Ctrl+A: Select all layers using ActiveSelection
    - _Requirements: 17.3, 17.4, 17.5_

  - [x] 26.3 Implement navigation shortcuts
    - +/-: Zoom in/out
    - Arrow keys: Move layer by increments
    - _Requirements: 17.6, 17.7_

- [x] 27. Error Handling
  - [x] 27.1 Implement error dialogs
    - File not found dialog
    - Corrupted document warning
    - Memory limit warning
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 27.2 Implement graceful degradation
    - Skip problematic pages/sections
    - Log errors for debugging
    - _Requirements: 20.2, 20.4_

- [ ] 28. Cross-Platform Build Configuration
  - [ ] 28.1 Configure platform-specific builds
    - Windows: .msi installer
    - macOS: .dmg bundle
    - Linux: AppImage/.deb package
    - _Requirements: 21.4_

  - [ ] 28.2 Test on all platforms
    - Windows 10+
    - macOS 11+
    - Ubuntu 20.04+
    - _Requirements: 21.1, 21.2, 21.3_

- [-] 29. Final Checkpoint - All Features Complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run full property-based test suite with 100+ iterations
  - Verify cross-platform builds

## Notes

- All tasks are required for complete implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (29 properties total)
- Unit tests validate specific examples and edge cases
- Testing uses Vitest 3.0+ with fast-check 3.22+ (TypeScript) and proptest 1.5+ (Rust)
