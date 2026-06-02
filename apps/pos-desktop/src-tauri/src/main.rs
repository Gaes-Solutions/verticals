// GaesSoft POS — Tauri desktop shell.
// Carga el web-pos (WebView del OS) y expone SQLite local vía tauri-plugin-sql
// para que @gaespos/sync-client persista la cola offline y el cache de catálogos.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running GaesSoft POS");
}
