use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{CitationGroup, SuccessResult},
    services::project_data::{self, ProjectDataState},
    state::AppState,
};

#[tauri::command]
pub async fn load_citation_groups(
    app: AppHandle,
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<Vec<CitationGroup>> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_citation_groups(
        &app,
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
    )
    .await
}

#[tauri::command]
pub async fn save_citation_groups(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    groups: Vec<CitationGroup>,
) -> AppResult<SuccessResult> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::save_citation_groups(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        groups,
    )
    .await?;
    Ok(SuccessResult::ok())
}
