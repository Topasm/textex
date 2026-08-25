use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, State,
};

use crate::{
    error::{AppError, AppResult},
    models::{
        Base64FileResult, DirectoryEntry, OpenFileResult, SaveFileAsResult, SaveFileInput,
        SuccessResult,
    },
    services::{
        filesystem::{self, FileSaveState},
        history::HistoryState,
    },
    state::AppState,
};

/// Opens a native file picker and grants the selected file's canonical parent
/// for one subsequent project activation.
#[tauri::command]
pub async fn open_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<OpenFileResult>> {
    filesystem::open_file(&app, state.inner()).await
}

/// Opens a native folder picker and grants the selected canonical directory
/// for one subsequent project activation.
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
    save_state: State<'_, FileSaveState>,
    history_state: State<'_, HistoryState>,
    content: String,
    file_path: String,
) -> AppResult<SuccessResult> {
    filesystem::save_file(
        state.inner(),
        save_state.inner(),
        history_state.inner(),
        &file_path,
        content,
    )
    .await
}

const BINARY_FILE_PATH_HEADER: &str = "x-textex-file-path";

#[tauri::command]
pub async fn write_file_binary(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> AppResult<SaveFileAsResult> {
    let encoded_path = request
        .headers()
        .get(BINARY_FILE_PATH_HEADER)
        .ok_or_else(|| AppError::InvalidPath("missing binary destination header".to_owned()))?
        .to_str()
        .map_err(|_| AppError::InvalidPath("invalid binary destination header".to_owned()))?;
    let file_path =
        String::from_utf8(URL_SAFE_NO_PAD.decode(encoded_path).map_err(|_| {
            AppError::InvalidPath("invalid binary destination encoding".to_owned())
        })?)
        .map_err(|_| AppError::InvalidPath("binary destination is not UTF-8".to_owned()))?;
    let data = match request.body() {
        InvokeBody::Raw(data) => data.clone(),
        InvokeBody::Json(_) => {
            return Err(AppError::InvalidPath(
                "binary file writes require a raw IPC body".to_owned(),
            ));
        }
    };

    filesystem::write_file_binary(state.inner(), &file_path, data).await
}

#[tauri::command]
pub async fn save_file_as(
    app: AppHandle,
    state: State<'_, AppState>,
    save_state: State<'_, FileSaveState>,
    history_state: State<'_, HistoryState>,
    content: String,
) -> AppResult<Option<SaveFileAsResult>> {
    filesystem::save_file_as(
        &app,
        state.inner(),
        save_state.inner(),
        history_state.inner(),
        content,
    )
    .await
}

#[tauri::command]
pub async fn save_file_batch(
    state: State<'_, AppState>,
    save_state: State<'_, FileSaveState>,
    history_state: State<'_, HistoryState>,
    files: Vec<SaveFileInput>,
) -> AppResult<SuccessResult> {
    filesystem::save_file_batch(
        state.inner(),
        save_state.inner(),
        history_state.inner(),
        files,
    )
    .await
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
pub async fn read_compiled_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> AppResult<Response> {
    let bytes = filesystem::read_compiled_pdf(&app, state.inner(), &file_path).await?;
    Ok(raw_binary_response(bytes))
}

fn raw_binary_response(bytes: Vec<u8>) -> Response {
    Response::new(bytes)
}

#[cfg(test)]
mod tests {
    use tauri::ipc::{InvokeResponseBody, IpcResponse};

    use super::raw_binary_response;

    #[test]
    fn binary_files_use_a_raw_ipc_body_instead_of_json() {
        let body = raw_binary_response(vec![37, 80, 68, 70])
            .body()
            .expect("resolve IPC response");
        assert!(matches!(body, InvokeResponseBody::Raw(bytes) if bytes == b"%PDF"));
    }
}
