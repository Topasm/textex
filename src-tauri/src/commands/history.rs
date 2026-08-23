use tauri::State;

use crate::{
    error::AppResult,
    models::HistoryItem,
    services::history::{self, HistoryState},
    state::AppState,
};

#[tauri::command]
pub async fn save_history_snapshot(
    project_state: State<'_, AppState>,
    history_state: State<'_, HistoryState>,
    file_path: String,
    content: String,
) -> AppResult<()> {
    let _project_operation = project_state.lock_project_operation().await;
    history::save_snapshot(
        project_state.inner(),
        history_state.inner(),
        &file_path,
        content,
    )
    .await
}

#[tauri::command]
pub async fn get_history_list(
    project_state: State<'_, AppState>,
    history_state: State<'_, HistoryState>,
    file_path: String,
) -> AppResult<Vec<HistoryItem>> {
    let _project_operation = project_state.lock_project_operation().await;
    history::list(project_state.inner(), history_state.inner(), &file_path).await
}

#[tauri::command]
pub async fn load_history_snapshot(
    project_state: State<'_, AppState>,
    history_state: State<'_, HistoryState>,
    file_path: String,
    snapshot_path: String,
) -> AppResult<String> {
    let _project_operation = project_state.lock_project_operation().await;
    history::load(
        project_state.inner(),
        history_state.inner(),
        &file_path,
        &snapshot_path,
    )
    .await
}
