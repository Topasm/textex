use std::path::PathBuf;

use crate::{
    error::AppResult,
    services::{project_index::ProjectIndexState, watcher::DirectoryWatcherState},
    state::AppState,
};

/// Ends the native project session. Advancing the project epoch first makes
/// every in-flight project-scoped operation stale before native resources are
/// released.
pub async fn deactivate(
    project_state: &AppState,
    watcher_state: &DirectoryWatcherState,
    index_state: &ProjectIndexState,
) -> AppResult<()> {
    let _transition = project_state.lock_project_transition().await;
    deactivate_locked(project_state, watcher_state, index_state).await
}

/// Replaces the native project session under the same transition lock used by
/// close. Authorization and canonicalization must happen before this call.
pub async fn activate(
    project_state: &AppState,
    watcher_state: &DirectoryWatcherState,
    index_state: &ProjectIndexState,
    root: PathBuf,
) -> AppResult<()> {
    let _transition = project_state.lock_project_transition().await;
    deactivate_locked(project_state, watcher_state, index_state).await?;
    project_state.set_project_root(root)
}

async fn deactivate_locked(
    project_state: &AppState,
    watcher_state: &DirectoryWatcherState,
    index_state: &ProjectIndexState,
) -> AppResult<()> {
    let previous_project = project_state.clear_project_root()?;

    // Run every cleanup even if one independently reports a poisoned lock or
    // process-shutdown error, then return the first error to the renderer.
    let compile_result = project_state.cancel_project_compilations().map(|_| ());
    let watcher_result = watcher_state.clear().map(|_| ());
    let index_result = previous_project
        .as_ref()
        .map_or(Ok(()), |(root, epoch)| index_state.invalidate(root, *epoch));
    let notification_result = index_state.clear_event_channel();

    compile_result?;
    watcher_result?;
    index_result?;
    notification_result
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::{
        error::AppError,
        services::{project_index::ProjectIndexState, watcher::DirectoryWatcherState},
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
        )
        .await
        .expect("deactivate project");

        assert!(matches!(
            project_state.project_root(),
            Err(AppError::ProjectNotOpen)
        ));
    }
}
