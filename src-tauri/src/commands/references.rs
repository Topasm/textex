use tauri::State;

use crate::{
    error::AppResult,
    models::{BibEntry, CitationUsage, LabelInfo},
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
    // Keep validation and the bounded bibliography read in one project
    // activation; otherwise close/open could occur between canonicalization
    // and reading and return content from the previous project.
    let _project_operation = project_state.lock_project_operation().await;
    references::parse_bib_file(project_state.inner(), &file_path).await
}

#[tauri::command]
pub async fn find_bib_in_project(
    project_state: State<'_, AppState>,
    project_index: State<'_, ProjectIndexState>,
    reference_index: State<'_, ReferenceIndexState>,
    project_root: String,
) -> AppResult<Vec<BibEntry>> {
    let (project_epoch, project_epoch_tracker) =
        ensure_active_root(project_state.inner(), &project_root).await?;
    let reference_revision = reference_index.request_revision();
    let snapshot = project_index.snapshot(project_state.inner()).await?;
    Ok(references::project_index(
        reference_index.inner(),
        snapshot,
        project_epoch,
        project_epoch_tracker.as_ref(),
        reference_revision,
    )
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
    let (project_epoch, project_epoch_tracker) =
        ensure_active_root(project_state.inner(), &project_root).await?;
    let reference_revision = reference_index.request_revision();
    let snapshot = project_index.snapshot(project_state.inner()).await?;
    Ok(references::project_index(
        reference_index.inner(),
        snapshot,
        project_epoch,
        project_epoch_tracker.as_ref(),
        reference_revision,
    )
    .await?
    .labels)
}

#[tauri::command]
pub async fn scan_citations(
    project_state: State<'_, AppState>,
    project_index: State<'_, ProjectIndexState>,
    reference_index: State<'_, ReferenceIndexState>,
    project_root: String,
) -> AppResult<Vec<CitationUsage>> {
    let (project_epoch, project_epoch_tracker) =
        ensure_active_root(project_state.inner(), &project_root).await?;
    let reference_revision = reference_index.request_revision();
    let snapshot = project_index.snapshot(project_state.inner()).await?;
    Ok(references::project_index(
        reference_index.inner(),
        snapshot,
        project_epoch,
        project_epoch_tracker.as_ref(),
        reference_revision,
    )
    .await?
    .citations)
}

async fn ensure_active_root(
    state: &AppState,
    requested: &str,
) -> AppResult<(u64, std::sync::Arc<std::sync::atomic::AtomicU64>)> {
    let display = requested.to_owned();
    let requested = std::path::PathBuf::from(requested);
    let requested = tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(requested))
        .await
        .map_err(|error| crate::error::AppError::ReferenceIndex(error.to_string()))?
        .map_err(|source| crate::error::AppError::io("resolve reference root", display, source))?;
    let (active, project_epoch, project_epoch_tracker) = state.project_root_epoch()?;
    if paths_equal(&active, &requested) {
        Ok((project_epoch, project_epoch_tracker))
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
