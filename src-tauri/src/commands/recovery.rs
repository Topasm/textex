use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{RecoveryItem, RecoverySnapshot},
    services::recovery::{self, RecoveryState},
    state::AppState,
};

#[tauri::command]
pub async fn save_recovery_snapshot(
    app: AppHandle,
    project_state: State<'_, AppState>,
    recovery_state: State<'_, RecoveryState>,
    file_path: String,
    content: String,
) -> AppResult<()> {
    let _project_operation = project_state.lock_project_operation().await;
    recovery::save_snapshot(
        project_state.inner(),
        recovery_state.inner(),
        &recovery::recovery_root(&app)?,
        &file_path,
        content,
    )
    .await
}

#[tauri::command]
pub async fn list_recovery_snapshots(
    app: AppHandle,
    project_state: State<'_, AppState>,
    recovery_state: State<'_, RecoveryState>,
) -> AppResult<Vec<RecoveryItem>> {
    let _project_operation = project_state.lock_project_operation().await;
    recovery::list(
        project_state.inner(),
        recovery_state.inner(),
        &recovery::recovery_root(&app)?,
    )
    .await
}

#[tauri::command]
pub async fn load_recovery_snapshot(
    app: AppHandle,
    project_state: State<'_, AppState>,
    recovery_state: State<'_, RecoveryState>,
    id: String,
) -> AppResult<RecoverySnapshot> {
    let _project_operation = project_state.lock_project_operation().await;
    recovery::load(
        project_state.inner(),
        recovery_state.inner(),
        &recovery::recovery_root(&app)?,
        &id,
    )
    .await
}

#[tauri::command]
pub async fn discard_recovery_snapshot(
    app: AppHandle,
    project_state: State<'_, AppState>,
    recovery_state: State<'_, RecoveryState>,
    id: String,
) -> AppResult<()> {
    let _project_operation = project_state.lock_project_operation().await;
    recovery::discard(
        project_state.inner(),
        recovery_state.inner(),
        &recovery::recovery_root(&app)?,
        &id,
    )
    .await
}

#[tauri::command]
pub async fn clear_recovery_snapshot(
    app: AppHandle,
    project_state: State<'_, AppState>,
    recovery_state: State<'_, RecoveryState>,
    file_path: String,
) -> AppResult<()> {
    let _project_operation = project_state.lock_project_operation().await;
    recovery::clear_file(
        project_state.inner(),
        recovery_state.inner(),
        &recovery::recovery_root(&app)?,
        &file_path,
    )
    .await
}
