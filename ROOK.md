FUNCTIONAL APP PROMPT: Book Creation Converter
PDF/DOCX to Layered Book Editor (Vue.js + Tauri + Rust)
I. EXECUTIVE BRIEF
Build a cross-platform desktop application that converts PDF and DOCX documents into an editable, layer-based book design system. The application enables professional book creators to:

Parse & Extract PDF/DOCX documents with lossless image preservation and accurate spatial positioning

Visualize Layers per page (text layer, image layer, header/footer layers, background)

Edit Layered Content with drag-and-drop positioning, text editing, and image manipulation

Export finalized layouts back to PDF or DOCX with preserved layer structure

Target Users: Book designers, self-publishers, document digitization specialists, archivists

Core Promise: Convert static documents into editable, structured, multi-layered designs while preserving layout fidelity and image quality.

II. TECHNICAL ARCHITECTURE
Frontend Stack
Vue.js 3 (Composition API)

Fabric.js 6+ (Canvas-based layer system)

Tauri v2 webview (lightweight alternative to Electron)

TypeScript for type safety

Vite as build tool

Backend Stack
Rust 1.80+ (Tauri core runtime)

pdfium-render 0.8.37+ (PDF parsing with image extraction & bounding boxes)

docx-rust (DOCX document parsing)

tokio (async runtime for parallel document processing)

serde + serde_json (data serialization)

Communication Layer
Tauri IPC Commands (JSON-RPC) for document parsing, layer mutations, metadata operations

Tauri Custom Protocol (binary) for high-performance image streaming (avoids JSON serialization overhead)

Event Emission for real-time UI updates (parse progress, layer changes)

III. CORE FEATURES
A. Document Import
Input Support
PDF Files: Full support via pdfium-render

Multi-page document parsing

Text extraction with character positioning (via PDF text objects)

Image extraction with lossless quality preservation (stores original pixel data)

Accurate bounding box coordinates for all content elements

Support for form fields and annotations

DOCX Files: Full support via docx-rust

Paragraph and run extraction

Embedded image extraction (media folder processing)

Style information preservation (font, size, color)

Table structure parsing

Processing Pipeline
Frontend: File picker dialog → User selects PDF/DOCX

Tauri Command: invoke('import_document', { filePath, fileType })

Rust Backend:

Load document (pdfium-render or docx-rust)

Extract all pages/sections

For each page:

Extract background/image elements with full pixel data

Extract text elements with position coordinates (x, y, width, height)

Extract headers/footers as separate layers

Generate unique layer IDs (format: {type}-{pageIndex}-{seqNumber})

Serialize to structured format (see Data Model, Section V)

Response: Send layered page structure + metadata (total pages, dimensions)

Frontend: Render pages sequentially in canvas, create layer panel

B. Layer-Based Canvas System
Layer Types (Per Page)
Background Layer (type: image)

Full-page background image (e.g., page scan, watermark)

Locked by default; can be toggled visible/hidden

Text Layers (type: text)

Individual text blocks extracted from document

Position-preserved (bounding box coordinates)

Editable: content, font, size, color

Selectable and draggable on canvas

Image Layers (type: image)

Embedded images from original document

Positioned at original coordinates

Resizable while maintaining aspect ratio

Deletable, reorderable via z-index

Header/Footer Layers (type: text or image)

Detected automatically or manually added

Marked as page header/footer via layer metadata

Can be applied to all pages or specific page ranges

Annotation Layers (type: vector)

User-drawn shapes (rectangles, circles, lines)

Text annotations

Non-destructive; overlays content

Canvas Interaction
Selection: Click layer in panel or on canvas → highlight + show bounding box

Positioning: Drag to move, corner handles to resize

Z-Index Management: Right-click context menu or layer panel buttons

"Bring to Front"

"Send to Back"

"Move Up / Move Down"

Visibility Toggle: Eye icon in layer panel

