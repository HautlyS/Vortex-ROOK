# Project Structure

```
├── src/                    # Vue frontend
│   ├── main.ts            # App entry, Pinia setup, bridge init
│   ├── App.vue            # Root component with welcome/onboarding
│   ├── bridge/            # Platform abstraction (Tauri vs WASM)
│   │   ├── index.ts       # Main API routing
│   │   ├── environment.ts # Platform detection (isTauri())
│   │   ├── pdfParser.ts   # PDF.js integration for web
│   │   ├── wasm.ts        # WASM module loader
│   │   └── types.ts       # Shared TypeScript types
│   ├── components/        # Vue components
│   │   ├── CanvasComponent.vue  # Fabric.js canvas
│   │   ├── LayersPanel.vue      # Layer list/management
│   │   ├── PropertiesPanel.vue  # Layer property editor
│   │   ├── PagesPanel.vue       # Page thumbnails
│   │   └── Toolbar.vue          # Top toolbar
│   ├── stores/            # Pinia stores
│   │   ├── documentStore.ts     # Document/layer state, undo/redo
│   │   └── uiStore.ts           # UI state (panels, zoom, notifications)
│   ├── models/            # TypeScript data models
│   │   └── layer.ts       # LayerObject, PageData, BookProjectData
│   ├── canvas/            # Canvas management utilities
│   └── styles/            # Global CSS (TailwindCSS)
│
├── src-tauri/             # Tauri Rust backend
│   ├── src/
│   │   ├── lib.rs         # Tauri command registration
│   │   ├── main.rs        # Desktop entry point
│   │   ├── models.rs      # Rust data models (mirrors frontend)
│   │   ├── document_parser.rs   # PDF/DOCX import
│   │   ├── content_parser.rs    # PDF content stream parsing
│   │   ├── layer_processor.rs   # Layer CRUD operations
│   │   ├── export_handler.rs    # PDF/DOCX export
│   │   ├── image_handler.rs     # Image caching/serving
│   │   ├── font_service.rs      # System font discovery
│   │   └── pdf_analyzer.rs      # PDF content analysis
│   └── Cargo.toml
│
├── src-wasm/              # WASM Rust module
│   ├── src/
│   │   ├── lib.rs         # wasm-bindgen exports
│   │   ├── docx_parser.rs # DOCX parsing
│   │   ├── export.rs      # Export functions
│   │   └── models.rs      # WASM-specific models
│   ├── pkg/               # Built WASM output
│   └── Cargo.toml
│
├── lopdf/                 # Local fork of lopdf library
│   └── src/               # PDF manipulation library
│
├── dist/                  # Tauri build output
├── dist-web/              # Web build output
└── package.json           # Frontend dependencies
```

## Architecture Patterns

### Bridge Pattern
The `src/bridge/` module abstracts platform differences. All backend calls go through `bridge/index.ts` which routes to either Tauri commands or WASM functions based on `isTauri()`.

### Data Flow
1. User imports document → `bridge.importDocument()`
2. Backend parses → returns `DocumentData` with `PageData[]` and `LayerObject[]`
3. Frontend stores in `documentStore` (Pinia)
4. Canvas renders layers via Fabric.js
5. Edits update store → optionally sync to backend

### Model Consistency
TypeScript models in `src/models/layer.ts` mirror Rust models in `src-tauri/src/models.rs`. Both use camelCase for JSON serialization.

### Layer Types
- `text`: Extracted or manual text with font properties
- `image`: Raster images with URL reference to cached data
- `vector`: Path-based graphics (strokes, fills)
- `shape`: Geometric primitives (rectangle, circle, line)
