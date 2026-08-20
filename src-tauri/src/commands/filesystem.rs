use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{
        Base64FileResult, BinaryFileResult, DirectoryEntry, OpenFileResult, SaveFileAsResult,
        SaveFileInput, SuccessResult,
    },
    services::filesystem,
    state::AppState,
};

/// Opens a native file picker and makes the selected file's canonical parent
/// the trusted root for subsequent filesystem commands.
#[tauri::command]
pub async fn open_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<OpenFileResult>> {
    filesystem::open_file(&app, state.inner()).await
}

/// Opens a native folder picker and makes the selected directory the only
/// project root accessible to subsequent filesystem commands.
#[tauri::command]
pub async fn open_directory(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    filesystem::open_directory(&app, state.inner()).await
}

#[tauri::command]
pub async fn read_directory(
    state: State<'_, AppState>,
    dir_path: String,
) -> AppResult<Vec<DirectoryEntry>> {
    filesystem::read_directory(state.inner(), &dir_path).await
}

#[tauri::command]
pub async fn read_file(state: State<'_, AppState>, file_path: String) -> AppResult<OpenFileResult> {
    filesystem::read_file(state.inner(), &file_path).await
}

#[tauri::command]
pub async fn save_file(
    state: State<'_, AppState>,
    content: String,
    file_path: String,
) -> AppResult<SuccessResult> {
    filesystem::save_file(state.inner(), &file_path, content).await
}

#[tauri::command]
pub async fn save_file_as(
    app: AppHandle,
    state: State<'_, AppState>,
    content: String,
) -> AppResult<Option<SaveFileAsResult>> {
    filesystem::save_file_as(&app, state.inner(), content).await
}

#[tauri::command]
pub async fn save_file_batch(
    state: State<'_, AppState>,
    files: Vec<SaveFileInput>,
) -> AppResult<SuccessResult> {
    filesystem::save_file_batch(state.inner(), files).await
}

#[tauri::command]
pub async fn create_file(
    state: State<'_, AppState>,
    file_path: String,
) -> AppResult<SuccessResult> {
    filesystem::create_file(state.inner(), &file_path).await
}

#[tauri::command]
pub async fn create_directory(
    state: State<'_, AppState>,
    dir_path: String,
) -> AppResult<SuccessResult> {
    filesystem::create_directory(state.inner(), &dir_path).await
}

#[tauri::command]
pub async fn copy_file(
    state: State<'_, AppState>,
    source: String,
    dest: String,
) -> AppResult<SuccessResult> {
    filesystem::copy_file(state.inner(), &source, &dest).await
}

#[tauri::command]
pub async fn rename_path(
    state: State<'_, AppState>,
    source: String,
    destination: String,
) -> AppResult<SuccessResult> {
    filesystem::rename_path(state.inner(), &source, &destination).await
}

#[tauri::command]
pub async fn delete_path(state: State<'_, AppState>, path: String) -> AppResult<SuccessResult> {
    filesystem::delete_path(state.inner(), &path).await
}

#[tauri::command]
pub async fn read_file_base64(
    state: State<'_, AppState>,
    file_path: String,
) -> AppResult<Base64FileResult> {
    filesystem::read_file_base64(state.inner(), &file_path).await
}

#[tauri::command]
pub async fn read_file_binary(
    state: State<'_, AppState>,
    file_path: String,
) -> AppResult<BinaryFileResult> {
    filesystem::read_file_binary(state.inner(), &file_path).await
}
