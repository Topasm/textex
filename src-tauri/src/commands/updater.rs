use tauri::{ipc::Channel, AppHandle, State};

use crate::{
    error::{AppError, AppResult},
    models::{SuccessResult, UpdateDownloadEvent, UpdateMetadata},
    services::updater::{self, AppUpdaterState},
    state::AppState,
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
    updater::download_and_stage(state.inner(), on_event).await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn restart_app(
    app: AppHandle,
    project_state: State<'_, AppState>,
    updater_state: State<'_, AppUpdaterState>,
) -> AppResult<SuccessResult> {
    // The renderer owns unsaved editor buffers, but a successful shared exit
    // preflight always deactivates the native project session. Holding the
    // transition guard makes that state a stable prerequisite for install.
    let _transition = project_state.lock_project_transition().await;
    ensure_project_inactive(project_state.inner())?;
    updater::install_and_restart(&app, updater_state.inner()).await?;
    Ok(SuccessResult::ok())
}

fn ensure_project_inactive(project_state: &AppState) -> AppResult<()> {
    match project_state.project_root() {
        Ok(_) => Err(AppError::Updater(
            "close the active project before installing the update".to_owned(),
        )),
        Err(AppError::ProjectNotOpen) => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_install_requires_a_deactivated_project_session() {
        let state = AppState::default();
        assert!(ensure_project_inactive(&state).is_ok());

        let project = tempfile::tempdir().unwrap();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();
        assert!(ensure_project_inactive(&state).is_err());
    }
}