Locking Layers: Prevent accidental edits on critical elements (background, headers)

Multi-select: Shift+click to select multiple layers, batch operations

C. Layer Editing
Text Layer Editing
Double-click text on canvas to enter edit mode

Rich text support: Font family, size, weight, color, alignment

Preserve positioning: Text bounds maintain proportional size to page

OCR Enhancement (optional): If text extraction fails, run Tesseract OCR on extracted region

Image Layer Editing
Replace image: Right-click → "Replace Image" → select file

Crop: Click corner/edge handles, drag to define new bounds

Effects: Brightness, contrast, saturation sliders

Export: Right-click → "Export Image" → save lossless PNG/TIFF

Header/Footer Management
Auto-detect: Scan document for repeated header/footer content

Manual definition: User selects layer → Mark as "Header" / "Footer"

Apply to pages: Dialog to apply header/footer to page range (e.g., pages 3-100)

D. Multi-Page Workflow
Page Navigation
Sidebar panel: Thumbnail view of all pages (100px preview)

Page order: Drag thumbnails to reorder pages

Duplicate page: Right-click → Duplicate (preserves layers)

Delete page: Right-click → Delete (with confirmation)

Page properties: Set page width/height, background color

Layer Sync Across Pages
Global layers: Option to mark header/footer as "global" → applies to all pages

Batch edit: Select multiple pages → edit layer across all selected pages

Layer templates: Save layer configuration as template → apply to new pages

E. Export & Document Output
Export Formats
PDF Export

Reconstruct PDF from layers (using pdfium-render or similar)

Maintain layer structure in PDF (optional: creates PDF layers/OCGs)

Preserve image quality (lossless)

Output file: same directory as source or user-selected location

DOCX Export

Convert layers back to DOCX structure

Text layers → paragraphs

Image layers → embedded images with original positioning

Metadata: author, title, creation date

Project Save (Native Format)

Save layered document as .bookproj (JSON + binary assets)

Enables resuming edits in future sessions

Includes full undo/redo history (optional)

Export Options Dialog
Output format (PDF / DOCX / Project)

Quality settings (image compression, text embedding)

Page range (all pages or specific range)

Metadata (author, title, description)

IV. TAURI COMMAND REFERENCE
Document Operations
import_document
text
invoke('import_document', {
  filePath: string,        // Absolute path to PDF or DOCX
  fileType: 'pdf' | 'docx'
})
→ {
  success: boolean,
  message: string,
  data: {
    totalPages: number,
    pageWidth: number,      // Default page width (pixels)
    pageHeight: number,
    pages: [{
      pageIndex: number,
      width: number,
      height: number,
      layers: LayerObject[]  // Defined in Section V
    }],
    source: {
      fileName: string,
      filePath: string,
      importDate: ISO8601
    }
  }
}
parse_pdf_page
text
invoke('parse_pdf_page', {
  filePath: string,
  pageIndex: number,
  extractImages: boolean,  // If true, extract image data
  extractText: boolean
})
→ PageData
export_document
text
invoke('export_document', {
  format: 'pdf' | 'docx' | 'bookproj',
  pages: PageData[],       // Array of all pages
  outputPath: string,
  metadata: {
    author?: string,
    title?: string,
    description?: string
  },
  options: {
    imageQuality: number,  // 0-100
    compressText: boolean,
    createLayers: boolean  // For PDF: create OCG layers
  }
})
→ {
  success: boolean,
  outputPath: string,
  fileSize: number
}
Layer Operations
update_layer
text
invoke('update_layer', {
  pageIndex: number,
  layerId: string,
  updates: {
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    content?: string,      // For text layers
    visible?: boolean,
    zIndex?: number,
    locked?: boolean,
    ...otherProps
  }
})
→ { success: boolean, updatedLayer: LayerObject }
delete_layer
text
invoke('delete_layer', {
  pageIndex: number,
  layerId: string
})
→ { success: boolean }
reorder_layers
text
invoke('reorder_layers', {
  pageIndex: number,
  layerIds: string[]       // New z-order (top to bottom)
})
→ { success: boolean }
add_layer
text
invoke('add_layer', {
  pageIndex: number,
  layer: LayerObject
})
→ { success: boolean, layerId: string }
Image Operations
get_image_stream
Via Custom Protocol (not JSON-RPC)

