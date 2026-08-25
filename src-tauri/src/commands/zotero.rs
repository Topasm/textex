use tauri::{AppHandle, Manager, State};

use crate::{
    error::{AppError, AppResult},
    models::{
        OnlineReference, ReferenceAddResult, ZoteroCollectionItemsPage, ZoteroLibrary,
        ZoteroMutationPlan, ZoteroMutationResult, ZoteroSaveResult, ZoteroSearchResult,
        ZoteroSyncResult,
    },
    services::{
        project_index::ProjectIndexState,
        references::ReferenceIndexState,
        research::ResearchState,
        settings::{self, SettingsState},
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
pub async fn zotero_library_tree(port: Option<u16>) -> AppResult<Vec<ZoteroLibrary>> {
    zotero::library_tree(port).await
}

#[tauri::command]
pub async fn zotero_collection_items(
    collection: String,
    offset: Option<u32>,
    limit: Option<u32>,
    port: Option<u16>,
) -> AppResult<ZoteroCollectionItemsPage> {
    zotero::collection_items(&collection, offset, limit, port).await
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
    app: AppHandle,
    project_state: State<'_, AppState>,
    settings_state: State<'_, SettingsState>,
    sync_state: State<'_, ZoteroSyncState>,
    plan: ZoteroMutationPlan,
) -> AppResult<ZoteroMutationResult> {
    let settings_path = settings::settings_path(&app)?;
    let settings = settings::load_settings_with_legacy_import(
        settings_state.inner(),
        &settings_path,
        &settings::legacy_settings_paths(&settings_path),
    )
    .await?;
    if !settings.zotero_enabled {
        return Err(AppError::Zotero(
            "enable Zotero in Settings > Integrations before applying Chat actions".to_owned(),
        ));
    }
    if settings.zotero_port != plan.port {
        return Err(AppError::Zotero(
            "the Zotero port changed after preview; create a fresh preview".to_owned(),
        ));
    }
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
