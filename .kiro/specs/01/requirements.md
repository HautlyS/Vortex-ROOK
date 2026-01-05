# Requirements Document

## Introduction

A cross-platform desktop application that converts PDF and DOCX documents into an editable, layer-based book design system. The application enables professional book creators to parse documents with lossless image preservation, visualize and edit layers per page, and export finalized layouts back to PDF or DOCX with preserved layer structure.

Built with modern technologies: Vue.js 3.5+ (Composition API with `<script setup>`), Tauri v2 (with revamped IPC using custom protocols), Fabric.js 6+, Pinia for state management, and Rust backend with pdfium-render and docx-rust.

## Glossary

- **Layer**: A discrete visual element on a page (text, image, shape, or vector) that can be independently positioned, edited, and ordered
- **Canvas**: The Fabric.js-based rendering surface where page layers are displayed and manipulated
- **Page**: A single page unit containing multiple layers with defined dimensions
- **Bounds**: The positioning coordinates (x, y, width, height) of a layer relative to the page origin
- **Z-Index**: The stacking order of layers determining which elements appear above others
- **BookProject**: The native save format (.bookproj) containing document structure, layers, and assets
- **IPC**: Inter-Process Communication between the Vue.js frontend and Rust backend via Tauri commands
- **Custom_Protocol**: Tauri v2's binary streaming mechanism for high-performance image delivery (bypasses JSON serialization)
- **OCG**: Optional Content Groups - PDF layer structure for preserving editability in exported PDFs
- **Channel**: Tauri v2's streaming API for sending data chunks from Rust to frontend
- **ActiveSelection**: Fabric.js multi-object selection container for batch operations

## Requirements

### Requirement 1: Document Import - PDF

**User Story:** As a book designer, I want to import PDF documents, so that I can convert them into editable layered designs.

#### Acceptance Criteria

1. WHEN a user selects a PDF file via the file picker dialog, THE Document_Importer SHALL load the document using pdfium-render
2. WHEN a PDF is loaded, THE Document_Importer SHALL extract all pages with their original dimensions (width, height in points)
3. WHEN extracting page content, THE Document_Importer SHALL extract text elements with accurate bounding box coordinates (x, y, width, height)
4. WHEN extracting page content, THE Document_Importer SHALL extract images with lossless quality preservation (original pixel data)
5. WHEN extracting content, THE Document_Importer SHALL generate unique layer IDs in format `{type}-{pageIndex}-{seqNumber}`
6. WHEN import completes, THE Document_Importer SHALL return structured page data including total pages, dimensions, and layer arrays
7. IF a PDF file is corrupted or malformed, THEN THE Document_Importer SHALL skip problematic pages and log errors gracefully
8. WHEN importing a 100-page PDF, THE Document_Importer SHALL complete processing in less than 5 seconds on modern hardware

### Requirement 2: Document Import - DOCX

**User Story:** As a self-publisher, I want to import DOCX documents, so that I can convert Word documents into layered book designs.

#### Acceptance Criteria

1. WHEN a user selects a DOCX file via the file picker dialog, THE Document_Importer SHALL load the document using docx-rust
2. WHEN a DOCX is loaded, THE Document_Importer SHALL extract paragraphs and runs with style information (font, size, color)
3. WHEN extracting content, THE Document_Importer SHALL extract embedded images from the media folder
4. WHEN extracting content, THE Document_Importer SHALL parse table structures
5. WHEN extracting content, THE Document_Importer SHALL generate unique layer IDs in format `{type}-{pageIndex}-{seqNumber}`
6. IF a DOCX file has encoding issues, THEN THE Document_Importer SHALL auto-detect and convert text encoding (UTF-8, UTF-16, Latin-1)

### Requirement 3: Layer Data Model

**User Story:** As a developer, I want a consistent layer data structure, so that layers can be reliably created, modified, and serialized.

#### Acceptance Criteria

1. THE Layer_Model SHALL support layer types: text, image, vector, and shape
2. THE Layer_Model SHALL store bounds as x, y, width, height coordinates in PDF points (1/72 inch)
3. THE Layer_Model SHALL store visual properties: visible, locked, zIndex, and opacity (0-1)
4. WHEN a layer is type text, THE Layer_Model SHALL store content, fontFamily, fontSize, fontWeight, color, and textAlign
5. WHEN a layer is type image, THE Layer_Model SHALL store imageUrl, imagePath, and imageData (width, height, colorSpace, dpi)
6. THE Layer_Model SHALL store metadata: sourceType (extracted/manual/imported) and role (background/content/header/footer/annotation)
7. WHEN a layer is type shape, THE Layer_Model SHALL store shapeType, strokeColor, strokeWidth, and fillColor
8. THE Page_Model SHALL store pageIndex, width, height, dpi, layers array, and optional metadata (rotation, mediaBox)
9. WHEN serializing layer data, THE Serializer SHALL produce valid JSON that can be deserialized back to equivalent objects (round-trip property)
10. THE Pretty_Printer SHALL format LayerObject and PageData objects to valid JSON strings
11. FOR ALL valid LayerObject instances, serializing then deserializing SHALL produce an equivalent object (round-trip property)

