use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{RecentProjectUpdates, UserSettings},
    services::settings::{self, SettingsState},
    state::AppState,
};

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> AppResult<UserSettings> {
    settings::load_settings(&settings::settings_path(&app)?).await
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    partial: Value,
) -> AppResult<UserSettings> {
    settings::save_settings(
        settings_state.inner(),
        &settings::settings_path(&app)?,
        partial,
    )
    .await
}

#[tauri::command]
pub async fn activate_project(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    project_state: State<'_, AppState>,
    project_path: String,
) -> AppResult<String> {
    settings::activate_project(
        settings_state.inner(),
        project_state.inner(),
        &settings::settings_path(&app)?,
        &project_path,
    )
    .await
}

#[tauri::command]
pub async fn add_recent_project(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    project_state: State<'_, AppState>,
    project_path: String,
) -> AppResult<UserSettings> {
    settings::add_recent_project(
        settings_state.inner(),
        project_state.inner(),
        &settings::settings_path(&app)?,
        &project_path,
    )
    .await
}

#[tauri::command]
pub async fn remove_recent_project(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    project_path: String,
) -> AppResult<UserSettings> {
    settings::remove_recent_project(
        settings_state.inner(),
        &settings::settings_path(&app)?,
        &project_path,
    )
    .await
}

#[tauri::command]
pub async fn update_recent_project(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    project_state: State<'_, AppState>,
    project_path: String,
    updates: RecentProjectUpdates,
) -> AppResult<UserSettings> {
    settings::update_recent_project(
        settings_state.inner(),
        project_state.inner(),
        &settings::settings_path(&app)?,
        &project_path,
        updates,
    )
    .await
}
