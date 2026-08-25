use tauri::{ipc::Channel, AppHandle, State};

use crate::{
    error::AppResult,
    models::{CompileEvent, CompileRequest, CompileResponse},
    services::{
        compiler,
        settings::{self, SettingsState},
        synctex::SyncTexState,
        tectonic_cache,
    },
    state::AppState,
};

/// Compiles one project-root-contained TeX file with the compiler selected in
/// native settings. Logs and lifecycle updates are streamed through `on_event`.
#[tauri::command]
pub async fn compile_latex(
    app: AppHandle,
    state: State<'_, AppState>,
    settings_state: State<'_, SettingsState>,
    synctex_state: State<'_, SyncTexState>,
    request: CompileRequest,
    on_event: Channel<CompileEvent>,
) -> AppResult<CompileResponse> {
    let settings_path = settings::settings_path(&app)?;
    let user_settings = settings::load_settings_with_legacy_import(
        settings_state.inner(),
        &settings_path,
        &settings::legacy_settings_paths(&settings_path),
    )
    .await?;
    let response = compiler::compile_latex(
        &app,
        state.inner(),
        user_settings.latex_engine,
        request,
        on_event,
    )
    .await?;
    synctex_state
        .register_build_output(&response.compiled_file_path, &response.pdf_path)
        .await;
    Ok(response)
}

/// Reports the packaged seed and writable Tectonic cache without accepting a
/// renderer-provided filesystem path.
#[tauri::command]
pub async fn tectonic_cache_status(
    app: AppHandle,
) -> AppResult<tectonic_cache::TectonicCacheStatus> {
    tectonic_cache::status(&app).await
}

/// Atomically replaces only TextEx's app-cache Tectonic directory, then
/// reinstalls a verified packaged seed when one is available.
#[tauri::command]
pub async fn tectonic_cache_reset(
    app: AppHandle,
) -> AppResult<tectonic_cache::TectonicCacheStatus> {
    tectonic_cache::reset(&app).await
}
