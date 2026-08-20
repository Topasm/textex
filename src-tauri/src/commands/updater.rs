use tauri::{ipc::Channel, AppHandle, State};

use crate::{
    error::AppResult,
    models::{SuccessResult, UpdateDownloadEvent, UpdateMetadata},
    services::updater::{self, AppUpdaterState},
};

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    state: State<'_, AppUpdaterState>,
) -> AppResult<Option<UpdateMetadata>> {
    updater::check(&app, state.inner()).await
}

#[tauri::command]
pub async fn download_and_install_update(
    state: State<'_, AppUpdaterState>,
    on_event: Channel<UpdateDownloadEvent>,
) -> AppResult<SuccessResult> {
    updater::download_and_install(state.inner(), on_event).await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub fn restart_app(app: AppHandle) -> AppResult<SuccessResult> {
    app.request_restart();
    Ok(SuccessResult::ok())
}
