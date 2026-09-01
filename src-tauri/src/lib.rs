use std::sync::{Arc, Mutex};
use tauri::Manager;
mod backup;
mod growth;
mod models;
mod store;
#[cfg(test)]
mod tests;
use models::*;
use store::Store;

struct AppState(Arc<Mutex<Result<Store, String>>>);
async fn with_store<T: Send + 'static>(
    state: &AppState,
    f: impl FnOnce(&mut Store) -> anyhow::Result<T> + Send + 'static,
) -> Result<T, String> {
    let shared = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = shared
            .lock()
            .map_err(|_| "数据服务暂时不可用，请重启枝序".to_string())?;
        let store = guard.as_mut().map_err(|e| e.clone())?;
        f(store).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn bootstrap(state: tauri::State<'_, AppState>) -> Result<Snapshot, String> {
    with_store(&state, |s| {
        s.try_daily_backup();
        s.snapshot(vec![])
    })
    .await
}
#[tauri::command]
async fn save_note(state: tauri::State<'_, AppState>, note: NoteInput) -> Result<Snapshot, String> {
    with_store(&state, move |s| s.save_note(note)).await
}
#[tauri::command]
async fn mutate(state: tauri::State<'_, AppState>, mutation: Mutation) -> Result<Snapshot, String> {
    with_store(&state, move |s| s.mutate(mutation)).await
}
#[tauri::command]
async fn import_image(
    state: tauri::State<'_, AppState>,
    note_id: String,
    data: String,
) -> Result<ImportedImage, String> {
    with_store(&state, move |s| s.import_image(note_id, data)).await
}
#[tauri::command]
async fn import_image_file(
    state: tauri::State<'_, AppState>,
    note_id: String,
    path: String,
) -> Result<ImportedImage, String> {
    with_store(&state, move |s| {
        s.import_image_file(note_id, std::path::Path::new(&path))
    })
    .await
}
#[tauri::command]
async fn export_backup(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Snapshot, String> {
    with_store(&state, move |s| {
        s.create_backup(std::path::Path::new(&path))?;
        s.snapshot(vec![])
    })
    .await
}
#[tauri::command]
async fn restore_backup(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Snapshot, String> {
    with_store(&state, move |s| {
        s.restore_backup(std::path::Path::new(&path))?;
        s.snapshot(vec![])
    })
    .await
}

pub fn run() {
    let builder = tauri::Builder::default();
    // Isolated debug tests must never focus or interfere with a user's running app.
    #[cfg(debug_assertions)]
    let isolated_test = std::env::var_os("GROWLOG_TEST_DATA_DIR").is_some();
    #[cfg(not(debug_assertions))]
    let isolated_test = false;
    let builder = if isolated_test {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
    };
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app.path().app_data_dir().map_err(|e| e.to_string());
            // Only debug builds accept an isolated data directory for desktop tests.
            #[cfg(debug_assertions)]
            let path = std::env::var_os("GROWLOG_TEST_DATA_DIR")
                .map(std::path::PathBuf::from)
                .map(Ok)
                .unwrap_or(path);
            let result = path.and_then(|path| Store::open(path).map_err(|e| format!("{e:#}")));
            #[cfg(debug_assertions)]
            if std::env::var_os("GROWLOG_TEST_DATA_DIR").is_some() {
                if let Ok(store) = &result {
                    app.asset_protocol_scope()
                        .allow_directory(store.content().join("attachments"), true)?;
                }
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            app.manage(AppState(Arc::new(Mutex::new(result))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            save_note,
            mutate,
            import_image,
            import_image_file,
            export_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("枝序启动失败");
}
