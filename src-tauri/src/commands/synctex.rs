use tauri::State;

use crate::{
    error::AppResult,
    models::{SyncTexForwardResult, SyncTexInverseResult, SyncTexLineMapEntry},
    services::synctex::{self, SyncTexState},
    state::AppState,
};

#[tauri::command]
pub async fn synctex_forward(
    state: State<'_, AppState>,
    sync_state: State<'_, SyncTexState>,
    tex_file: String,
    line: u32,
) -> AppResult<Option<SyncTexForwardResult>> {
    synctex::forward(state.inner(), sync_state.inner(), &tex_file, line).await
}

#[tauri::command]
pub async fn synctex_inverse(
    state: State<'_, AppState>,
    sync_state: State<'_, SyncTexState>,
    tex_file: String,
    page: u32,
    x: f64,
    y: f64,
) -> AppResult<Option<SyncTexInverseResult>> {
    synctex::inverse(state.inner(), sync_state.inner(), &tex_file, page, x, y).await
}

#[tauri::command]
pub async fn synctex_build_line_map(
    state: State<'_, AppState>,
    sync_state: State<'_, SyncTexState>,
    tex_file: String,
) -> AppResult<Vec<SyncTexLineMapEntry>> {
    synctex::line_map(state.inner(), sync_state.inner(), &tex_file).await
}
