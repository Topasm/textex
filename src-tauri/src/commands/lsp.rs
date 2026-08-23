use serde_json::Value;
use tauri::{ipc::Channel, AppHandle, State};

use crate::{
    error::AppResult,
    models::{LspEvent, LspStatusResult, SuccessResult},
    services::lsp::{self, LspState},
    state::AppState,
};

#[tauri::command]
pub async fn lsp_start(
    app: AppHandle,
    project_state: State<'_, AppState>,
    lsp_state: State<'_, LspState>,
    workspace_root: String,
    on_event: Channel<LspEvent>,
) -> AppResult<SuccessResult> {
    let success = lsp::start(
        &app,
        project_state.inner(),
        lsp_state.inner(),
        &workspace_root,
        on_event,
    )
    .await?;
    Ok(SuccessResult { success })
}

#[tauri::command]
pub async fn lsp_stop(lsp_state: State<'_, LspState>) -> AppResult<SuccessResult> {
    lsp_state.stop().await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn lsp_send(lsp_state: State<'_, LspState>, message: Value) -> AppResult<SuccessResult> {
    lsp_state.send(message).await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn lsp_status(lsp_state: State<'_, LspState>) -> AppResult<LspStatusResult> {
    Ok(LspStatusResult {
        status: lsp_state.status().await.as_str(),
    })
}
