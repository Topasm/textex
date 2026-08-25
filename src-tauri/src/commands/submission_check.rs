use tauri::State;

use crate::{
    error::{AppError, AppResult},
    models::{SubmissionCheckRequest, SubmissionCheckResult},
    services::{compiler, submission_check},
    state::AppState,
};

#[tauri::command]
pub async fn run_submission_check(
    state: State<'_, AppState>,
    request: SubmissionCheckRequest,
) -> AppResult<SubmissionCheckResult> {
    let _project_operation = state.lock_project_operation().await;
    let project_root = state.project_root()?;
    let root_file = resolve_submission_root(state.inner(), &request.root_file).await?;
    tauri::async_runtime::spawn_blocking(move || {
        submission_check::run(&project_root, &root_file.to_string_lossy())
    })
    .await
    .map_err(|error| AppError::SubmissionCheck(error.to_string()))?
}

async fn resolve_submission_root(
    state: &AppState,
    requested_file: &str,
) -> AppResult<std::path::PathBuf> {
    let selected = compiler::validate_project_tex_file(state, requested_file).await?;
    compiler::resolve_magic_root(state, &selected).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn resolves_an_included_active_file_to_its_magic_root() {
        let project = tempfile::tempdir().unwrap();
        let chapters = project.path().join("chapters");
        tokio::fs::create_dir(&chapters).await.unwrap();
        let main = project.path().join("main.tex");
        let chapter = chapters.join("method.tex");
        tokio::fs::write(&main, "\\documentclass{article}")
            .await
            .unwrap();
        tokio::fs::write(&chapter, "%! TeX root = ../main.tex\nMethod")
            .await
            .unwrap();
        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();

        let resolved = resolve_submission_root(&state, chapter.to_str().unwrap())
            .await
            .unwrap();

        assert_eq!(resolved, dunce::canonicalize(main).unwrap());
    }
}
