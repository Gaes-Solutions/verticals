#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "legacy_sync_storage",
            sql: include_str!("../migrations/001_sync_local.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "scoped_sync_storage",
            sql: include_str!("../migrations/002_scoped_sync.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "catalog_versions",
            sql: include_str!("../migrations/003_catalog_versions.sql"),
            kind: MigrationKind::Up,
        },
    ];
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:gaespos-local.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running GaesSoft POS");
}
