use tauri::State;

use crate::{
    error::AppResult,
    models::{ResearchSourceGitResult, ResearchSourceIndex},
    services::{research::ResearchState, research_source::ResearchSourceState},
    state::AppState,
};

#[tauri::command]
pub async fn research_source_index(
    project_state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    source_state: State<'_, ResearchSourceState>,
    resource_id: String,
    local_path: String,
) -> AppResult<ResearchSourceIndex> {
    let _profile_guard = research_state.lock().await;
    source_state
        .index(project_state.inner(), &resource_id, &local_path)
        .await
}

#[tauri::command]
pub async fn research_source_clone(
    project_state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    source_state: State<'_, ResearchSourceState>,
    resource_id: String,
) -> AppResult<ResearchSourceGitResult> {
    let _profile_guard = research_state.lock().await;
    source_state
        .clone_repository(project_state.inner(), &resource_id)
        .await
}

#[tauri::command]
pub async fn research_source_fetch(
    project_state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    source_state: State<'_, ResearchSourceState>,
    resource_id: String,
) -> AppResult<ResearchSourceGitResult> {
    let _profile_guard = research_state.lock().await;
    source_state
        .fetch_repository(project_state.inner(), &resource_id)
        .await
}
