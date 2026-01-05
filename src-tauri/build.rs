fn main() {
    // Tell the linker where to find pdfium
    #[cfg(target_os = "linux")]
    println!("cargo:rustc-link-search=native=lib/pdfium-v8-linux/lib");
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-search=native=lib/pdfium-v8-win/lib");
    
    tauri_build::build()
}
