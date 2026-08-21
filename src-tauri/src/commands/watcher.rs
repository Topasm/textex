use tauri::{ipc::Channel, State};

use crate::{
    error::AppResult,
    models::{DirectoryChangeEvent, SuccessResult},
    services::project_index::ProjectIndexState,
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
) -> AppResult<SuccessResult> {
    watcher_state.clear()?;
    Ok(SuccessResult::ok())
}
