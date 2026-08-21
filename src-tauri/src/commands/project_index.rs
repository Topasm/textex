use tauri::State;

use crate::{
    error::AppResult, models::ProjectIndexSnapshot, services::project_index::ProjectIndexState,
    state::AppState,
};

#[tauri::command]
pub async fn get_project_index(
    project_state: State<'_, AppState>,
    index_state: State<'_, ProjectIndexState>,
) -> AppResult<ProjectIndexSnapshot> {
    index_state.snapshot(project_state.inner()).await
}
