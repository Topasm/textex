use tauri::{AppHandle, Manager, State};

use crate::{
    error::AppResult,
    models::{
        OnlineReference, ReferenceAddResult, ZoteroCollection, ZoteroMutationPlan,
        ZoteroMutationResult, ZoteroSaveResult, ZoteroSearchResult, ZoteroSyncResult,
    },
    services::{
        project_index::ProjectIndexState,
        references::ReferenceIndexState,
        research::ResearchState,
        zotero::{self, ZoteroSyncState},
    },
    state::AppState,
};

#[tauri::command]
pub async fn zotero_probe(port: Option<u16>) -> bool {
    zotero::probe(port).await
}

#[tauri::command]
pub async fn zotero_search(term: String, port: Option<u16>) -> AppResult<Vec<ZoteroSearchResult>> {
    zotero::search(&term, port).await
}

#[tauri::command]
pub async fn zotero_cite_cayw(port: Option<u16>) -> AppResult<String> {
    zotero::cite_cayw(port).await
}

#[tauri::command]
pub async fn zotero_export_bibtex(citekeys: Vec<String>, port: Option<u16>) -> AppResult<String> {
    zotero::export_bibtex(citekeys, port).await
}

#[tauri::command]
pub async fn zotero_collections(port: Option<u16>) -> AppResult<Vec<ZoteroCollection>> {
    zotero::collections(port).await
}

#[tauri::command]
pub async fn zotero_add_to_project(
    project_state: State<'_, AppState>,
    project_index: State<'_, ProjectIndexState>,
    reference_index: State<'_, ReferenceIndexState>,
    research_state: State<'_, ResearchState>,
    citekey: String,
    port: Option<u16>,
) -> AppResult<ReferenceAddResult> {
    let _write_guard = research_state.lock().await;
    let commit = zotero::add_to_project(project_state.inner(), citekey, port).await?;
    let result = commit.result;
    let refresh_result = if result.inserted {
        project_index
            .refresh_written_file(
                project_state.inner(),
                &commit.project_root,
                commit.project_epoch,
                &result.file_path,
            )
            .await
    } else {
        Ok(())
    };
    reference_index.invalidate().await;
    refresh_result?;
    Ok(result)
}

#[tauri::command]
pub async fn zotero_save_online(
    sync_state: State<'_, ZoteroSyncState>,
    reference: OnlineReference,
    port: Option<u16>,
) -> AppResult<ZoteroSaveResult> {
    let _write_guard = sync_state.lock().await;
    zotero::save_online_to_library(sync_state.inner(), reference, port).await
}

#[tauri::command]
pub async fn zotero_apply_mutation_plan(
    project_state: State<'_, AppState>,
    sync_state: State<'_, ZoteroSyncState>,
    plan: ZoteroMutationPlan,
) -> AppResult<ZoteroMutationResult> {
    let _write_guard = sync_state.lock().await;
    zotero::apply_mutation_plan(sync_state.inner(), project_state.inner(), plan).await
}

#[tauri::command]
pub async fn zotero_sync_collection(
    app: AppHandle,
    collection: String,
    target_file: Option<String>,
    port: Option<u16>,
) -> AppResult<ZoteroSyncResult> {
    let project_state = app.state::<AppState>();
    let project_index = app.state::<ProjectIndexState>();
    let reference_index = app.state::<ReferenceIndexState>();
    let research_state = app.state::<ResearchState>();
    let sync_state = app.state::<ZoteroSyncState>();
    let _sync_guard = sync_state.lock().await;
    let commit = zotero::sync_collection(
        project_state.inner(),
        research_state.inner(),
        &collection,
        target_file,
        port,
    )
    .await?;
    let result = commit.result;
    let refresh_result = project_index
        .refresh_written_file(
            project_state.inner(),
            &commit.project_root,
            commit.project_epoch,
            &result.file_path,
        )
        .await;
    reference_index.invalidate().await;
    refresh_result?;
    Ok(result)
}