text
fetch('image://page_0_bg')  // Returns binary image data
→ ArrayBuffer
// Converted to ImageData → rendered on canvas
replace_image
text
invoke('replace_image', {
  pageIndex: number,
  layerId: string,
  imagePath: string        // Path to new image file
})
→ { success: boolean, imageUrl: string }
Page Operations
add_page
text
invoke('add_page', {
  beforePageIndex?: number,
  duplicateFrom?: number   // Clone existing page
})
→ { success: boolean, newPageIndex: number, pageData: PageData }
delete_page
text
invoke('delete_page', {
  pageIndex: number
})
→ { success: boolean }
reorder_pages
text
invoke('reorder_pages', {
  newOrder: number[]       // Page indices in new order
})
→ { success: boolean }
Progress & Events
Event: parse_progress
Emitted during document import

text
listen('parse_progress', (event) => {
  console.log(event.payload)
  // { currentPage: 5, totalPages: 100, status: 'Extracting images...' }
})
Event: layer_changed
Emitted when any layer is modified

text
listen('layer_changed', (event) => {
  console.log(event.payload)
  // { pageIndex: 0, layerId: 'text-1', action: 'updated', layer: LayerObject }
})
V. DATA MODEL
LayerObject Structure
typescript
interface LayerObject {
  id: string;                        // Unique within page (e.g., "text-0-1")
  type: 'text' | 'image' | 'vector' | 'shape';
  
  // Positioning (relative to page)
  bounds: {
    x: number;                       // X coordinate in page points
    y: number;                       // Y coordinate in page points
    width: number;
    height: number;
  };
  
  // Visual properties
  visible: boolean;
  locked: boolean;
  zIndex: number;
  opacity: number;                   // 0-1
  
  // Type-specific properties
  content?: string;                  // For text layers
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;                    // Hex color
  textAlign?: 'left' | 'center' | 'right';
  
  // For image layers
  imageUrl?: string;                 // Reference to image (e.g., "image://page_0_img_1")
  imagePath?: string;                // Source file path
  imageData?: {
    width: number;
    height: number;
    colorSpace: 'RGB' | 'RGBA' | 'Grayscale';
    dpi: number;
  };
  
  // Metadata
  sourceType?: 'extracted' | 'manual' | 'imported';  // Origin
  role?: 'background' | 'content' | 'header' | 'footer' | 'annotation';
  
  // For vector/shapes
  shapeType?: 'rectangle' | 'circle' | 'line' | 'polygon';
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}

interface PageData {
  pageIndex: number;
  width: number;                     // Page width in points (e.g., 612 for letter)
  height: number;                    // Page height in points (e.g., 792 for letter)
  dpi?: number;                      // Original document DPI
  
  layers: LayerObject[];
  
  metadata?: {
    originalPageIndex?: number;      // If imported from document
    rotation?: 0 | 90 | 180 | 270;
    mediaBox?: [number, number, number, number];  // PDF-specific
  };
}

interface BookProjectData {
  format: 'bookproj';
  version: string;                   // Semantic version
  metadata: {
    title: string;
    author: string;
    created: ISO8601;
    modified: ISO8601;
    description?: string;
  };
  
  document: {
    pageWidth: number;
    pageHeight: number;
    pages: PageData[];
  };
  
  settings: {
    defaultFont?: string;
    defaultFontSize?: number;
    exportQuality?: 'draft' | 'standard' | 'high';
  };
  
