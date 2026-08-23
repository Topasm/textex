use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{
        CitationGroup, CompileDatabase, CompileRecord, NewProjectBookmark, NewProjectSnippet,
        ProjectBookmark, ProjectDatabase, ProjectSnippet, SuccessResult,
    },
    services::project_data::{self, ProjectDataState},
    state::AppState,
};

#[tauri::command]
pub async fn project_init(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<ProjectDatabase> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::init(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_exists(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<bool> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::exists(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_load(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<ProjectDatabase> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_project(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_save(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    partial: Value,
) -> AppResult<ProjectDatabase> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::save_project(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        partial,
    )
    .await
}

#[tauri::command]
pub async fn project_touch(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<SuccessResult> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::touch(project_state.inner(), metadata_state.inner(), &project_root).await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn project_compile_load(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<CompileDatabase> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_compile(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_compile_save(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    record: CompileRecord,
) -> AppResult<CompileDatabase> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::save_compile_record(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        record,
    )
    .await
}

#[tauri::command]
pub async fn project_compile_clear(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<CompileDatabase> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::clear_compile(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_compile_log_save(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    file_path: String,
    log: String,
) -> AppResult<String> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::save_compile_log(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        &file_path,
        log,
    )
    .await
}

#[tauri::command]
pub async fn project_compile_log_load(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    file_path: String,
) -> AppResult<Option<String>> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_compile_log(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        &file_path,
    )
    .await
}

#[tauri::command]
pub async fn project_snippets_load(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<Vec<ProjectSnippet>> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_snippets(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_snippets_add(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    snippet: NewProjectSnippet,
) -> AppResult<ProjectSnippet> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::add_snippet(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        snippet,
    )
    .await
}

#[tauri::command]
pub async fn project_snippets_remove(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    id: String,
) -> AppResult<SuccessResult> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::remove_snippet(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        &id,
    )
    .await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn project_bookmarks_load(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<Vec<ProjectBookmark>> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_bookmarks(project_state.inner(), metadata_state.inner(), &project_root).await
}

#[tauri::command]
pub async fn project_bookmarks_add(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    bookmark: NewProjectBookmark,
) -> AppResult<ProjectBookmark> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::add_bookmark(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        bookmark,
    )
    .await
}

#[tauri::command]
pub async fn project_bookmarks_remove(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    id: String,
) -> AppResult<SuccessResult> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::remove_bookmark(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        &id,
    )
    .await?;
    Ok(SuccessResult::ok())
}

#[tauri::command]
pub async fn load_citation_groups(
    app: AppHandle,
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
) -> AppResult<Vec<CitationGroup>> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::load_citation_groups(
        &app,
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
    )
    .await
}

#[tauri::command]
pub async fn save_citation_groups(
    project_state: State<'_, AppState>,
    metadata_state: State<'_, ProjectDataState>,
    project_root: String,
    groups: Vec<CitationGroup>,
) -> AppResult<SuccessResult> {
    let _project_operation = project_state.lock_project_operation().await;
    project_data::save_citation_groups(
        project_state.inner(),
        metadata_state.inner(),
        &project_root,
        groups,
    )
    .await?;
    Ok(SuccessResult::ok())
}
