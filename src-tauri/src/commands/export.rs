use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{ExportFormat, ExportResult},
    services::export,
    state::AppState,
};

#[tauri::command]
pub async fn export_document(
    app: AppHandle,
    state: State<'_, AppState>,
    input_path: String,
    format: String,
) -> AppResult<Option<ExportResult>> {
    export::export_document(&app, state.inner(), &input_path, &format).await
}

#[tauri::command]
pub fn get_export_formats() -> Vec<ExportFormat> {
    export::formats()
}

#[tauri::command]
pub async fn export_overleaf_zip(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<ExportResult>> {
    export::export_overleaf_zip(&app, state.inner()).await
}
