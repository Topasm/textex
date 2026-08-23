use tauri::State;

use crate::{
    error::AppResult,
    models::{
        OnlineReference, ReferenceAddResult, ZoteroCollection, ZoteroSaveResult,
        ZoteroSearchResult, ZoteroSyncResult,
    },
    services::{
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
    reference_index: State<'_, ReferenceIndexState>,
    research_state: State<'_, ResearchState>,
    citekey: String,
    port: Option<u16>,
) -> AppResult<ReferenceAddResult> {
    let _write_guard = research_state.lock().await;
    let result = zotero::add_to_project(project_state.inner(), citekey, port).await?;
    reference_index.invalidate().await;
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
pub async fn zotero_sync_collection(
    project_state: State<'_, AppState>,
    reference_index: State<'_, ReferenceIndexState>,
    research_state: State<'_, ResearchState>,
    sync_state: State<'_, ZoteroSyncState>,
    collection: String,
    target_file: Option<String>,
    port: Option<u16>,
) -> AppResult<ZoteroSyncResult> {
    let _sync_guard = sync_state.lock().await;
    let result = zotero::sync_collection(
        project_state.inner(),
        research_state.inner(),
        &collection,
        target_file,
        port,
    )
    .await?;
    reference_index.invalidate().await;
    Ok(result)
}
