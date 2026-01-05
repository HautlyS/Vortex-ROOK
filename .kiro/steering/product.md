# Product Overview

ROOK is a cross-platform document layer editor for converting PDF and DOCX files into editable, layer-based book designs.

## Core Functionality

- Import PDF/DOCX documents and extract content as discrete layers (text, images, vectors, shapes)
- Visual canvas-based editing with layer manipulation (select, move, resize, reorder)
- Properties panel for adjusting fonts, colors, sizes, and layer roles
- Multi-page document support with page navigation and management
- Export to PDF, DOCX, or native `.bookproj` format
- PDF analysis with OCR support for image-only documents (desktop only)

## Target Users

Book designers, publishers, and content creators who need to edit and repurpose existing documents.

## Deployment Targets

- Desktop app via Tauri (full features including OCR)
- Web app via WASM (subset of features, no native file system or OCR)
