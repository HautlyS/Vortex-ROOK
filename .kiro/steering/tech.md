# Tech Stack

## Frontend (Vue/TypeScript)

- Vue 3.5+ with Composition API and `<script setup>` syntax
- Pinia for state management (Setup Store syntax)
- TypeScript 5.6+ with strict mode
- Vite 6 for bundling
- TailwindCSS 3.4 for styling (dark theme, glassmorphism design)
- Fabric.js for canvas rendering
- PDF.js for web-based PDF parsing
- Vitest for testing (includes fast-check for property-based tests)

## Desktop Backend (Tauri/Rust)

- Tauri 2.x for desktop shell
- lopdf (local fork) for PDF content stream parsing
- pdfium-render for image extraction
- docx-rust for DOCX parsing
- printpdf for PDF export
- font-kit + ttf-parser for font handling
- Optional: tesseract for OCR

## WASM Module (Rust)

- wasm-bindgen for JS interop
- Handles DOCX parsing and export in web mode
- Image caching and layer updates

## Build Commands

```bash
# Frontend development
pnpm dev              # Start Vite dev server
pnpm build            # Production build
pnpm test             # Run Vitest tests
pnpm lint             # ESLint
pnpm format           # Prettier

# WASM module
pnpm wasm:build       # Build WASM (release)
pnpm wasm:dev         # Build WASM (debug)

# Web-only build
pnpm web:dev          # Dev server with WASM
pnpm web:build        # Production web build

# Tauri desktop
pnpm tauri dev        # Desktop dev mode
pnpm tauri build      # Desktop production build

# Rust (in src-tauri or lopdf directories)
cargo build           # Debug build
cargo build --release # Release build
cargo test            # Run tests
cargo clippy          # Linting
```

## Key Dependencies

| Purpose | Frontend | Backend |
|---------|----------|---------|
| PDF parsing | pdfjs-dist | lopdf, pdfium-render |
| DOCX | (via WASM) | docx-rust |
| Canvas | fabric | - |
| State | pinia | - |
| Serialization | - | serde, serde_json |
