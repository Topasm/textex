use tauri::State;

use crate::{
    error::AppResult,
    models::{BibEntry, LabelInfo},
    services::{
        project_index::ProjectIndexState,
        references::{self, ReferenceIndexState},
    },
    state::AppState,
};

#[tauri::command]
pub async fn parse_bib_file(
    project_state: State<'_, AppState>,
    file_path: String,
) -> AppResult<Vec<BibEntry>> {
    references::parse_bib_file(project_state.inner(), &file_path).await
}

#[tauri::command]
pub async fn find_bib_in_project(
    project_state: State<'_, AppState>,
    project_index: State<'_, ProjectIndexState>,
    reference_index: State<'_, ReferenceIndexState>,
    project_root: String,
) -> AppResult<Vec<BibEntry>> {
    ensure_active_root(project_state.inner(), &project_root).await?;
    let snapshot = project_index.snapshot(project_state.inner()).await?;
    Ok(references::project_index(reference_index.inner(), snapshot)
        .await?
        .bib_entries)
}

#[tauri::command]
pub async fn scan_labels(
    project_state: State<'_, AppState>,
    project_index: State<'_, ProjectIndexState>,
    reference_index: State<'_, ReferenceIndexState>,
    project_root: String,
) -> AppResult<Vec<LabelInfo>> {
    ensure_active_root(project_state.inner(), &project_root).await?;
    let snapshot = project_index.snapshot(project_state.inner()).await?;
    Ok(references::project_index(reference_index.inner(), snapshot)
        .await?
        .labels)
}

async fn ensure_active_root(state: &AppState, requested: &str) -> AppResult<()> {
    let active = state.project_root()?;
    let display = requested.to_owned();
    let requested = std::path::PathBuf::from(requested);
    let requested = tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(requested))
        .await
        .map_err(|error| crate::error::AppError::ReferenceIndex(error.to_string()))?
        .map_err(|source| crate::error::AppError::io("resolve reference root", display, source))?;
    if paths_equal(&active, &requested) {
        Ok(())
    } else {
        Err(crate::error::AppError::OutsideProject(
            requested.to_string_lossy().into_owned(),
        ))
    }
}

#[cfg(not(windows))]
fn paths_equal(left: &std::path::Path, right: &std::path::Path) -> bool {
    left == right
}

#[cfg(windows)]
fn paths_equal(left: &std::path::Path, right: &std::path::Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}
