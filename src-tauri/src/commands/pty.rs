use tauri::{ipc::Channel, State};

use crate::{
    error::AppResult,
    models::{PtyCreateOptions, PtyCreateResult, PtyEvent, SuccessResult},
    services::pty::{self, PtyState},
    state::AppState,
};

#[tauri::command]
pub async fn pty_create(
    project_state: State<'_, AppState>,
    pty_state: State<'_, PtyState>,
    options: PtyCreateOptions,
    on_event: Channel<PtyEvent>,
) -> AppResult<PtyCreateResult> {
    pty::create(project_state.inner(), pty_state.inner(), options, on_event).await
}

#[tauri::command]
pub async fn pty_write(
    pty_state: State<'_, PtyState>,
    id: String,
    data: String,
) -> AppResult<SuccessResult> {
    pty::write(pty_state.inner(), &id, data).await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn pty_resize(
    pty_state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> AppResult<SuccessResult> {
    pty::resize(pty_state.inner(), &id, cols, rows).await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub fn pty_dispose(pty_state: State<'_, PtyState>, id: String) -> AppResult<SuccessResult> {
    pty_state.dispose(&id)?;
    Ok(SuccessResult::ok())
}