### Requirement 4: Canvas Rendering

**User Story:** As a book designer, I want to see my document pages rendered on a canvas, so that I can visualize and interact with the layered content.

#### Acceptance Criteria

1. WHEN a page is loaded, THE Canvas_Renderer SHALL render all visible layers on a Fabric.js canvas
2. WHEN rendering text layers, THE Canvas_Renderer SHALL position text at the layer's bounds coordinates with specified font properties
3. WHEN rendering image layers, THE Canvas_Renderer SHALL fetch image data via Tauri v2 custom protocol and position at bounds coordinates
4. THE Canvas_Renderer SHALL maintain 60 FPS rendering performance with up to 50 layers
5. WHEN zoom level changes, THE Canvas_Renderer SHALL scale all layers proportionally using formula: pixelCoordinate = pointCoordinate * (dpi / 72) * zoomLevel
6. THE Canvas_Renderer SHALL support zoom levels from 10% to 300%

### Requirement 5: Layer Selection and Manipulation

**User Story:** As a book designer, I want to select and manipulate layers on the canvas, so that I can reposition and resize content.

#### Acceptance Criteria

1. WHEN a user clicks on a layer in the canvas, THE Layer_Selector SHALL highlight the layer and show bounding box handles using Fabric.js selection events
2. WHEN a user clicks on a layer in the layer panel, THE Layer_Selector SHALL select that layer on the canvas using setActiveObject
3. WHEN a user drags a selected layer, THE Layer_Manipulator SHALL update the layer's x and y coordinates via object:moving event
4. WHEN a user drags corner handles, THE Layer_Manipulator SHALL resize the layer while optionally maintaining aspect ratio via object:scaling event
5. WHEN a user holds Shift and clicks multiple layers, THE Layer_Selector SHALL create an ActiveSelection containing all selected layers
6. WHEN Escape is pressed, THE Layer_Selector SHALL call discardActiveObject to deselect all layers
7. THE Layer_Manipulator SHALL respond to interactions within 100ms latency

### Requirement 6: Layer Z-Index Management

**User Story:** As a book designer, I want to control layer stacking order, so that I can arrange which elements appear above or below others.

#### Acceptance Criteria

1. WHEN a user selects "Bring to Front", THE Z_Index_Manager SHALL set the layer's zIndex to the highest value on the page
2. WHEN a user selects "Send to Back", THE Z_Index_Manager SHALL set the layer's zIndex to the lowest value on the page
3. WHEN a user selects "Move Up", THE Z_Index_Manager SHALL increment the layer's zIndex by one position
4. WHEN a user selects "Move Down", THE Z_Index_Manager SHALL decrement the layer's zIndex by one position
5. WHEN layers are reordered, THE Canvas_Renderer SHALL immediately reflect the new stacking order via requestRenderAll

### Requirement 7: Layer Visibility and Locking

**User Story:** As a book designer, I want to toggle layer visibility and lock layers, so that I can focus on specific elements without accidentally modifying others.

#### Acceptance Criteria

1. WHEN a user clicks the visibility toggle (eye icon), THE Layer_Manager SHALL toggle the layer's visible property
2. WHEN a layer's visible property is false, THE Canvas_Renderer SHALL not render that layer
3. WHEN a user clicks the lock toggle (lock icon), THE Layer_Manager SHALL toggle the layer's locked property
4. WHEN a layer's locked property is true, THE Layer_Manipulator SHALL set selectable=false to prevent selection, dragging, and resizing
5. THE Background_Layer SHALL be locked by default after import

### Requirement 8: Text Layer Editing

**User Story:** As a book designer, I want to edit text content and styling, so that I can modify document text without re-importing.

#### Acceptance Criteria

1. WHEN a user double-clicks a text layer on canvas, THE Text_Editor SHALL enter edit mode using Fabric.js IText enterEditing
2. WHILE in edit mode, THE Text_Editor SHALL allow typing to modify the layer's content property
3. WHEN text properties are changed in the properties panel, THE Text_Editor SHALL update fontFamily, fontSize, fontWeight, color, or textAlign
4. WHEN text content is modified, THE Canvas_Renderer SHALL immediately reflect the changes via requestRenderAll
5. WHEN exiting edit mode, THE Text_Editor SHALL preserve the updated content