  history?: {
    undo: any[];
    redo: any[];
  };
}
Coordinate System
Unit: PDF points (1/72 inch)

Origin: Top-left corner (0, 0)

Mapping to Canvas: Points → pixels (depends on zoom level)

Formula: pixelCoordinate = pointCoordinate * (dpi / 72) * zoomLevel

VI. USER INTERFACE SPECIFICATION
Layout Structure
text
┌─────────────────────────────────────────────────────┐
│ Menu Bar (File, Edit, View, Help)                   │
├─────────────────────────────────────────────────────┤
│ Toolbar (Zoom, Undo/Redo, Export, Settings)        │
├─────────┬─────────────────────────────┬─────────────┤
│ Pages   │                             │ Layers      │
│ Panel   │  Canvas (Fabric.js)         │ Panel       │
│ (left)  │                             │ (right)     │
│         │                             │             │
│ • Page 1│  [Page Preview]             │ ☑ BG (🔒)  │
│ • Page 2│                             │ ☑ Text-1    │
│ • Page 3│  Layer 1                    │ ☑ Image-1   │
│         │  (selected)                 │ ☐ Header    │
│         │                             │ ☑ Footer    │
│         │                             │             │
│         │                             │ Z-order:    │
│         │                             │ ↑ ↓ ⇧ ⇩    │
└─────────┴─────────────────────────────┴─────────────┘
│ Status Bar: "Imported 50 pages | Ready"            │
└─────────────────────────────────────────────────────┘
Components
Pages Panel (Left Sidebar)
Vertical list of page thumbnails (100x150px previews)

Drag to reorder, right-click context menu

Counter: "Page 5 of 100"

Add/Delete buttons at bottom

Canvas (Center)
Fabric.js canvas rendering current page

Zoom controls (fit-to-width, fit-to-height, 100%, custom %)

Rulers (optional, for precise positioning)

Grid (optional, snap-to-grid)

Layer selection by clicking on elements

Layers Panel (Right Sidebar)
Scrollable list of layers for current page

Per-layer controls:

Visibility toggle (eye icon)

Lock toggle (lock icon)

Layer type icon (text, image, shape)

Layer name/label (editable)

Right-click: Delete, Duplicate, Export

Z-order buttons (arrows: Up, Down, To Front, To Back)

Add layer button (+)

Layer search/filter field

Properties Inspector (Docked right of Layers)
Context-dependent properties based on selected layer

Text Layer:

Font family dropdown

Font size spinner

Font weight (normal, bold, italic)

Color picker

Text alignment buttons

Line height, letter spacing

Image Layer:

Dimensions (width, height) with aspect ratio lock

Border/stroke controls

Brightness, contrast, saturation sliders

Replace/Export buttons

Shape Layer:

Shape type dropdown

Fill color, stroke color

Stroke width

Dialogs
Import Document Dialog

File type selector (PDF / DOCX)

File picker

Import options (e.g., OCR for low-quality text)

Export Dialog

Format selector (PDF / DOCX / .bookproj)

Output directory picker

Quality settings slider

Page range selector

Metadata fields (author, title)

Page Properties Dialog

Width, height inputs

Preset sizes (Letter, A4, Custom)

Background color/image

Layer Properties Dialog (Advanced)

Rotation angle

Blend mode

Shadow/effects

Keyboard Shortcuts
Ctrl+O / Cmd+O: Open document

Ctrl+E / Cmd+E: Export

Ctrl+Z / Cmd+Z: Undo

Ctrl+Shift+Z / Cmd+Shift+Z: Redo

Delete: Delete selected layer

Ctrl+D / Cmd+D: Duplicate layer

Ctrl+A / Cmd+A: Select all layers

Escape: Deselect all

Ctrl+G / Cmd+G: Group layers (future feature)

+ / -: Zoom in/out

Ctrl+1 / Cmd+1: Zoom 100%

Arrow keys: Move selected layer (with modifiers for larger increments)

