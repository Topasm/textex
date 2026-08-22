use crate::{error::AppResult, models::ZoteroSearchResult, services::zotero};

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
