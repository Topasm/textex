use tauri::{ipc::Channel, AppHandle, State};

use crate::{
    error::AppResult,
    models::{CompileEvent, CompileRequest, CompileResponse},
    services::compiler,
    state::AppState,
};

/// Compiles one project-root-contained TeX file with the bundled Tectonic
/// executable. Logs and lifecycle updates are streamed through `on_event`.
#[tauri::command]
pub async fn compile_latex(
    app: AppHandle,
    state: State<'_, AppState>,
    request: CompileRequest,
    on_event: Channel<CompileEvent>,
) -> AppResult<CompileResponse> {
    compiler::compile_latex(&app, state.inner(), request, on_event).await
}

/// Requests cancellation of the active compile. The compile owner responds by
/// killing and reaping the child process before completing its command.
#[tauri::command]
pub fn cancel_compile(state: State<'_, AppState>) -> AppResult<bool> {
    compiler::cancel_compile(state.inner())
}