### Requirement 9: Image Layer Editing

**User Story:** As a book designer, I want to replace, crop, and adjust images, so that I can customize visual content.

#### Acceptance Criteria

1. WHEN a user selects "Replace Image" from context menu, THE Image_Editor SHALL open a file picker and replace the layer's image data
2. WHEN a user drags crop handles, THE Image_Editor SHALL update the layer's bounds to define new visible area
3. WHEN a user adjusts brightness/contrast/saturation sliders, THE Image_Editor SHALL apply Fabric.js filters to the image layer
4. WHEN a user selects "Export Image", THE Image_Editor SHALL save the layer's image as lossless PNG or TIFF
5. WHEN replacing an image, THE Image_Editor SHALL maintain the layer's original position unless explicitly moved

### Requirement 10: Header/Footer Management

**User Story:** As a book designer, I want to define and apply headers/footers across pages, so that I can maintain consistent page elements.

#### Acceptance Criteria

1. WHEN a user marks a layer as "Header" or "Footer", THE Header_Footer_Manager SHALL set the layer's role property accordingly
2. WHEN a user applies a header/footer to a page range, THE Header_Footer_Manager SHALL duplicate the layer to specified pages
3. WHEN a layer is marked as global header/footer, THE Header_Footer_Manager SHALL apply it to all pages
4. THE Document_Importer SHALL attempt to auto-detect repeated header/footer content during import

### Requirement 11: Page Navigation and Management

**User Story:** As a book designer, I want to navigate between pages and manage page order, so that I can organize my book structure.

#### Acceptance Criteria

1. THE Page_Navigator SHALL display thumbnail previews (100x150px) of all pages in a sidebar panel
2. WHEN a user clicks a thumbnail, THE Page_Navigator SHALL load that page on the canvas
3. WHEN a user drags a thumbnail to a new position, THE Page_Manager SHALL reorder pages accordingly
4. WHEN a user selects "Duplicate Page", THE Page_Manager SHALL create a copy of the page with all layers
5. WHEN a user selects "Delete Page", THE Page_Manager SHALL remove the page after confirmation
6. WHEN a user selects "Add Page", THE Page_Manager SHALL insert a new blank page at the specified position
7. THE Page_Navigator SHALL display current page indicator (e.g., "Page 5 of 100")

### Requirement 12: Export to PDF

**User Story:** As a book designer, I want to export my layered design back to PDF, so that I can produce a final document for printing or distribution.

#### Acceptance Criteria

1. WHEN a user initiates PDF export, THE PDF_Exporter SHALL reconstruct a PDF from all page layers
2. WHEN exporting, THE PDF_Exporter SHALL preserve image quality (lossless)
3. WHEN exporting, THE PDF_Exporter SHALL maintain positional accuracy within ±2 points (1/36 inch)
4. WHEN the "Create Layers" option is enabled, THE PDF_Exporter SHALL create PDF OCG layers for editability
5. WHEN exporting a 100-page document, THE PDF_Exporter SHALL complete in less than 10 seconds
6. THE PDF_Exporter SHALL allow specifying output path, page range, and metadata (author, title, description)

### Requirement 13: Export to DOCX

**User Story:** As a self-publisher, I want to export my design to DOCX, so that I can continue editing in Word or submit to publishers.

#### Acceptance Criteria

1. WHEN a user initiates DOCX export, THE DOCX_Exporter SHALL convert text layers to paragraphs
2. WHEN exporting, THE DOCX_Exporter SHALL embed image layers with original positioning
3. WHEN exporting, THE DOCX_Exporter SHALL include metadata (author, title, creation date)
4. THE DOCX_Exporter SHALL allow specifying output path and page range

### Requirement 14: Project Save and Load

**User Story:** As a book designer, I want to save my work as a project file, so that I can resume editing in future sessions.

#### Acceptance Criteria

1. WHEN a user saves a project, THE Project_Manager SHALL serialize document data to .bookproj format (JSON + binary assets)
2. THE BookProject format SHALL include: version, metadata (title, author, created, modified), document structure, pages, layers, and settings
3. WHEN a user opens a .bookproj file, THE Project_Manager SHALL deserialize and restore the complete document state
4. WHEN saving, THE Project_Manager SHALL optionally include undo/redo history
5. FOR ALL valid BookProject objects, saving then loading SHALL produce an equivalent document state (round-trip property)
6. THE Project_Serializer SHALL format BookProject objects to valid JSON
7. FOR ALL valid BookProject instances, serializing then deserializing SHALL produce an equivalent object (round-trip property)

### Requirement 15: Undo/Redo

