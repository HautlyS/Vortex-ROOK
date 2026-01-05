//! Export Handler for WASM
//! Generates export files in memory as byte arrays

use crate::models::*;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub fn export_bookproj(
    pages: &[PageData],
    metadata: &DocumentMetadata,
) -> Result<Vec<u8>, String> {
    let project = BookProjectData {
        format: "bookproj".to_string(),
        version: "1.0.0".to_string(),
        metadata: metadata.clone(),
        document: DocumentData {
            page_width: pages.first().map(|p| p.width).unwrap_or(612.0),
            page_height: pages.first().map(|p| p.height).unwrap_or(792.0),
            pages: pages.to_vec(),
        },
        settings: ProjectSettings::default(),
    };

    serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())
}

pub fn export_docx(
    pages: &[PageData],
    _metadata: &DocumentMetadata,
) -> Result<Vec<u8>, String> {
    let mut buffer = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(&mut buffer);
    let options = SimpleFileOptions::default();

    // [Content_Types].xml
    zip.start_file("[Content_Types].xml", options).map_err(|e| e.to_string())?;
    zip.write_all(CONTENT_TYPES.as_bytes()).map_err(|e| e.to_string())?;

    // _rels/.rels
    zip.start_file("_rels/.rels", options).map_err(|e| e.to_string())?;
    zip.write_all(RELS.as_bytes()).map_err(|e| e.to_string())?;

    // word/_rels/document.xml.rels
    zip.start_file("word/_rels/document.xml.rels", options).map_err(|e| e.to_string())?;
    zip.write_all(DOC_RELS.as_bytes()).map_err(|e| e.to_string())?;

    // word/document.xml
    let doc_content = generate_document_xml(pages);
    zip.start_file("word/document.xml", options).map_err(|e| e.to_string())?;
    zip.write_all(doc_content.as_bytes()).map_err(|e| e.to_string())?;

    // word/styles.xml
    zip.start_file("word/styles.xml", options).map_err(|e| e.to_string())?;
    zip.write_all(STYLES.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(buffer.into_inner())
}

fn generate_document_xml(pages: &[PageData]) -> String {
    let mut body = String::new();
    
    for page in pages {
        for layer in &page.layers {
            if layer.layer_type == "text" {
                if let Some(content) = &layer.content {
                    body.push_str(&format!(
                        r#"<w:p><w:r><w:t>{}</w:t></w:r></w:p>"#,
                        escape_xml(content)
                    ));
                }
            }
        }
        // Page break between pages
        body.push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#);
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>{}</w:body>
</w:document>"#,
        body
    )
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;

const RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

const DOC_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>"#;
