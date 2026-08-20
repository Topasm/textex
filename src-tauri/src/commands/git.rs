use tauri::State;

use crate::{
    error::AppResult,
    models::{GitLogEntry, GitStatusResult, SuccessResult},
    services::git,
    state::AppState,
};

#[tauri::command]
pub async fn git_is_repo(state: State<'_, AppState>, work_dir: String) -> AppResult<bool> {
    git::is_repository(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_init(state: State<'_, AppState>, work_dir: String) -> AppResult<SuccessResult> {
    git::init_repository(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_status(
    state: State<'_, AppState>,
    work_dir: String,
) -> AppResult<GitStatusResult> {
    git::status(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_stage(
    state: State<'_, AppState>,
    work_dir: String,
    file_path: String,
) -> AppResult<SuccessResult> {
    git::stage(state.inner(), &work_dir, &file_path).await
}

#[tauri::command]
pub async fn git_unstage(
    state: State<'_, AppState>,
    work_dir: String,
    file_path: String,
) -> AppResult<SuccessResult> {
    git::unstage(state.inner(), &work_dir, &file_path).await
}

#[tauri::command]
pub async fn git_commit(
    state: State<'_, AppState>,
    work_dir: String,
    message: String,
) -> AppResult<SuccessResult> {
    git::commit(state.inner(), &work_dir, &message).await
}

#[tauri::command]
pub async fn git_diff(state: State<'_, AppState>, work_dir: String) -> AppResult<String> {
    git::diff(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_log(state: State<'_, AppState>, work_dir: String) -> AppResult<Vec<GitLogEntry>> {
    git::log(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_file_log(
    state: State<'_, AppState>,
    work_dir: String,
    file_path: String,
) -> AppResult<Vec<GitLogEntry>> {
    git::file_log(state.inner(), &work_dir, &file_path).await
}
