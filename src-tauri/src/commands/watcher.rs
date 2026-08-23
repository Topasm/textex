use tauri::{ipc::Channel, State};

use crate::{
    error::AppResult,
    models::{DirectoryChangeEvent, SuccessResult},
    services::lsp::LspState,
    services::project_index::ProjectIndexState,
    services::project_session,
    services::pty::PtyState,
    services::watcher::{self, DirectoryWatcherState},
    state::AppState,
};

#[tauri::command]
pub async fn watch_directory(
    project_state: State<'_, AppState>,
    watcher_state: State<'_, DirectoryWatcherState>,
    index_state: State<'_, ProjectIndexState>,
    dir_path: String,
    on_event: Channel<DirectoryChangeEvent>,
) -> AppResult<SuccessResult> {
    watcher::watch_directory(
        project_state.inner(),
        watcher_state.inner(),
        index_state.inner(),
        &dir_path,
        on_event,
    )
    .await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub fn unwatch_directory(
    watcher_state: State<'_, DirectoryWatcherState>,
    index_state: State<'_, ProjectIndexState>,
) -> AppResult<SuccessResult> {
    watcher_state.clear()?;
    index_state.clear_event_channel()?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn deactivate_project(
    project_state: State<'_, AppState>,
    watcher_state: State<'_, DirectoryWatcherState>,
    index_state: State<'_, ProjectIndexState>,
    pty_state: State<'_, PtyState>,
    lsp_state: State<'_, LspState>,
) -> AppResult<SuccessResult> {
    project_session::deactivate(
        project_state.inner(),
        watcher_state.inner(),
        index_state.inner(),
        pty_state.inner(),
        lsp_state.inner(),
    )
    .await?;
    Ok(SuccessResult::ok())
}
