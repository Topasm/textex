use serde_json::json;
use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{
        AiContextEntry, AiCustomProcessRequest, AiGenerateResult, AiProcessRequest,
        AiTerminalRequest, AiTerminalResult, SuccessResult, UserSettings,
    },
    services::{
        ai::{self, AiState},
        filesystem,
        settings::{self, SettingsState},
    },
    state::AppState,
};

async fn current_settings(
    app: &AppHandle,
    ai_state: &AiState,
    settings_state: &SettingsState,
) -> AppResult<UserSettings> {
    let path = settings::settings_path(app)?;
    let mut loaded = settings::load_settings_with_legacy_import(
        settings_state,
        &path,
        &settings::legacy_settings_paths(&path),
    )
    .await?;
    if ai::migrate_legacy_api_key(ai_state, &ai::credential_path(app)?, &mut loaded).await? {
        settings::save_settings(settings_state, &path, json!({"aiApiKey": ""})).await?;
    }
    Ok(loaded)
}

#[tauri::command]
pub async fn ai_generate(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
    input: String,
    provider: String,
    model: String,
) -> AppResult<AiGenerateResult> {
    let provider = ai::parse_provider(&provider)?;
    let settings = current_settings(&app, ai_state.inner(), settings_state.inner()).await?;
    let cli_work_dir = ai::cli_work_dir(&app)?;
    let latex = ai::generate(
        ai_state.inner(),
        &ai::credential_path(&app)?,
        &cli_work_dir,
        &settings,
        &input,
        provider,
        &model,
    )
    .await?;
    Ok(AiGenerateResult { latex })
}

#[tauri::command]
pub async fn ai_save_api_key(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
    provider: String,
    api_key: String,
) -> AppResult<SuccessResult> {
    let provider = ai::parse_provider(&provider)?;
    ai::save_api_key(
        ai_state.inner(),
        &ai::credential_path(&app)?,
        provider,
        &api_key,
    )
    .await?;
    // Keep the secret out of the general settings document.
    settings::save_settings(
        settings_state.inner(),
        &settings::settings_path(&app)?,
        json!({"aiProvider": provider.as_str(), "aiApiKey": ""}),
    )
    .await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn ai_has_api_key(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
    provider: String,
) -> AppResult<bool> {
    let provider = ai::parse_provider(&provider)?;
    current_settings(&app, ai_state.inner(), settings_state.inner()).await?;
    ai::has_api_key(ai_state.inner(), &ai::credential_path(&app)?, provider).await
}

#[tauri::command]
pub async fn ai_process(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
    project_state: State<'_, AppState>,
    request: AiProcessRequest,
) -> AppResult<String> {
    filesystem::validate_existing_project_file(project_state.inner(), &request.file_path).await?;
    filesystem::validate_existing_project_file(
        project_state.inner(),
        &request.light_context.file_path,
    )
    .await?;
    let settings = current_settings(&app, ai_state.inner(), settings_state.inner()).await?;
    let cli_work_dir = ai::cli_work_dir(&app)?;
    ai::process(
        ai_state.inner(),
        &ai::credential_path(&app)?,
        &cli_work_dir,
        &settings,
        &request,
    )
    .await
}

#[tauri::command]
pub async fn ai_process_custom(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
    project_state: State<'_, AppState>,
    request: AiCustomProcessRequest,
) -> AppResult<String> {
    filesystem::validate_existing_project_file(project_state.inner(), &request.file_path).await?;
    filesystem::validate_existing_project_file(
        project_state.inner(),
        &request.light_context.file_path,
    )
    .await?;
    let settings = current_settings(&app, ai_state.inner(), settings_state.inner()).await?;
    let cli_work_dir = ai::cli_work_dir(&app)?;
    ai::process_custom(
        ai_state.inner(),
        &ai::credential_path(&app)?,
        &cli_work_dir,
        &settings,
        &request,
    )
    .await
}

#[tauri::command]
pub async fn ai_update_context(
    app: AppHandle,
    ai_state: State<'_, AiState>,
    settings_state: State<'_, SettingsState>,
    project_state: State<'_, AppState>,
    file_path: String,
    content: String,
) -> AppResult<AiContextEntry> {
    let canonical =
        filesystem::validate_existing_project_file(project_state.inner(), &file_path).await?;
    let canonical = filesystem::path_to_string(&canonical)?;
    let settings = current_settings(&app, ai_state.inner(), settings_state.inner()).await?;
    let cli_work_dir = ai::cli_work_dir(&app)?;
    ai::update_context(
        ai_state.inner(),
        &ai::credential_path(&app)?,
        &cli_work_dir,
        &settings,
        canonical,
        &content,
    )
    .await
}

#[tauri::command]
pub async fn ai_check_cli() -> bool {
    ai::check_cli("claude").await
}

#[tauri::command]
pub async fn ai_check_codex_cli() -> bool {
    ai::check_cli("codex").await
}

#[tauri::command]
pub async fn ai_open_claude_terminal(
    project_state: State<'_, AppState>,
    request: AiTerminalRequest,
) -> AppResult<AiTerminalResult> {
    let work_dir =
        filesystem::resolve_project_directory(project_state.inner(), &request.work_dir).await?;
    ai::open_terminal("claude", &work_dir, request.resume).await
}

#[tauri::command]
pub async fn ai_open_codex_terminal(
    project_state: State<'_, AppState>,
    request: AiTerminalRequest,
) -> AppResult<AiTerminalResult> {
    let work_dir =
        filesystem::resolve_project_directory(project_state.inner(), &request.work_dir).await?;
    ai::open_terminal("codex", &work_dir, request.resume).await
}
