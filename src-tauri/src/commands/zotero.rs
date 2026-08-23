use tauri::State;

use crate::{
    error::AppResult,
    models::{ZoteroSearchResult, ZoteroSyncResult},
    services::{
        references::ReferenceIndexState,
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
pub async fn zotero_sync_collection(
    project_state: State<'_, AppState>,
    reference_index: State<'_, ReferenceIndexState>,
    sync_state: State<'_, ZoteroSyncState>,
    collection: String,
    target_file: Option<String>,
    port: Option<u16>,
) -> AppResult<ZoteroSyncResult> {
    let _sync_guard = sync_state.lock().await;
    let result =
        zotero::sync_collection(project_state.inner(), &collection, target_file, port).await?;
    reference_index.invalidate().await;
    Ok(result)
}
