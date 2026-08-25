use tauri::State;

use crate::{
    error::AppResult,
    models::{
        OnlineReference, ReferenceAddResult, ResearchChatSession, ResearchChatSessionScope,
        ResearchChatSessionSnapshot, ResearchConfig, ResearchProfile,
    },
    services::{
        project_index::ProjectIndexState,
        references::ReferenceIndexState,
        research::{self, ResearchState},
        research_chat_session, research_profile,
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
    project_index: State<'_, ProjectIndexState>,
    reference_index: State<'_, ReferenceIndexState>,
    research_state: State<'_, ResearchState>,
    reference: OnlineReference,
) -> AppResult<ReferenceAddResult> {
    let _write_guard = research_state.lock().await;
    let commit = research::add_online(state.inner(), reference).await?;
    let result = commit.result;
    let refresh_result = if result.inserted {
        project_index
            .refresh_written_file(
                state.inner(),
                &commit.project_root,
                commit.project_epoch,
                &result.file_path,
            )
            .await
    } else {
        Ok(())
    };
    // The bibliography write has already committed. Invalidate even when the
    // project-index delta fails so a same-generation reference cache cannot
    // survive a fallback full index rebuild.
    reference_index.invalidate().await;
    refresh_result?;
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

#[tauri::command]
pub async fn research_profile_load(state: State<'_, AppState>) -> AppResult<ResearchProfile> {
    research_profile::load(state.inner()).await
}

#[tauri::command]
pub async fn research_profile_save(
    state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    profile: ResearchProfile,
) -> AppResult<ResearchProfile> {
    let _write_guard = research_state.lock().await;
    research_profile::save(state.inner(), profile).await
}

#[tauri::command]
pub async fn research_chat_session_load(
    state: State<'_, AppState>,
) -> AppResult<ResearchChatSessionSnapshot> {
    research_chat_session::load(state.inner()).await
}

#[tauri::command]
pub async fn research_chat_session_save(
    state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    scope: ResearchChatSessionScope,
    session: ResearchChatSession,
) -> AppResult<ResearchChatSessionSnapshot> {
    let _write_guard = research_state.lock().await;
    research_chat_session::save(state.inner(), &scope, session).await
}

#[tauri::command]
pub async fn research_chat_session_clear(
    state: State<'_, AppState>,
    research_state: State<'_, ResearchState>,
    scope: ResearchChatSessionScope,
) -> AppResult<ResearchChatSessionSnapshot> {
    let _write_guard = research_state.lock().await;
    research_chat_session::clear(state.inner(), &scope).await
}