VII. TECHNICAL REQUIREMENTS
Frontend (Vue.js)
Dependencies
json
{
  "vue": "^3.4.0",
  "fabric": "^6.4.0",
  "tauri": "^2.0.0",
  "vite": "^5.0.0"
}
Key Modules
CanvasManager.ts: Fabric.js initialization, layer rendering, interaction handling

DocumentStore.ts: Pinia store for document state (pages, layers, selections)

LayerPanel.vue: Layer list UI component with drag-and-drop

CanvasComponent.vue: Fabric canvas wrapper and zoom controls

PropertiesPanel.vue: Context-aware property editor

PageThumbnails.vue: Page navigation and reordering

State Management
Pinia store structure:

documentStore: Loaded document data, current page, undo/redo stack

uiStore: Selected layers, zoom level, panel visibility

settingsStore: User preferences, export defaults

Backend (Rust)
Dependencies
text
[dependencies]
tauri = { version = "2.0", features = ["shell-open", "fs-all", "dialog-all"] }
pdfium-render = "0.8.37"
docx-rust = "0.1"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
image = "0.24"              # Image format detection
uuid = { version = "1.0", features = ["v4", "serde"] }
log = "0.4"
env_logger = "0.10"
Key Modules
document_parser.rs: PDF/DOCX parsing logic

parse_pdf(): PDF → PageData[]

parse_docx(): DOCX → PageData[]

extract_images(): Lossless image extraction with bounding boxes

extract_text(): OCR fallback for embedded images

export_handler.rs: Export logic

export_to_pdf(): Reconstruct PDF from layers

export_to_docx(): DOCX serialization

save_project(): .bookproj JSON + asset bundling

image_handler.rs: Image processing

extract_image_data(): Get raw pixel data

resize_image(): Maintain aspect ratio

optimize_image(): Compression options

layer_processor.rs: Layer operations

update_layer(): Mutation handler

reorder_layers(): Z-index management

apply_layer_to_pages(): Batch operations

commands.rs: Tauri command handlers (tie together above modules)

Performance Targets
Import: < 5 seconds for 100-page PDF (on modern hardware)

Canvas render: 60 FPS (Fabric.js native, optimized layer count)

Image delivery: < 1 second for 10MB image via custom protocol

Export: < 10 seconds for 100-page document

Error Handling
File not found: Show dialog with path validation

Corrupt document: Graceful degradation (skip problematic pages, log errors)

Memory limits: Warn if document > 500 MB, allow streaming of large documents

Encoding issues: Auto-detect and convert text encoding (UTF-8, UTF-16, Latin-1)

VIII. DEVELOPMENT WORKFLOW
Phase 1: Core Architecture (Weeks 1-2)
Set up Tauri + Vue.js scaffold

Implement Fabric.js canvas integration

Create basic layer data model

Design Tauri IPC command structure

Phase 2: PDF Import (Weeks 3-4)
Integrate pdfium-render

Implement page extraction

Add text + image extraction with bounding boxes

Build basic layer panel UI

Phase 3: DOCX Support (Weeks 5-6)
Integrate docx-rust

DOCX parsing and layer generation

Embedded image extraction

Phase 4: Canvas Editing (Weeks 7-8)
Layer selection and manipulation

Text editing on canvas

Image replacement and cropping

Z-index management UI

Phase 5: Export & Polish (Weeks 9-10)
PDF/DOCX export

Project save (.bookproj)

Undo/redo stack

Performance optimization

Phase 6: Testing & Packaging (Weeks 11-12)
Unit tests (Rust modules)

Integration tests (IPC commands)

UI/UX testing

Cross-platform builds (Windows, macOS, Linux)

IX. SUCCESS CRITERIA
Functional Requirements
✅ Import 100+ page PDF/DOCX without crashes

✅ Extract and display text + images with accurate positioning

✅ Render multi-layer pages at 60 FPS on Fabric.js canvas

