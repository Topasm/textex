use crate::{
    error::AppResult,
    services::{
        lsp::LspState, project_index::ProjectIndexState, pty::PtyState,
        watcher::DirectoryWatcherState,
    },
    state::AppState,
};

/// Ends the native project session. Advancing the project epoch first makes
/// every in-flight project-scoped operation stale before native resources are
/// released.
pub async fn deactivate(
    project_state: &AppState,
    watcher_state: &DirectoryWatcherState,
    index_state: &ProjectIndexState,
    pty_state: &PtyState,
    lsp_state: &LspState,
) -> AppResult<()> {
    let previous_project = project_state.clear_project_root()?;

    // Run every cleanup even if one independently reports a poisoned lock or
    // process-shutdown error, then return the first error to the renderer.
    let compile_result = project_state.cancel_compilation().map(|_| ());
    let watcher_result = watcher_state.clear().map(|_| ());
    let index_result = previous_project
        .as_ref()
        .map_or(Ok(()), |(root, epoch)| index_state.invalidate(root, *epoch));
    let notification_result = index_state.clear_event_channel();
    let pty_result = pty_state.dispose_all();
    let lsp_result = lsp_state.stop().await;

    compile_result?;
    watcher_result?;
    index_result?;
    notification_result?;
    pty_result?;
    lsp_result
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::{
        error::AppError,
        services::{
            lsp::LspState, project_index::ProjectIndexState, pty::PtyState,
            watcher::DirectoryWatcherState,
        },
        state::AppState,
    };

    use super::deactivate;

    #[tokio::test]
    async fn deactivation_removes_native_project_authority() {
        let project_state = AppState::default();
        project_state
            .set_project_root(PathBuf::from("/project"))
            .expect("activate project");

        deactivate(
            &project_state,
            &DirectoryWatcherState::default(),
            &ProjectIndexState::default(),
            &PtyState::default(),
            &LspState::default(),
        )
        .await
        .expect("deactivate project");

        assert!(matches!(
            project_state.project_root(),
            Err(AppError::ProjectNotOpen)
        ));
    }
}
