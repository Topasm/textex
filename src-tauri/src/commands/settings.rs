use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::{
    error::AppResult,
    models::{RecentProjectUpdates, UserSettings},
    services::{
        ai::{self, AiState},
        filesystem,
        lsp::LspState,
        project_index::ProjectIndexState,
        project_session,
        pty::PtyState,
        settings::{self, SettingsState},
        watcher::DirectoryWatcherState,
    },
    state::AppState,
};

#[tauri::command]
pub async fn load_settings(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
) -> AppResult<UserSettings> {
    let path = settings::settings_path(&app)?;
    let mut loaded = settings::load_settings_with_legacy_import(
        settings_state.inner(),
        &path,
        &settings::legacy_settings_paths(&path),
    )
    .await?;
    if ai::migrate_legacy_api_key(ai_state.inner(), &ai::credential_path(&app)?, &mut loaded)
        .await?
    {
        settings::save_settings(settings_state.inner(), &path, json!({"aiApiKey": ""})).await?;
    }
    Ok(loaded)
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    mut partial: Value,
) -> AppResult<UserSettings> {
    // API keys use the private native credential store and are never accepted
    // from renderer-controlled settings state.
    if let Some(settings) = partial.as_object_mut() {
        settings.remove("aiApiKey");
    }
    settings::save_settings(
        settings_state.inner(),
        &settings::settings_path(&app)?,
        partial,
    )
    .await
}

#[tauri::command]
pub async fn activate_project(app: AppHandle, project_path: String) -> AppResult<String> {
    let settings_state = app.state::<SettingsState>();
    let project_state = app.state::<AppState>();
    let watcher_state = app.state::<DirectoryWatcherState>();
    let index_state = app.state::<ProjectIndexState>();
    let pty_state = app.state::<PtyState>();
    let lsp_state = app.state::<LspState>();
    let canonical = settings::authorize_project_activation(
        settings_state.inner(),
        project_state.inner(),
        &settings::settings_path(&app)?,
        &project_path,
    )
    .await?;
    let display_path = filesystem::path_to_string(&canonical)?;
    project_session::activate(
        project_state.inner(),
        watcher_state.inner(),
        index_state.inner(),
        pty_state.inner(),
        lsp_state.inner(),
        canonical,
    )
    .await?;
    Ok(display_path)
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
