use tauri::State;

use crate::{
    error::AppResult,
    models::{OnlineReference, ReferenceAddResult, ResearchConfig},
    services::{
        references::ReferenceIndexState,
        research::{self, ResearchState},
    },
    state::AppState,
};

#[tauri::command]
pub async fn research_search_online(query: String) -> AppResult<Vec<OnlineReference>> {
    research::search_online(&query).await
}

#[tauri::command]
pub async fn research_add_online(
    state: State<'_, AppState>,
    reference_index: State<'_, ReferenceIndexState>,
    research_state: State<'_, ResearchState>,
    reference: OnlineReference,
) -> AppResult<ReferenceAddResult> {
    let _write_guard = research_state.lock().await;
    let result = research::add_online(state.inner(), reference).await?;
    reference_index.invalidate().await;
    Ok(result)
}

#[tauri::command]
pub async fn research_load_config(state: State<'_, AppState>) -> AppResult<ResearchConfig> {
    research::load_config(state.inner()).await
}

#[tauri::command]
pub async fn research_save_config(
    state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    config: ResearchConfig,
) -> AppResult<ResearchConfig> {
    let _write_guard = research_state.lock().await;
    research::save_config(state.inner(), config).await
}