✅ Edit layer properties (position, text, visibility) with real-time feedback

✅ Export to PDF/DOCX with layout preservation

✅ Save/load .bookproj projects

Performance Requirements
✅ Import: < 5 sec (100 pages)

✅ Canvas: 60 FPS render, < 100ms interaction latency

✅ Export: < 10 sec (100 pages)

Quality Requirements
✅ Zero data loss during import/export

✅ Lossless image quality (bitwise identical)

✅ Positional accuracy within ±2 points (1/36 inch)

✅ Cross-platform compatibility (Windows 10+, macOS 11+, Ubuntu 20.04+)

X. FUTURE ENHANCEMENTS
Phase 2 (Post-MVP)
Collaborative editing: Real-time multi-user layer editing via WebSockets

Cloud sync: Auto-save to cloud storage (AWS S3, Google Drive)

AI-powered layout analysis: Auto-detect headers, footers, and content blocks

Version control: Git-like commit history for document iterations

Template library: Pre-designed page templates for common book formats

Advanced OCR: Integration with Tesseract or EasyOCR for text recognition

3D preview: Export to 3D book model for mockup visualization

Print automation: Connect to print-on-demand APIs (Blurb, KDP)

Accessibility: ARIA labels, keyboard navigation, screen reader support

Plugins API: Allow third-party extensions (custom exporters, filters)

XI. DOCUMENTATION REQUIREMENTS
For Developers
Architecture Guide: Component interaction, data flow diagrams

API Reference: All Tauri commands and event listeners

Rust Module Documentation: docstrings for all public functions

Setup Guide: Clone → cargo build → npm install → npm run tauri dev

For Users
Quick Start: Import first document, create new layer, export

Tutorials: Common workflows (book creation, document digitization)

Troubleshooting: FAQ, error messages, performance tuning

Video Walkthroughs: 5-10 minute demo of each major feature

XII. TESTING STRATEGY
Unit Tests
PDF parsing (corner cases: malformed, encrypted, embedded fonts)

Layer data model mutations

Coordinate transformations

Export serialization

Integration Tests
Full import → edit → export workflows

IPC command round-trips

Image streaming via custom protocol

Multi-page batch operations

UI Tests
Canvas rendering consistency

Layer panel interactions

Keyboard shortcuts

Responsive layout (various window sizes)

Performance Tests
Document import time (various file sizes)

Canvas FPS with 50+ layers

Memory usage profiling

Image decode/encode benchmarks

XIII. DEPLOYMENT & DISTRIBUTION
Build Targets
Windows: .msi installer (via WiX Toolset)

macOS: .dmg bundle (code-signed)

Linux: AppImage + .deb package

Distribution Channels
GitHub Releases (primary)

Website download page

Package managers (winget, brew, snap)

Optional: Microsoft Store, Mac App Store

Update Strategy
Tauri auto-updater: Check for new versions weekly

Semantic versioning (MAJOR.MINOR.PATCH)

Release notes with changelog and migration guides

XIV. ACCEPTANCE CHECKLIST
Before considering MVP complete, verify:

 Import PDF with 50+ pages in < 5 seconds

 Import DOCX with embedded images

 Display all extracted layers on Fabric.js canvas

 Edit text content, reposition, resize layers

 Export to PDF with preserved layout

 Export to DOCX with embedded images

 Save/load .bookproj format

 Undo/redo 20+ actions without crashes

 UI responds to layer changes in < 200ms

 Cross-platform builds succeed (Windows, macOS, Linux)

 Documentation complete: dev guide + user manual

 Zero critical bugs in integration tests

XV. APPENDIX: CODE EXAMPLES
Vue 3 Component: CanvasComponent.vue
text
<template>
  <div class="canvas-wrapper">
    <canvas ref="fabricCanvas" />
    <div class="zoom-controls">
      <button @click="zoomFit">Fit</button>
      <button @click="zoomOut">−</button>
      <span>{{ Math.round(zoom * 100) }}%</span>
      <button @click="zoomIn">+</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Canvas as FabricCanvas } from 'fabric'
