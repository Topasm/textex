use tauri::{AppHandle, Manager, State};

use crate::{
    error::AppResult, models::ProjectIndexSnapshot, services::project_index::ProjectIndexState,
    state::AppState,
};

#[tauri::command]
pub async fn get_project_index(
    app: AppHandle,
    project_state: State<'_, AppState>,
    index_state: State<'_, ProjectIndexState>,
) -> AppResult<ProjectIndexSnapshot> {
    let cache_root = app.path().app_cache_dir().ok();
    index_state
        .snapshot_with_cache(project_state.inner(), cache_root.as_deref())
        .await
}
