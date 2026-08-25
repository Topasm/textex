use tauri::State;

use crate::{
    error::AppResult,
    models::{GitLogEntry, GitRemoteStatus, GitStatusResult, SuccessResult},
    services::git,
    state::AppState,
};

#[tauri::command]
pub async fn git_is_repo(state: State<'_, AppState>, work_dir: String) -> AppResult<bool> {
    let _project_operation = state.lock_project_operation().await;
    git::is_repository(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_init(state: State<'_, AppState>, work_dir: String) -> AppResult<SuccessResult> {
    let _project_operation = state.lock_project_operation().await;
    git::init_repository(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_status(
    state: State<'_, AppState>,
    work_dir: String,
) -> AppResult<GitStatusResult> {
    let _project_operation = state.lock_project_operation().await;
    git::status(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_remote_status(
    state: State<'_, AppState>,
    work_dir: String,
) -> AppResult<GitRemoteStatus> {
    let _project_operation = state.lock_project_operation().await;
    git::remote_status(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_fetch(state: State<'_, AppState>, work_dir: String) -> AppResult<GitRemoteStatus> {
    let _project_operation = state.lock_project_operation().await;
    git::fetch(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_pull(state: State<'_, AppState>, work_dir: String) -> AppResult<GitRemoteStatus> {
    let _project_operation = state.lock_project_operation().await;
    git::pull(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_push(state: State<'_, AppState>, work_dir: String) -> AppResult<GitRemoteStatus> {
    let _project_operation = state.lock_project_operation().await;
    git::push(state.inner(), &work_dir).await
}

#[tauri::command]
pub async fn git_stage(
    state: State<'_, AppState>,
    work_dir: String,
    file_path: String,
) -> AppResult<SuccessResult> {
    let _project_operation = state.lock_project_operation().await;
    git::stage(state.inner(), &work_dir, &file_path).await
}

#[tauri::command]
pub async fn git_unstage(
    state: State<'_, AppState>,
    work_dir: String,
    file_path: String,
) -> AppResult<SuccessResult> {
    let _project_operation = state.lock_project_operation().await;
    git::unstage(state.inner(), &work_dir, &file_path).await
}

#[tauri::command]
pub async fn git_commit(
    state: State<'_, AppState>,
    work_dir: String,
    message: String,
) -> AppResult<SuccessResult> {
    let _project_operation = state.lock_project_operation().await;
    git::commit(state.inner(), &work_dir, &message).await
}

#[tauri::command]
pub async fn git_file_log(
    state: State<'_, AppState>,
    work_dir: String,
    file_path: String,
) -> AppResult<Vec<GitLogEntry>> {
    let _project_operation = state.lock_project_operation().await;
    git::file_log(state.inner(), &work_dir, &file_path).await
}