**User Story:** As a book designer, I want to undo and redo my actions, so that I can correct mistakes and experiment freely.

#### Acceptance Criteria

1. WHEN a user presses Ctrl+Z (Cmd+Z on macOS), THE History_Manager SHALL undo the last action
2. WHEN a user presses Ctrl+Shift+Z (Cmd+Shift+Z on macOS), THE History_Manager SHALL redo the last undone action
3. THE History_Manager SHALL maintain at least 20 actions in the undo stack
4. WHEN an action is undone, THE Canvas_Renderer SHALL immediately reflect the previous state
5. THE History_Manager SHALL track layer mutations, additions, deletions, and page operations

### Requirement 16: User Interface Layout

**User Story:** As a book designer, I want an intuitive interface layout, so that I can efficiently navigate and edit my documents.

#### Acceptance Criteria

1. THE UI_Layout SHALL display a menu bar with File, Edit, View, and Help menus
2. THE UI_Layout SHALL display a toolbar with Zoom, Undo/Redo, Export, and Settings controls
3. THE UI_Layout SHALL display a Pages Panel on the left sidebar with page thumbnails
4. THE UI_Layout SHALL display the Canvas in the center area
5. THE UI_Layout SHALL display a Layers Panel on the right sidebar with layer list and controls
6. THE UI_Layout SHALL display a Properties Inspector for context-dependent layer properties
7. THE UI_Layout SHALL display a Status Bar showing document status and page count

### Requirement 17: Keyboard Shortcuts

**User Story:** As a power user, I want keyboard shortcuts, so that I can work efficiently without relying on mouse interactions.

#### Acceptance Criteria

1. WHEN Ctrl+O (Cmd+O) is pressed, THE Application SHALL open the document import dialog
2. WHEN Ctrl+E (Cmd+E) is pressed, THE Application SHALL open the export dialog
3. WHEN Delete is pressed with a layer selected, THE Layer_Manager SHALL delete the selected layer
4. WHEN Ctrl+D (Cmd+D) is pressed, THE Layer_Manager SHALL duplicate the selected layer
5. WHEN Ctrl+A (Cmd+A) is pressed, THE Layer_Selector SHALL select all layers on the current page using ActiveSelection
6. WHEN + or - is pressed, THE Canvas_Renderer SHALL zoom in or out
7. WHEN Arrow keys are pressed with a layer selected, THE Layer_Manipulator SHALL move the layer by small increments

### Requirement 18: Image Streaming via Custom Protocol

**User Story:** As a developer, I want efficient image delivery, so that large images load quickly without blocking the UI.

#### Acceptance Criteria

1. WHEN an image layer is rendered, THE Image_Streamer SHALL deliver image data via Tauri v2 custom protocol using tauri::ipc::Response for binary data
2. THE Image_Streamer SHALL support URLs in format `tauri://localhost/image/{image_id}`
3. WHEN fetching via custom protocol, THE Image_Streamer SHALL return binary ArrayBuffer data bypassing JSON serialization
4. THE Image_Streamer SHALL deliver a 10MB image in less than 1 second
5. FOR large images, THE Image_Streamer MAY use Tauri Channel API to stream data in chunks

### Requirement 19: Progress Reporting

**User Story:** As a user, I want to see import progress, so that I know the application is working on large documents.

#### Acceptance Criteria

1. WHILE importing a document, THE Progress_Reporter SHALL emit parse_progress events via Tauri event system
2. THE parse_progress event SHALL include currentPage, totalPages, and status message
3. THE UI SHALL display a progress indicator during document import
4. WHEN import completes, THE Progress_Reporter SHALL emit a completion event

### Requirement 20: Error Handling

**User Story:** As a user, I want clear error messages, so that I can understand and resolve issues.

#### Acceptance Criteria

1. IF a file is not found, THEN THE Error_Handler SHALL display a dialog with path validation message
2. IF a document is corrupted, THEN THE Error_Handler SHALL gracefully degrade (skip problematic pages) and log errors
3. IF memory limits are exceeded (document > 500MB), THEN THE Error_Handler SHALL warn the user
4. IF encoding issues are detected, THEN THE Error_Handler SHALL auto-detect and convert text encoding

### Requirement 21: Cross-Platform Compatibility

**User Story:** As a user, I want to run the application on my operating system, so that I can use it regardless of my platform.

#### Acceptance Criteria

1. THE Application SHALL build and run on Windows 10+
2. THE Application SHALL build and run on macOS 11+
3. THE Application SHALL build and run on Ubuntu 20.04+
4. THE Application SHALL produce platform-specific installers (.msi for Windows, .dmg for macOS, AppImage/.deb for Linux)