import { useDocumentStore } from '@/stores/documentStore'

const fabricCanvas = ref<HTMLCanvasElement>(null)
const canvas = ref<FabricCanvas>(null)
const zoom = ref(1)

const store = useDocumentStore()
const currentPage = computed(() => store.currentPage)

onMounted(async () => {
  canvas.value = new FabricCanvas(fabricCanvas.value!, {
    width: 800,
    height: 1000,
    backgroundColor: '#f5f5f5'
  })

  // Render current page layers
  renderPage(currentPage.value)

  canvas.value.on('object:selected', (e) => {
    const layer = e.target as any
    store.selectLayer(layer.layerId)
  })
})

const renderPage = (page: PageData) => {
  canvas.value?.clear()
  
  page.layers.forEach(layer => {
    if (layer.type === 'text') {
      const fabricText = new fabric.Text(layer.content, {
        left: layer.bounds.x,
        top: layer.bounds.y,
        fontSize: layer.fontSize,
        fontFamily: layer.fontFamily,
        fill: layer.color
      })
      fabricText.layerId = layer.id  // Attach metadata
      canvas.value?.add(fabricText)
    } else if (layer.type === 'image') {
      fabric.Image.fromURL(layer.imageUrl, img => {
        img.set({
          left: layer.bounds.x,
          top: layer.bounds.y,
          width: layer.bounds.width,
          height: layer.bounds.height
        })
        img.layerId = layer.id
        canvas.value?.add(img)
      })
    }
  })
}

const zoomIn = () => { zoom.value = Math.min(zoom.value + 0.1, 3) }
const zoomOut = () => { zoom.value = Math.max(zoom.value - 0.1, 0.1) }
const zoomFit = () => { zoom.value = 1 }
</script>
Rust Command: parse_document
rust
#[tauri::command]
async fn import_document(
    file_path: String,
    file_type: String,
    app_handle: tauri::AppHandle
) -> Result<DocumentResponse, String> {
    match file_type.as_str() {
        "pdf" => {
            let pdfium = Pdfium::default();
            let document = pdfium
                .load_pdf_from_file(&file_path, None)
                .map_err(|e| e.to_string())?;

            let mut pages = Vec::new();
            
            for (page_index, page) in document.pages().iter().enumerate() {
                let mut layers = Vec::new();
                
                // Extract background image
                let render_config = PdfRenderConfig::new()
                    .set_target_width(800)
                    .set_maximum_height(1000);
                
                let bitmap = page.render_with_config(&render_config)
                    .map_err(|e| e.to_string())?
                    .as_image()
                    .into_rgb8();
                
                let bg_layer = LayerObject {
                    id: format!("bg-{}", page_index),
                    type_: "image".to_string(),
                    bounds: Bounds { x: 0.0, y: 0.0, width: 800.0, height: 1000.0 },
                    image_url: format!("image://page_{}_bg", page_index),
                    // ... other fields
                };
                layers.push(bg_layer);
                
                // Extract text layers
                for text_obj in page.text()?.iter() {
                    let text_layer = LayerObject {
                        id: format!("text-{}-{}", page_index, text_obj.char_index()),
                        type_: "text".to_string(),
                        content: text_obj.text().to_string(),
                        bounds: text_obj.bounds(), // Bounding box from PDF
                        // ... other fields
                    };
                    layers.push(text_layer);
                }
                
                pages.push(PageData {
                    page_index,
                    width: page.width(),
                    height: page.height(),
                    layers,
                });
            }
            
            Ok(DocumentResponse {
                success: true,
                data: pages,
            })
        },
        "docx" => {
            // Similar logic for DOCX
            todo!()
        },
        _ => Err("Unsupported file type".to_string())
    }
}
