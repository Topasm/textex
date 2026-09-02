use std::{
    collections::{BTreeSet, HashMap, HashSet},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::{
        OnlineReference, ReferenceAddResult, SuccessResult, ZoteroCollection, ZoteroCollectionItem,
        ZoteroCollectionItemsPage, ZoteroItemDetail, ZoteroLibrary, ZoteroMutationCollectionRef,
        ZoteroMutationDraft, ZoteroMutationDraftOperation, ZoteroMutationOperation,
        ZoteroMutationPlan, ZoteroMutationResult, ZoteroSaveResult, ZoteroSearchResult,
        ZoteroSyncResult,
    },
    services::{
        filesystem, references,
        research::{self, ProjectCommit, ResearchState},
        research_limits, runtime,
    },
    state::AppState,
};

mod transport;

use transport::{
    bounded_response, client, endpoint, json_rpc, local_api_endpoint, rpc_result, validated_port,
    zotero_request_error, JsonRpcRequest, JsonRpcResponse,
};

const MAX_SEARCH_LENGTH: usize = 1_024;
const MAX_CITEKEYS: usize = 10_000;
const MAX_COLLECTION_EXPORT_BYTES: usize = 50 * 1024 * 1024;
const MAX_COLLECTIONS: usize = 10_000;
const MAX_ABSTRACT_CHARS: usize = 4_000;
const MAX_DETAIL_CHARS: usize = 512;
const MAX_COLLECTION_ITEMS_PAGE: u32 = 100;
const DEFAULT_COLLECTION_ITEMS_PAGE: u32 = 50;
const MAX_LOCAL_API_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_MUTATION_OPERATIONS: usize = 25;
const MAX_MUTATION_ITEM_MATCHES: usize = 25;
const MAX_COLLECTION_NAME_BYTES: usize = 255;
const MAX_TAG_BYTES: usize = 255;
const ZOTERO_KEY_ALPHABET: &[u8] = b"23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
static ZOTERO_KEY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct ZoteroSyncState {
    lock: Mutex<()>,
    local_authorization: Mutex<Option<LocalAuthorization>>,
}

impl ZoteroSyncState {
    pub async fn lock(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.lock.lock().await
    }
}

#[derive(Clone)]
struct LocalAuthorization {
    server_id: String,
    key: String,
    remember: bool,
}

#[derive(Deserialize)]
struct LocalAuthorizationResponse {
    key: String,
    #[serde(default)]
    remember: bool,
}

#[derive(Deserialize)]
struct LocalWriteResponse {
    #[serde(default)]
    successful: HashMap<String, serde_json::Value>,
    #[serde(default)]
    success: HashMap<String, serde_json::Value>,
    #[serde(default)]
    unchanged: HashMap<String, serde_json::Value>,
    #[serde(default)]
    failed: HashMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
struct LocalItemEnvelope {
    key: String,
    version: u64,
    data: LocalItemData,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroPlanningCollection {
    key: String,
    name: String,
    path: String,
    parent_key: Option<String>,
    version: u64,
}

#[derive(Clone, Deserialize)]
struct LocalCollectionEnvelope {
    key: String,
    version: u64,
    data: LocalCollectionData,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalCollectionData {
    #[serde(default)]
    name: String,
    #[serde(default)]
    parent_collection: serde_json::Value,
}

#[derive(Clone, Deserialize)]
struct LocalTag {
    tag: String,
    #[serde(rename = "type", default)]
    tag_type: Option<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalItemData {
    key: String,
    #[serde(default)]
    item_type: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    creators: Vec<ZoteroCreator>,
    #[serde(default)]
    date: String,
    #[serde(rename = "DOI", default)]
    doi: String,
    #[serde(default)]
    archive_location: String,
    #[serde(default)]
    abstract_note: String,
    #[serde(default)]
    publication_title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    tags: Vec<LocalTag>,
    #[serde(default)]
    collections: Vec<String>,
}

struct PendingItemMutation {
    key: String,
    version: u64,
    title: String,
    current_tags: Vec<String>,
    current_collections: Vec<String>,
    add_tags: BTreeSet<String>,
    remove_tags: BTreeSet<String>,
    add_collections: HashMap<String, ZoteroMutationCollectionRef>,
    remove_collections: HashMap<String, ZoteroMutationCollectionRef>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoteroItem {
    citekey: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    creators: Vec<ZoteroCreator>,
    #[serde(default)]
    date: String,
    #[serde(default = "default_item_type")]
    item_type: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoteroCreator {
    creator_type: String,
    first_name: Option<String>,
    last_name: Option<String>,
    name: Option<String>,
}

pub async fn probe(port: Option<u16>) -> bool {
    let Ok(url) = endpoint(port, "cayw?probe=true") else {
        return false;
    };
    client()
        .get(url)
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}

pub async fn search(term: &str, port: Option<u16>) -> AppResult<Vec<ZoteroSearchResult>> {
    let term = term.trim();
    if term.is_empty() {
        return Ok(Vec::new());
    }
    if term.len() > MAX_SEARCH_LENGTH {
        return Err(AppError::Zotero(
            "search term exceeds 1024 bytes".to_owned(),
        ));
    }
    let response: JsonRpcResponse<Vec<ZoteroItem>> = json_rpc(
        port,
        JsonRpcRequest {
            jsonrpc: "2.0",
            method: "item.search",
            params: [term],
        },
        Duration::from_secs(15),
    )
    .await?;
    rpc_result(response).map(|items| items.into_iter().map(search_result).collect())
}

pub async fn export_bibtex(citekeys: Vec<String>, port: Option<u16>) -> AppResult<String> {
    if citekeys.is_empty() {
        return Ok(String::new());
    }
    if citekeys.len() > MAX_CITEKEYS
        || citekeys
            .iter()
            .any(|key| !research_limits::is_safe_citation_key(key))
    {
        return Err(AppError::Zotero("invalid citation key request".to_owned()));
    }
    let response: JsonRpcResponse<String> = json_rpc(
        port,
        JsonRpcRequest {
            jsonrpc: "2.0",
            method: "item.export",
            params: (citekeys, "betterbibtex"),
        },
        Duration::from_secs(60),
    )
    .await?;
    rpc_result(response)
}

pub async fn library_tree(port: Option<u16>) -> AppResult<Vec<ZoteroLibrary>> {
    let (local_collections, item_count) = tokio::try_join!(
        local_collections(port),
        local_total_results(port, "users/0/items/top")
    )?;
    let collections = library_collections(local_collections)?;
    Ok(vec![ZoteroLibrary {
        key: "/0".to_owned(),
        name: "My Library".to_owned(),
        item_count,
        collections,
    }])
}

/// Reveals one item in the Zotero desktop application. The renderer sends only
/// the item key; the `zotero://` URI is assembled here so no caller can hand the
/// platform opener an arbitrary scheme.
pub async fn open_item(item_key: &str, port: Option<u16>) -> AppResult<SuccessResult> {
    let key = local_item_key(item_key)?;
    // Confirming the key against the running library keeps a stale row from
    // launching Zotero onto nothing, and reports a useful error instead.
    local_item_by_key(&key, port).await?;
    runtime::launch_uri(&format!("zotero://select/library/items/{key}")).await
}

/// Fetches the fields the collection pages deliberately omit. Item pages carry
/// up to 100 records, so abstracts are pulled one row at a time instead.
pub async fn item_detail(item_key: &str, port: Option<u16>) -> AppResult<ZoteroItemDetail> {
    let key = local_item_key(item_key)?;
    let envelope = local_item_by_key(&key, port).await?;
    Ok(ZoteroItemDetail {
        item_key: key,
        r#abstract: optional_detail(&envelope.data.abstract_note, MAX_ABSTRACT_CHARS),
        publication: optional_detail(&envelope.data.publication_title, MAX_DETAIL_CHARS),
        url: optional_detail(&envelope.data.url, MAX_DETAIL_CHARS),
    })
}

/// Accepts either a bare item key or the `/0/KEY` form the renderer uses for
/// collections, so callers never have to strip the library prefix themselves.
fn local_item_key(item_key: &str) -> AppResult<String> {
    let key = item_key.rsplit('/').next().unwrap_or_default().trim();
    if !valid_local_key(key) {
        return Err(AppError::Zotero(format!("invalid Zotero item key: {key}")));
    }
    Ok(key.to_owned())
}

fn optional_detail(value: &str, limit: usize) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(limit).collect())
}

fn library_collections(
    collections: Vec<LocalCollectionEnvelope>,
) -> AppResult<Vec<ZoteroCollection>> {
    Ok(build_collection_inventory(&collections)?
        .into_iter()
        .map(|collection| ZoteroCollection {
            key: format!("/0/{}", collection.key),
            name: collection.name,
            parent_key: collection.parent_key.map(|parent| format!("/0/{parent}")),
            item_count: None,
        })
        .collect())
}

pub async fn collection_items(
    collection: &str,
    offset: Option<u32>,
    limit: Option<u32>,
    port: Option<u16>,
) -> AppResult<ZoteroCollectionItemsPage> {
    let collection = validate_collection(collection)?;
    let item_path = if matches!(collection, "/0" | "/1") {
        "users/0/items/top".to_owned()
    } else {
        let Some((library_id, collection_key)) = collection_key_parts(collection) else {
            return Err(AppError::Zotero("invalid Zotero collection key".to_owned()));
        };
        if !matches!(library_id, "0" | "1") {
            return Err(AppError::Zotero(
                "Local API collection browsing currently supports My Library only".to_owned(),
            ));
        }
        format!("users/0/collections/{collection_key}/items/top")
    };
    let offset = offset.unwrap_or(0);
    let requested_limit = limit.unwrap_or(DEFAULT_COLLECTION_ITEMS_PAGE);
    if requested_limit > MAX_COLLECTION_ITEMS_PAGE {
        return Err(AppError::Zotero(format!(
            "collection item page size must not exceed {MAX_COLLECTION_ITEMS_PAGE}"
        )));
    }
    let fetch_limit = requested_limit.max(1);
    let mut url = reqwest::Url::parse(&local_api_endpoint(port, &item_path)?)
        .map_err(|error| AppError::Zotero(error.to_string()))?;
    url.query_pairs_mut()
        .append_pair("format", "json")
        .append_pair("start", &offset.to_string())
        .append_pair("limit", &fetch_limit.to_string());
    let response = client()
        .get(url)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let total_results = response_total_results(&response).ok_or_else(|| {
        AppError::Zotero("Zotero collection response omitted Total-Results".to_owned())
    })?;
    let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
    let page: Vec<LocalItemEnvelope> = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Zotero(format!("invalid local item response: {error}")))?;
    let page_len = u32::try_from(page.len()).unwrap_or(u32::MAX);
    let total_results = total_results.max(offset.saturating_add(page_len));
    let items = if requested_limit == 0 {
        Vec::new()
    } else {
        let item_keys = page.iter().map(|item| item.key.clone()).collect::<Vec<_>>();
        let citekeys = citation_keys_for_items(&item_keys, port).await?;
        page.into_iter()
            .map(|item| {
                let citekey = citekeys.get(&item.key).cloned().flatten();
                ZoteroCollectionItem {
                    item_key: item.key,
                    citekey,
                    title: if item.data.title.trim().is_empty() {
                        "Untitled Zotero item".to_owned()
                    } else {
                        item.data.title
                    },
                    author: format_authors(&item.data.creators),
                    year: extract_year(&item.data.date),
                    item_type: item.data.item_type,
                    doi: (!item.data.doi.trim().is_empty()).then_some(item.data.doi),
                    arxiv_id: (!item.data.archive_location.trim().is_empty())
                        .then_some(item.data.archive_location),
                }
            })
            .collect()
    };
    Ok(ZoteroCollectionItemsPage {
        items,
        total_results,
        offset,
        limit: requested_limit,
    })
}

pub async fn add_to_project(
    state: &AppState,
    citekey: String,
    port: Option<u16>,
) -> AppResult<ProjectCommit<ReferenceAddResult>> {
    if !research_limits::is_safe_citation_key(&citekey) {
        return Err(AppError::Zotero("invalid citation key request".to_owned()));
    }
    let (root, epoch, epoch_counter) = state.project_root_epoch()?;
    let bibtex = export_bibtex(vec![citekey.clone()], port).await?;
    if bibtex.trim().is_empty() {
        return Err(AppError::Zotero(
            "Better BibTeX returned an empty export".to_owned(),
        ));
    }
    if epoch_counter.load(Ordering::Acquire) != epoch {
        return Err(AppError::Zotero(
            "project changed while adding Zotero reference".to_owned(),
        ));
    }
    let result =
        research::merge_exported_bibtex(state, &root, epoch, &epoch_counter, &bibtex, &citekey)
            .await?;
    Ok(ProjectCommit {
        result,
        project_root: root,
        project_epoch: epoch,
    })
}

pub async fn save_online_to_library(
    sync_state: &ZoteroSyncState,
    reference: OnlineReference,
    port: Option<u16>,
) -> AppResult<ZoteroSaveResult> {
    research::validate_online_reference_for_import(&reference)?;
    if let Some(item_key) = find_existing_local_item(&reference, port).await? {
        let citekey = citation_key_for_item(&item_key, port).await?;
        return Ok(ZoteroSaveResult {
            item_key,
            citekey,
            duplicate: true,
        });
    }

    let payload = serde_json::json!([local_item_payload(&reference)]);
    for attempt in 0..2 {
        let authorization = local_authorization(sync_state, port).await?;
        let response = client()
            .post(local_api_endpoint(port, "users/0/items")?)
            .header("Zotero-API-Version", "3")
            .header("Zotero-Allowed-Request", "1")
            .header("Zotero-Server-ID", &authorization.server_id)
            .header("Zotero-API-Key", &authorization.key)
            .json(&payload)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(zotero_request_error)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
            *sync_state.local_authorization.lock().await = None;
            continue;
        }
        let response = response.error_for_status().map_err(zotero_request_error)?;
        let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
        let result: LocalWriteResponse = serde_json::from_slice(&bytes)
            .map_err(|error| AppError::Zotero(format!("invalid local API response: {error}")))?;
        if !authorization.remember {
            *sync_state.local_authorization.lock().await = None;
        }
        let saved = result
            .successful
            .get("0")
            .or_else(|| result.success.get("0"));
        let Some(item_key) = saved.and_then(local_write_item_key) else {
            let detail = result
                .failed
                .get("0")
                .map(serde_json::Value::to_string)
                .unwrap_or_else(|| "Zotero did not return the created item key".to_owned());
            return Err(AppError::Zotero(detail));
        };
        let citekey = citation_key_for_item(&item_key, port).await?;
        return Ok(ZoteroSaveResult {
            item_key,
            citekey,
            duplicate: false,
        });
    }
    Err(AppError::Zotero(
        "Zotero rejected the local write authorization".to_owned(),
    ))
}

pub async fn planning_inventory(
    port: Option<u16>,
) -> AppResult<(String, Vec<ZoteroPlanningCollection>)> {
    let server_id = local_server_id(port).await?;
    let collections = local_collections(port).await?;
    let inventory = build_collection_inventory(&collections)?;
    Ok((server_id, inventory))
}

pub async fn resolve_mutation_draft(
    state: &AppState,
    draft: ZoteroMutationDraft,
    server_id: String,
    port: Option<u16>,
) -> AppResult<ZoteroMutationPlan> {
    if draft.operations.is_empty() {
        return Err(AppError::Zotero(
            "the request did not produce a safe Zotero change".to_owned(),
        ));
    }
    if draft.operations.len() > MAX_MUTATION_OPERATIONS {
        return Err(AppError::Zotero(
            "a Zotero plan may contain at most 25 operations".to_owned(),
        ));
    }
    validate_mutation_text(&draft.summary, "plan summary", 2_048)?;
    let (project_root, project_epoch, _) = state.project_root_epoch()?;
    let port = validated_port(port)?;
    let collections = local_collections(Some(port)).await?;
    let mut targets = build_collection_inventory(&collections)?;
    let existing_keys = targets
        .iter()
        .map(|collection| collection.key.clone())
        .collect::<HashSet<_>>();
    let mut effective_parents = targets
        .iter()
        .map(|collection| (collection.key.clone(), collection.parent_key.clone()))
        .collect::<HashMap<_, _>>();
    let mut touched_collections = HashSet::new();
    let mut pending_items = HashMap::<String, PendingItemMutation>::new();
    let mut item_order = Vec::new();
    let mut operations = Vec::new();

    for operation in draft.operations {
        match operation {
            ZoteroMutationDraftOperation::CreateCollection { name, parent } => {
                let name =
                    validate_mutation_text(&name, "collection name", MAX_COLLECTION_NAME_BYTES)?;
                let parent_target = resolve_optional_collection(&targets, parent.as_deref())?;
                let parent_key = parent_target.map(|target| target.key.clone());
                if targets.iter().any(|target| {
                    target.parent_key == parent_key && target.name.eq_ignore_ascii_case(name)
                }) {
                    return Err(AppError::Zotero(format!(
                        "a collection named ‘{name}’ already exists at that location"
                    )));
                }
                let key = generate_collection_key(targets.iter().map(|target| target.key.as_str()));
                let parent_label = parent_target
                    .map(|target| target.path.clone())
                    .unwrap_or_else(|| "Library root".to_owned());
                let path =
                    child_collection_path(parent_target.map(|target| target.path.as_str()), name);
                targets.push(ZoteroPlanningCollection {
                    key: key.clone(),
                    name: name.to_owned(),
                    path: path.clone(),
                    parent_key: parent_key.clone(),
                    version: 0,
                });
                effective_parents.insert(key.clone(), parent_key.clone());
                operations.push(ZoteroMutationOperation::CreateCollection {
                    key,
                    name: name.to_owned(),
                    path,
                    parent_key,
                    parent_label,
                });
            }
            ZoteroMutationDraftOperation::MoveCollection { collection, parent } => {
                let target = resolve_collection(&targets, &collection)?.clone();
                if !existing_keys.contains(&target.key) {
                    return Err(AppError::Zotero(
                        "a newly created collection cannot be moved in the same plan".to_owned(),
                    ));
                }
                if !touched_collections.insert(target.key.clone()) {
                    return Err(AppError::Zotero(format!(
                        "collection ‘{}’ is changed more than once in the plan",
                        target.path
                    )));
                }
                let parent_target = resolve_optional_collection(&targets, parent.as_deref())?;
                let parent_key = parent_target.map(|value| value.key.clone());
                if parent_key.as_deref() == Some(target.key.as_str())
                    || parent_key.as_deref().is_some_and(|key| {
                        collection_descends_from(key, &target.key, &effective_parents)
                    })
                {
                    return Err(AppError::Zotero(
                        "a collection cannot be moved into itself or one of its descendants"
                            .to_owned(),
                    ));
                }
                effective_parents.insert(target.key.clone(), parent_key.clone());
                operations.push(ZoteroMutationOperation::MoveCollection {
                    key: target.key,
                    version: target.version,
                    name: target.name,
                    path: target.path,
                    parent_key,
                    parent_label: parent_target
                        .map(|value| value.path.clone())
                        .unwrap_or_else(|| "Library root".to_owned()),
                });
            }
            ZoteroMutationDraftOperation::RenameCollection {
                collection,
                new_name,
            } => {
                let target = resolve_collection(&targets, &collection)?.clone();
                if !existing_keys.contains(&target.key) {
                    return Err(AppError::Zotero(
                        "a newly created collection cannot be renamed in the same plan".to_owned(),
                    ));
                }
                if !touched_collections.insert(target.key.clone()) {
                    return Err(AppError::Zotero(format!(
                        "collection ‘{}’ is changed more than once in the plan",
                        target.path
                    )));
                }
                let new_name = validate_mutation_text(
                    &new_name,
                    "new collection name",
                    MAX_COLLECTION_NAME_BYTES,
                )?;
                if targets.iter().any(|candidate| {
                    candidate.key != target.key
                        && candidate.parent_key == target.parent_key
                        && candidate.name.eq_ignore_ascii_case(new_name)
                }) {
                    return Err(AppError::Zotero(format!(
                        "a collection named ‘{new_name}’ already exists at that location"
                    )));
                }
                operations.push(ZoteroMutationOperation::RenameCollection {
                    key: target.key,
                    version: target.version,
                    name: target.name,
                    path: target.path,
                    new_name: new_name.to_owned(),
                });
            }
            ZoteroMutationDraftOperation::UpdateItemTags {
                query,
                add_tags,
                remove_tags,
            } => {
                let query = validate_mutation_text(&query, "item query", MAX_SEARCH_LENGTH)?;
                let add_tags = validate_tags(add_tags)?;
                let remove_tags = validate_tags(remove_tags)?;
                if add_tags.is_empty() && remove_tags.is_empty() {
                    return Err(AppError::Zotero(
                        "a tag operation must add or remove at least one tag".to_owned(),
                    ));
                }
                if add_tags.iter().any(|tag| remove_tags.contains(tag)) {
                    return Err(AppError::Zotero(
                        "the same tag cannot be added and removed in one operation".to_owned(),
                    ));
                }
                let items = search_local_items(query, Some(port)).await?;
                if items.is_empty() {
                    return Err(AppError::Zotero(format!(
                        "no Zotero items matched ‘{query}’"
                    )));
                }
                for item in items {
                    let pending = upsert_pending_item(&mut pending_items, &mut item_order, item)?;
                    pending.add_tags.extend(add_tags.iter().cloned());
                    pending.remove_tags.extend(remove_tags.iter().cloned());
                }
                ensure_mutation_object_limit(operations.len(), pending_items.len())?;
            }
            ZoteroMutationDraftOperation::UpdateItemCollections {
                query,
                add_collections,
                remove_collections,
            } => {
                let query = validate_mutation_text(&query, "item query", MAX_SEARCH_LENGTH)?;
                let add_collections = resolve_mutation_collection_refs(&targets, add_collections)?;
                let remove_collections =
                    resolve_mutation_collection_refs(&targets, remove_collections)?;
                if add_collections.is_empty() && remove_collections.is_empty() {
                    return Err(AppError::Zotero(
                        "a collection membership operation must add or remove a collection"
                            .to_owned(),
                    ));
                }
                if add_collections.iter().any(|collection| {
                    remove_collections
                        .iter()
                        .any(|removed| removed.key == collection.key)
                }) {
                    return Err(AppError::Zotero(
                        "the same collection cannot be added and removed in one operation"
                            .to_owned(),
                    ));
                }
                let items = search_local_items(query, Some(port)).await?;
                if items.is_empty() {
                    return Err(AppError::Zotero(format!(
                        "no Zotero items matched ‘{query}’"
                    )));
                }
                for item in items {
                    let pending = upsert_pending_item(&mut pending_items, &mut item_order, item)?;
                    for collection in &add_collections {
                        pending
                            .add_collections
                            .insert(collection.key.clone(), collection.clone());
                    }
                    for collection in &remove_collections {
                        pending
                            .remove_collections
                            .insert(collection.key.clone(), collection.clone());
                    }
                }
                ensure_mutation_object_limit(operations.len(), pending_items.len())?;
            }
        }
    }

    for key in item_order {
        let pending = pending_items
            .remove(&key)
            .expect("pending item order and map stay synchronized");
        if pending
            .add_tags
            .iter()
            .any(|tag| pending.remove_tags.contains(tag))
        {
            return Err(AppError::Zotero(format!(
                "item ‘{}’ would add and remove the same tag",
                pending.title
            )));
        }
        if pending
            .add_collections
            .keys()
            .any(|key| pending.remove_collections.contains_key(key))
        {
            return Err(AppError::Zotero(format!(
                "item ‘{}’ would be added to and removed from the same collection",
                pending.title
            )));
        }
        let current_tags = pending.current_tags.iter().cloned().collect::<HashSet<_>>();
        let current_collections = pending
            .current_collections
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        let add_tags = pending
            .add_tags
            .into_iter()
            .filter(|tag| !current_tags.contains(tag))
            .collect::<Vec<_>>();
        let remove_tags = pending
            .remove_tags
            .into_iter()
            .filter(|tag| current_tags.contains(tag))
            .collect::<Vec<_>>();
        let mut add_collections = pending
            .add_collections
            .into_values()
            .filter(|collection| !current_collections.contains(&collection.key))
            .collect::<Vec<_>>();
        let mut remove_collections = pending
            .remove_collections
            .into_values()
            .filter(|collection| current_collections.contains(&collection.key))
            .collect::<Vec<_>>();
        add_collections.sort_by(|left, right| left.path.cmp(&right.path));
        remove_collections.sort_by(|left, right| left.path.cmp(&right.path));
        if add_tags.is_empty()
            && remove_tags.is_empty()
            && add_collections.is_empty()
            && remove_collections.is_empty()
        {
            continue;
        }
        operations.push(ZoteroMutationOperation::UpdateItem {
            key: pending.key,
            version: pending.version,
            title: pending.title,
            current_tags: pending.current_tags,
            add_tags,
            remove_tags,
            current_collections: pending.current_collections,
            add_collections,
            remove_collections,
        });
    }

    if operations.is_empty() {
        return Err(AppError::Zotero(
            "the requested Zotero items already have those tags and collection memberships"
                .to_owned(),
        ));
    }
    ensure_mutation_object_limit(operations.len(), 0)?;

    Ok(ZoteroMutationPlan {
        summary: draft.summary,
        server_id,
        port,
        project_root: filesystem::path_to_string(&project_root)?,
        project_epoch: project_epoch.to_string(),
        operations,
    })
}

pub async fn apply_mutation_plan(
    sync_state: &ZoteroSyncState,
    state: &AppState,
    plan: ZoteroMutationPlan,
) -> AppResult<ZoteroMutationResult> {
    validate_resolved_plan(state, &plan)?;
    let current_server_id = local_server_id(Some(plan.port)).await?;
    if current_server_id != plan.server_id {
        return Err(AppError::Zotero(
            "Zotero restarted or the connected library changed; create a fresh preview".to_owned(),
        ));
    }
    let current_collections = local_collections(Some(plan.port)).await?;
    let mut known_collection_paths = build_collection_inventory(&current_collections)?
        .into_iter()
        .map(|collection| (collection.key, collection.path))
        .collect::<HashMap<_, _>>();
    let current_collection_map = current_collections
        .into_iter()
        .map(|collection| (collection.key.clone(), collection))
        .collect::<HashMap<_, _>>();
    let mut collection_payload = Vec::new();
    let mut item_payload = Vec::new();
    let planned_keys = plan
        .operations
        .iter()
        .filter_map(|operation| match operation {
            ZoteroMutationOperation::CreateCollection { key, .. } => Some(key.clone()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    for operation in &plan.operations {
        if let ZoteroMutationOperation::CreateCollection { key, path, .. } = operation {
            known_collection_paths.insert(key.clone(), path.clone());
        }
    }
    let mut effective_parents = current_collection_map
        .iter()
        .map(|(key, collection)| {
            (
                key.clone(),
                local_parent_key(&collection.data.parent_collection),
            )
        })
        .collect::<HashMap<_, _>>();
    for operation in &plan.operations {
        if let ZoteroMutationOperation::CreateCollection {
            key, parent_key, ..
        } = operation
        {
            effective_parents.insert(key.clone(), parent_key.clone());
        }
    }
    for operation in &plan.operations {
        if let ZoteroMutationOperation::CreateCollection {
            key,
            parent_key: Some(parent_key),
            ..
        } = operation
        {
            if collection_descends_from(parent_key, key, &effective_parents) {
                return Err(AppError::Zotero(
                    "the planned collection hierarchy contains a cycle".to_owned(),
                ));
            }
        }
    }
    for operation in &plan.operations {
        if let ZoteroMutationOperation::MoveCollection {
            key, parent_key, ..
        } = operation
        {
            if parent_key.as_deref() == Some(key.as_str())
                || parent_key
                    .as_deref()
                    .is_some_and(|parent| collection_descends_from(parent, key, &effective_parents))
            {
                return Err(AppError::Zotero(
                    "a collection cannot be moved into itself or one of its descendants".to_owned(),
                ));
            }
            effective_parents.insert(key.clone(), parent_key.clone());
        }
    }

    for operation in &plan.operations {
        match operation {
            ZoteroMutationOperation::CreateCollection {
                key,
                name,
                parent_key,
                ..
            } => {
                if current_collection_map.contains_key(key) {
                    return Err(stale_plan_error());
                }
                validate_parent_key(parent_key, &current_collection_map, &planned_keys)?;
                collection_payload.push(serde_json::json!({
                    "key": key,
                    "name": name,
                    "parentCollection": local_parent_value(parent_key)
                }));
            }
            ZoteroMutationOperation::MoveCollection {
                key,
                version,
                name,
                parent_key,
                ..
            } => {
                let current = current_collection_map
                    .get(key)
                    .ok_or_else(stale_plan_error)?;
                if current.version != *version || current.data.name != *name {
                    return Err(stale_plan_error());
                }
                validate_parent_key(parent_key, &current_collection_map, &planned_keys)?;
                collection_payload.push(serde_json::json!({
                    "key": key,
                    "version": version,
                    "parentCollection": local_parent_value(parent_key)
                }));
            }
            ZoteroMutationOperation::RenameCollection {
                key,
                version,
                name,
                new_name,
                ..
            } => {
                let current = current_collection_map
                    .get(key)
                    .ok_or_else(stale_plan_error)?;
                if current.version != *version || current.data.name != *name {
                    return Err(stale_plan_error());
                }
                collection_payload.push(serde_json::json!({
                    "key": key,
                    "version": version,
                    "name": new_name
                }));
            }
            ZoteroMutationOperation::UpdateItem {
                key,
                version,
                current_tags,
                add_tags,
                remove_tags,
                current_collections,
                add_collections,
                remove_collections,
                ..
            } => {
                let current = local_item_by_key(key, Some(plan.port)).await?;
                let current_tag_names = normalized_tags(
                    current
                        .data
                        .tags
                        .iter()
                        .map(|tag| tag.tag.clone())
                        .collect(),
                );
                let current_collection_keys =
                    normalized_collection_keys(current.data.collections.clone())?;
                if current.version != *version
                    || current_tag_names.as_slice() != current_tags.as_slice()
                    || current_collection_keys.as_slice() != current_collections.as_slice()
                {
                    return Err(stale_plan_error());
                }
                for collection in add_collections.iter().chain(remove_collections) {
                    validate_item_collection_ref(collection, &known_collection_paths)?;
                }
                let mut payload = serde_json::json!({
                    "key": key,
                    "version": version
                });
                let removed = remove_tags
                    .iter()
                    .map(String::as_str)
                    .collect::<HashSet<_>>();
                let mut present = HashSet::new();
                let mut tags = Vec::new();
                for tag in current.data.tags {
                    if removed.contains(tag.tag.as_str()) || !present.insert(tag.tag.clone()) {
                        continue;
                    }
                    let mut value = serde_json::json!({ "tag": tag.tag });
                    if let Some(tag_type) = tag.tag_type {
                        value["type"] = serde_json::Value::from(tag_type);
                    }
                    tags.push(value);
                }
                for tag in add_tags {
                    if present.insert(tag.clone()) {
                        tags.push(serde_json::json!({ "tag": tag }));
                    }
                }
                if !add_tags.is_empty() || !remove_tags.is_empty() {
                    payload["tags"] = serde_json::Value::Array(tags);
                }
                if !add_collections.is_empty() || !remove_collections.is_empty() {
                    payload["collections"] = serde_json::Value::Array(
                        updated_collection_keys(
                            current_collections,
                            add_collections,
                            remove_collections,
                        )
                        .into_iter()
                        .map(serde_json::Value::String)
                        .collect(),
                    );
                }
                item_payload.push(payload);
            }
        }
    }

    // The plan was bound to an active project when previewed. Re-check it
    // immediately before the first authorization prompt and external write.
    validate_resolved_plan(state, &plan)?;
    if !collection_payload.is_empty() {
        write_local_batch(
            sync_state,
            state,
            &plan,
            "users/0/collections",
            &collection_payload,
            Some(plan.port),
        )
        .await?;
    }
    if !item_payload.is_empty() {
        if let Err(error) = write_local_batch(
            sync_state,
            state,
            &plan,
            "users/0/items",
            &item_payload,
            Some(plan.port),
        )
        .await
        {
            if collection_payload.is_empty() {
                return Err(error);
            }
            return Err(AppError::Zotero(format!(
                "the collection changes were applied, but item changes failed: {error}"
            )));
        }
    }
    let collection_changes = collection_payload.len();
    let item_changes = item_payload.len();
    let applied = collection_changes + item_changes;
    Ok(ZoteroMutationResult {
        summary: format!("Applied {applied} approved Zotero change(s)."),
        applied,
        collection_changes,
        item_changes,
    })
}

async fn local_collections(port: Option<u16>) -> AppResult<Vec<LocalCollectionEnvelope>> {
    let mut collections = Vec::new();
    let mut start = 0usize;
    while collections.len() < MAX_COLLECTIONS {
        let mut url = reqwest::Url::parse(&local_api_endpoint(port, "users/0/collections")?)
            .map_err(|error| AppError::Zotero(error.to_string()))?;
        url.query_pairs_mut()
            .append_pair("format", "json")
            .append_pair("limit", "100")
            .append_pair("start", &start.to_string());
        let response = client()
            .get(url)
            .header("Zotero-API-Version", "3")
            .header("Zotero-Allowed-Request", "1")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(zotero_request_error)?
            .error_for_status()
            .map_err(zotero_request_error)?;
        let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
        let page: Vec<LocalCollectionEnvelope> =
            serde_json::from_slice(&bytes).map_err(|error| {
                AppError::Zotero(format!("invalid local collection response: {error}"))
            })?;
        let page_len = page.len();
        collections.extend(page);
        if page_len < 100 {
            break;
        }
        start = start.saturating_add(page_len);
    }
    if collections.len() > MAX_COLLECTIONS {
        return Err(AppError::Zotero(
            "the Zotero library has too many collections to plan safely".to_owned(),
        ));
    }
    Ok(collections)
}

async fn local_total_results(port: Option<u16>, path: &str) -> AppResult<Option<u32>> {
    let mut url = reqwest::Url::parse(&local_api_endpoint(port, path)?)
        .map_err(|error| AppError::Zotero(error.to_string()))?;
    url.query_pairs_mut()
        .append_pair("format", "json")
        .append_pair("limit", "1");
    let response = client()
        .get(url)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    Ok(response_total_results(&response))
}

fn response_total_results(response: &reqwest::Response) -> Option<u32> {
    response
        .headers()
        .get("Total-Results")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u32>().ok())
}

async fn search_local_items(query: &str, port: Option<u16>) -> AppResult<Vec<LocalItemEnvelope>> {
    let mut url = reqwest::Url::parse(&local_api_endpoint(port, "users/0/items")?)
        .map_err(|error| AppError::Zotero(error.to_string()))?;
    url.query_pairs_mut()
        .append_pair("q", query)
        .append_pair("qmode", "everything")
        .append_pair("format", "json")
        .append_pair("limit", &MAX_MUTATION_ITEM_MATCHES.to_string());
    let response = client()
        .get(url)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    if response
        .headers()
        .get("Total-Results")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
        .is_some_and(|total| total > MAX_MUTATION_ITEM_MATCHES)
    {
        return Err(AppError::Zotero(
            "the item query matches more than 25 objects; narrow the request".to_owned(),
        ));
    }
    let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
    let mut items: Vec<LocalItemEnvelope> = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Zotero(format!("invalid local item response: {error}")))?;
    items.retain(|item| {
        !matches!(
            item.data.item_type.as_str(),
            "attachment" | "note" | "annotation"
        )
    });
    Ok(items)
}

async fn local_item_by_key(key: &str, port: Option<u16>) -> AppResult<LocalItemEnvelope> {
    let response = client()
        .get(local_api_endpoint(port, &format!("users/0/items/{key}"))?)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
    serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Zotero(format!("invalid local item response: {error}")))
}

async fn write_local_batch(
    sync_state: &ZoteroSyncState,
    state: &AppState,
    plan: &ZoteroMutationPlan,
    endpoint: &str,
    payload: &[serde_json::Value],
    port: Option<u16>,
) -> AppResult<()> {
    for attempt in 0..2 {
        let authorization = local_authorization(sync_state, port).await?;
        // Authorization may wait on a Zotero dialog. Only after it resolves do
        // we block project transitions for the bounded HTTP write itself.
        let _project_operation = state.lock_project_operation().await;
        validate_resolved_plan(state, plan)?;
        let response = client()
            .post(local_api_endpoint(port, endpoint)?)
            .header("Zotero-API-Version", "3")
            .header("Zotero-Allowed-Request", "1")
            .header("Zotero-Server-ID", &authorization.server_id)
            .header("Zotero-API-Key", &authorization.key)
            .json(payload)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(zotero_request_error)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
            *sync_state.local_authorization.lock().await = None;
            continue;
        }
        let response = response.error_for_status().map_err(zotero_request_error)?;
        let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
        let result: LocalWriteResponse = serde_json::from_slice(&bytes)
            .map_err(|error| AppError::Zotero(format!("invalid local API response: {error}")))?;
        if !authorization.remember {
            *sync_state.local_authorization.lock().await = None;
        }
        if !result.failed.is_empty() {
            return Err(AppError::Zotero(format!(
                "Zotero rejected part of the approved batch: {}. Some earlier changes may already have been applied.",
                serde_json::to_string(&result.failed).unwrap_or_else(|_| "unknown failure".to_owned())
            )));
        }
        let reported = result.successful.len() + result.success.len() + result.unchanged.len();
        if reported < payload.len() {
            return Err(AppError::Zotero(
                "Zotero returned an incomplete write result; refresh before trying again"
                    .to_owned(),
            ));
        }
        return Ok(());
    }
    Err(AppError::Zotero(
        "Zotero rejected the local write authorization".to_owned(),
    ))
}

fn build_collection_inventory(
    collections: &[LocalCollectionEnvelope],
) -> AppResult<Vec<ZoteroPlanningCollection>> {
    let by_key = collections
        .iter()
        .map(|collection| (collection.key.as_str(), collection))
        .collect::<HashMap<_, _>>();
    if by_key.len() != collections.len() {
        return Err(AppError::Zotero(
            "Zotero returned duplicate collection keys".to_owned(),
        ));
    }
    let mut memo = HashMap::new();
    let mut inventory = Vec::with_capacity(collections.len());
    for collection in collections {
        if !valid_local_key(&collection.key) {
            return Err(AppError::Zotero(
                "Zotero returned an invalid collection key".to_owned(),
            ));
        }
        validate_mutation_text(
            &collection.data.name,
            "Zotero collection name",
            MAX_COLLECTION_NAME_BYTES,
        )?;
        let path =
            collection_inventory_path(&collection.key, &by_key, &mut memo, &mut HashSet::new())?;
        inventory.push(ZoteroPlanningCollection {
            key: collection.key.clone(),
            name: collection.data.name.clone(),
            path,
            parent_key: local_parent_key(&collection.data.parent_collection),
            version: collection.version,
        });
    }
    inventory.sort_by_key(|collection| collection.path.to_lowercase());
    Ok(inventory)
}

fn collection_inventory_path(
    key: &str,
    collections: &HashMap<&str, &LocalCollectionEnvelope>,
    memo: &mut HashMap<String, String>,
    visiting: &mut HashSet<String>,
) -> AppResult<String> {
    if let Some(path) = memo.get(key) {
        return Ok(path.clone());
    }
    if !visiting.insert(key.to_owned()) {
        return Err(AppError::Zotero(
            "the Zotero collection hierarchy contains a cycle".to_owned(),
        ));
    }
    let collection = collections
        .get(key)
        .ok_or_else(|| AppError::Zotero("a Zotero collection parent is missing".to_owned()))?;
    let parent_path = match local_parent_key(&collection.data.parent_collection) {
        Some(parent) if collections.contains_key(parent.as_str()) => Some(
            collection_inventory_path(&parent, collections, memo, visiting)?,
        ),
        Some(_) => {
            return Err(AppError::Zotero(
                "a Zotero collection parent is missing".to_owned(),
            ))
        }
        None => None,
    };
    visiting.remove(key);
    let path = child_collection_path(parent_path.as_deref(), &collection.data.name);
    memo.insert(key.to_owned(), path.clone());
    Ok(path)
}

fn child_collection_path(parent: Option<&str>, name: &str) -> String {
    parent.map_or_else(|| name.to_owned(), |value| format!("{value} / {name}"))
}

fn local_parent_key(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn local_parent_value(parent_key: &Option<String>) -> serde_json::Value {
    parent_key
        .as_ref()
        .map_or(serde_json::Value::Bool(false), |key| {
            serde_json::Value::String(key.clone())
        })
}

fn resolve_optional_collection<'a>(
    targets: &'a [ZoteroPlanningCollection],
    reference: Option<&str>,
) -> AppResult<Option<&'a ZoteroPlanningCollection>> {
    let Some(reference) = reference.map(str::trim).filter(|value| {
        !value.is_empty()
            && !matches!(value.to_ascii_lowercase().as_str(), "root" | "library root")
            && *value != "/"
    }) else {
        return Ok(None);
    };
    resolve_collection(targets, reference).map(Some)
}

fn resolve_collection<'a>(
    targets: &'a [ZoteroPlanningCollection],
    reference: &str,
) -> AppResult<&'a ZoteroPlanningCollection> {
    let reference = validate_mutation_text(reference, "collection reference", 2_048)?;
    if let Some(target) = targets
        .iter()
        .find(|target| target.key.eq_ignore_ascii_case(reference))
    {
        return Ok(target);
    }
    if reference.contains('/') {
        let exact_paths = targets
            .iter()
            .filter(|target| target.path.eq_ignore_ascii_case(reference))
            .collect::<Vec<_>>();
        if exact_paths.len() == 1 {
            return Ok(exact_paths[0]);
        }
    }
    let names = targets
        .iter()
        .filter(|target| target.name.eq_ignore_ascii_case(reference))
        .collect::<Vec<_>>();
    match names.as_slice() {
        [target] => Ok(*target),
        [] => Err(AppError::Zotero(format!(
            "collection ‘{reference}’ was not found"
        ))),
        _ => Err(AppError::Zotero(format!(
            "collection name ‘{reference}’ is ambiguous; use its full path or key"
        ))),
    }
}

fn resolve_mutation_collection_refs(
    targets: &[ZoteroPlanningCollection],
    references: Vec<String>,
) -> AppResult<Vec<ZoteroMutationCollectionRef>> {
    if references.len() > MAX_MUTATION_OPERATIONS {
        return Err(AppError::Zotero(
            "an item may reference at most 25 collections in one plan".to_owned(),
        ));
    }
    let mut keys = HashSet::new();
    let mut resolved = Vec::new();
    for reference in references {
        let target = resolve_collection(targets, &reference)?;
        if keys.insert(target.key.clone()) {
            resolved.push(ZoteroMutationCollectionRef {
                key: target.key.clone(),
                path: target.path.clone(),
            });
        }
    }
    resolved.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(resolved)
}

fn upsert_pending_item<'a>(
    pending_items: &'a mut HashMap<String, PendingItemMutation>,
    item_order: &mut Vec<String>,
    item: LocalItemEnvelope,
) -> AppResult<&'a mut PendingItemMutation> {
    let key = item.key;
    let current_tags = normalized_tags(item.data.tags.into_iter().map(|tag| tag.tag).collect());
    let current_collections = normalized_collection_keys(item.data.collections)?;
    let title = if item.data.title.trim().is_empty() {
        "Untitled Zotero item".to_owned()
    } else {
        item.data.title
    };
    validate_mutation_text(&title, "item title", 4_096)?;
    if let Some(existing) = pending_items.get(&key) {
        if existing.version != item.version
            || existing.title != title
            || existing.current_tags != current_tags
            || existing.current_collections != current_collections
        {
            return Err(AppError::Zotero(
                "a Zotero item changed while the mutation preview was being assembled".to_owned(),
            ));
        }
    } else {
        item_order.push(key.clone());
        pending_items.insert(
            key.clone(),
            PendingItemMutation {
                key: key.clone(),
                version: item.version,
                title,
                current_tags,
                current_collections,
                add_tags: BTreeSet::new(),
                remove_tags: BTreeSet::new(),
                add_collections: HashMap::new(),
                remove_collections: HashMap::new(),
            },
        );
    }
    Ok(pending_items
        .get_mut(&key)
        .expect("pending Zotero item was inserted"))
}

fn normalized_collection_keys(collections: Vec<String>) -> AppResult<Vec<String>> {
    let mut normalized = BTreeSet::new();
    for key in collections {
        if !valid_local_key(&key) {
            return Err(AppError::Zotero(
                "Zotero returned an invalid item collection key".to_owned(),
            ));
        }
        normalized.insert(key);
    }
    Ok(normalized.into_iter().collect())
}

fn updated_collection_keys(
    current: &[String],
    added: &[ZoteroMutationCollectionRef],
    removed: &[ZoteroMutationCollectionRef],
) -> Vec<String> {
    let mut collections = current.iter().cloned().collect::<BTreeSet<_>>();
    for collection in removed {
        collections.remove(&collection.key);
    }
    collections.extend(added.iter().map(|collection| collection.key.clone()));
    collections.into_iter().collect()
}

fn ensure_mutation_object_limit(collections: usize, items: usize) -> AppResult<()> {
    if collections.saturating_add(items) > MAX_MUTATION_OPERATIONS {
        return Err(AppError::Zotero(
            "the Zotero plan would change more than 25 objects; narrow the request".to_owned(),
        ));
    }
    Ok(())
}

fn collection_descends_from(
    candidate: &str,
    ancestor: &str,
    parents: &HashMap<String, Option<String>>,
) -> bool {
    let mut current = Some(candidate);
    let mut visited = HashSet::new();
    while let Some(key) = current {
        if key == ancestor {
            return true;
        }
        if !visited.insert(key.to_owned()) {
            return true;
        }
        current = parents.get(key).and_then(Option::as_deref);
    }
    false
}

fn validate_mutation_text<'a>(value: &'a str, label: &str, max_bytes: usize) -> AppResult<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed != value
        || trimmed.len() > max_bytes
        || trimmed.chars().any(char::is_control)
    {
        return Err(AppError::Zotero(format!("invalid {label}")));
    }
    Ok(trimmed)
}

fn validate_tags(tags: Vec<String>) -> AppResult<Vec<String>> {
    if tags.len() > 25 {
        return Err(AppError::Zotero(
            "a Zotero tag operation may contain at most 25 tags".to_owned(),
        ));
    }
    let mut normalized = BTreeSet::new();
    for tag in tags {
        normalized.insert(validate_mutation_text(&tag, "Zotero tag", MAX_TAG_BYTES)?.to_owned());
    }
    Ok(normalized.into_iter().collect())
}

fn normalized_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .filter(|tag| !tag.trim().is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn generate_collection_key<'a>(existing: impl Iterator<Item = &'a str>) -> String {
    let existing = existing.collect::<HashSet<_>>();
    loop {
        let sequence = ZOTERO_KEY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let digest = Sha256::digest(format!("TextEx:{timestamp}:{sequence}").as_bytes());
        let key = digest
            .iter()
            .take(8)
            .map(|byte| ZOTERO_KEY_ALPHABET[*byte as usize % ZOTERO_KEY_ALPHABET.len()] as char)
            .collect::<String>();
        if !existing.contains(key.as_str()) {
            return key;
        }
    }
}

fn valid_local_key(key: &str) -> bool {
    key.len() == 8 && key.bytes().all(|byte| ZOTERO_KEY_ALPHABET.contains(&byte))
}

fn validate_resolved_plan(state: &AppState, plan: &ZoteroMutationPlan) -> AppResult<()> {
    validate_mutation_text(&plan.summary, "plan summary", 2_048)?;
    validate_mutation_text(&plan.server_id, "Zotero server ID", 256)?;
    if plan.port == 0
        || plan.operations.is_empty()
        || plan.operations.len() > MAX_MUTATION_OPERATIONS
    {
        return Err(AppError::Zotero("invalid Zotero mutation plan".to_owned()));
    }
    let expected_epoch = plan
        .project_epoch
        .parse::<u64>()
        .map_err(|_| AppError::Zotero("invalid Zotero plan project epoch".to_owned()))?;
    let (active_root, active_epoch, _) = state.project_root_epoch()?;
    if active_epoch != expected_epoch
        || !filesystem::paths_equal(&active_root, Path::new(&plan.project_root))
    {
        return Err(AppError::Zotero(
            "the active project changed; create a fresh Zotero preview".to_owned(),
        ));
    }
    let mut changed_keys = HashSet::new();
    for operation in &plan.operations {
        let key = match operation {
            ZoteroMutationOperation::CreateCollection {
                key, name, path, ..
            } => {
                validate_mutation_text(name, "collection name", MAX_COLLECTION_NAME_BYTES)?;
                validate_mutation_text(path, "collection path", 2_048)?;
                key
            }
            ZoteroMutationOperation::MoveCollection {
                key, name, path, ..
            } => {
                validate_mutation_text(name, "collection name", MAX_COLLECTION_NAME_BYTES)?;
                validate_mutation_text(path, "collection path", 2_048)?;
                key
            }
            ZoteroMutationOperation::RenameCollection {
                key,
                name,
                path,
                new_name,
                ..
            } => {
                validate_mutation_text(name, "collection name", MAX_COLLECTION_NAME_BYTES)?;
                validate_mutation_text(path, "collection path", 2_048)?;
                validate_mutation_text(new_name, "new collection name", MAX_COLLECTION_NAME_BYTES)?;
                key
            }
            ZoteroMutationOperation::UpdateItem {
                key,
                title,
                current_tags,
                add_tags,
                remove_tags,
                current_collections,
                add_collections,
                remove_collections,
                ..
            } => {
                validate_mutation_text(title, "item title", 4_096)?;
                validate_tags(current_tags.clone())?;
                validate_tags(add_tags.clone())?;
                validate_tags(remove_tags.clone())?;
                let normalized_current_collections =
                    normalized_collection_keys(current_collections.clone())?;
                if normalized_current_collections.as_slice() != current_collections.as_slice() {
                    return Err(AppError::Zotero(
                        "invalid current Zotero item collections".to_owned(),
                    ));
                }
                let added_collection_keys = validate_collection_ref_list(add_collections)?;
                let removed_collection_keys = validate_collection_ref_list(remove_collections)?;
                if add_tags.is_empty()
                    && remove_tags.is_empty()
                    && add_collections.is_empty()
                    && remove_collections.is_empty()
                {
                    return Err(AppError::Zotero(
                        "an item operation must change tags or collection membership".to_owned(),
                    ));
                }
                if add_tags.iter().any(|tag| remove_tags.contains(tag)) {
                    return Err(AppError::Zotero(
                        "the same tag cannot be added and removed in one operation".to_owned(),
                    ));
                }
                if added_collection_keys
                    .iter()
                    .any(|key| removed_collection_keys.contains(key))
                {
                    return Err(AppError::Zotero(
                        "the same collection cannot be added and removed in one operation"
                            .to_owned(),
                    ));
                }
                key
            }
        };
        if !valid_local_key(key) || !changed_keys.insert(key.clone()) {
            return Err(AppError::Zotero(
                "the Zotero plan contains an invalid or repeated object key".to_owned(),
            ));
        }
    }
    Ok(())
}

fn validate_parent_key(
    parent_key: &Option<String>,
    current: &HashMap<String, LocalCollectionEnvelope>,
    planned: &HashSet<String>,
) -> AppResult<()> {
    if parent_key
        .as_ref()
        .is_some_and(|key| !current.contains_key(key) && !planned.contains(key))
    {
        return Err(stale_plan_error());
    }
    Ok(())
}

fn validate_collection_ref_list(
    collections: &[ZoteroMutationCollectionRef],
) -> AppResult<HashSet<String>> {
    if collections.len() > MAX_MUTATION_OPERATIONS {
        return Err(AppError::Zotero(
            "an item operation references too many collections".to_owned(),
        ));
    }
    let mut keys = HashSet::new();
    for collection in collections {
        if !valid_local_key(&collection.key)
            || !keys.insert(collection.key.clone())
            || validate_mutation_text(&collection.path, "collection path", 2_048).is_err()
        {
            return Err(AppError::Zotero(
                "an item operation contains an invalid collection reference".to_owned(),
            ));
        }
    }
    Ok(keys)
}

fn validate_item_collection_ref(
    collection: &ZoteroMutationCollectionRef,
    known_paths: &HashMap<String, String>,
) -> AppResult<()> {
    if known_paths.get(&collection.key) != Some(&collection.path) {
        return Err(stale_plan_error());
    }
    Ok(())
}

fn stale_plan_error() -> AppError {
    AppError::Zotero(
        "the Zotero library changed after the preview; create a fresh preview".to_owned(),
    )
}

pub async fn sync_collection(
    state: &AppState,
    research_state: &ResearchState,
    collection: &str,
    target_file: Option<String>,
    port: Option<u16>,
) -> AppResult<ProjectCommit<ZoteroSyncResult>> {
    let (root, epoch, epoch_counter) = state.project_root_epoch()?;
    let collection = validate_collection(collection)?;
    let file_path = match target_file {
        Some(path) => path,
        None => root.join("zotero.bib").to_string_lossy().into_owned(),
    };
    if !Path::new(&file_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"))
    {
        return Err(AppError::InvalidPath(file_path));
    }
    // Validate before the network request for fast feedback. The target is
    // validated again under the shared research write lock before commit so a
    // project transition or symlink swap cannot reuse this earlier decision.
    let validated_target = filesystem::validate_save_file_target(state, &file_path).await?;
    let file_path = validated_target
        .into_os_string()
        .into_string()
        .map_err(|path| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))?;
    let mut response = request_collection_export(port, collection).await?;
    if response
        .content_length()
        .is_some_and(|size| size > MAX_COLLECTION_EXPORT_BYTES as u64)
    {
        return Err(AppError::Zotero(
            "collection export exceeds 50 MiB".to_owned(),
        ));
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(zotero_request_error)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_COLLECTION_EXPORT_BYTES {
            return Err(AppError::Zotero(
                "collection export exceeds 50 MiB".to_owned(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| AppError::Zotero("collection export is not valid UTF-8".to_owned()))?;
    let entry_count = references::parse_bib_content(&content, None).len() as u32;

    let bytes_written = content.len() as u64;
    let committed_file_path = commit_collection_export(
        state,
        research_state,
        &root,
        epoch,
        &epoch_counter,
        &file_path,
        content,
    )
    .await?;
    Ok(ProjectCommit {
        result: ZoteroSyncResult {
            file_path: committed_file_path,
            bytes_written,
            entry_count,
        },
        project_root: root,
        project_epoch: epoch,
    })
}

async fn commit_collection_export(
    state: &AppState,
    research_state: &ResearchState,
    expected_root: &Path,
    expected_epoch: u64,
    epoch_counter: &std::sync::atomic::AtomicU64,
    file_path: &str,
    content: String,
) -> AppResult<String> {
    // Collection downloads remain deduplicated by ZoteroSyncState. Only the
    // final local commit joins the ResearchState critical section shared by
    // online and Zotero single-reference additions and research config writes.
    let _write_guard = research_state.lock().await;
    let _project_operation = state.lock_project_operation().await;
    ensure_project_epoch(state, expected_root, expected_epoch, epoch_counter)?;

    let target = filesystem::validate_save_file_target(state, file_path).await?;
    let config = research::load_config(state).await?;
    let references_path = expected_root.join(config.references_file);
    let references_path_text = references_path.to_string_lossy().into_owned();
    let references_target =
        filesystem::validate_save_file_target(state, &references_path_text).await?;
    if paths_equal_portably(&target, &references_target) {
        return Err(AppError::ProjectData(
            "Zotero collection output cannot replace the managed single-reference bibliography"
                .to_owned(),
        ));
    }

    ensure_project_epoch(state, expected_root, expected_epoch, epoch_counter)?;
    let committed_file_path = filesystem::path_to_string(&target)?;
    filesystem::write_files_transactionally(vec![(target, content.into_bytes())]).await?;
    Ok(committed_file_path)
}

fn ensure_project_epoch(
    state: &AppState,
    expected_root: &Path,
    expected_epoch: u64,
    epoch_counter: &std::sync::atomic::AtomicU64,
) -> AppResult<()> {
    if epoch_counter.load(Ordering::Acquire) != expected_epoch
        || !state
            .project_root()
            .is_ok_and(|current_root| current_root.as_path() == expected_root)
    {
        return Err(AppError::Zotero(
            "project changed while synchronizing Zotero collection".to_owned(),
        ));
    }
    Ok(())
}

fn paths_equal_portably(left: &Path, right: &Path) -> bool {
    let key = |path: &Path| {
        path.to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase()
    };
    key(left) == key(right)
}

async fn find_existing_local_item(
    reference: &OnlineReference,
    port: Option<u16>,
) -> AppResult<Option<String>> {
    let identity = reference
        .doi
        .as_deref()
        .or(reference.arxiv_id.as_deref())
        .unwrap_or(reference.title.as_str());
    let mut url = reqwest::Url::parse(&local_api_endpoint(port, "users/0/items")?)
        .map_err(|error| AppError::Zotero(error.to_string()))?;
    url.query_pairs_mut()
        .append_pair("q", identity)
        .append_pair("qmode", "everything")
        .append_pair("format", "json")
        .append_pair("limit", "25");
    let response = client()
        .get(url)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let bytes = bounded_response(response, MAX_LOCAL_API_RESPONSE_BYTES).await?;
    let items: Vec<LocalItemEnvelope> = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Zotero(format!("invalid local item response: {error}")))?;
    let doi = reference.doi.as_deref().map(str::to_lowercase);
    let arxiv = reference.arxiv_id.as_deref().map(str::to_lowercase);
    let title = reference.title.trim().to_lowercase();
    Ok(items.into_iter().find_map(|item| {
        let same_doi = doi
            .as_ref()
            .is_some_and(|value| item.data.doi.trim().to_lowercase() == *value);
        let same_arxiv = arxiv
            .as_ref()
            .is_some_and(|value| item.data.archive_location.trim().to_lowercase() == *value);
        let same_title = item.data.title.trim().to_lowercase() == title;
        (same_doi || same_arxiv || (doi.is_none() && arxiv.is_none() && same_title))
            .then_some(item.data.key)
    }))
}

async fn local_authorization(
    sync_state: &ZoteroSyncState,
    port: Option<u16>,
) -> AppResult<LocalAuthorization> {
    let server_id = local_server_id(port).await?;
    let mut cached = sync_state.local_authorization.lock().await;
    if let Some(authorization) = cached.as_ref() {
        if authorization.server_id == server_id {
            return Ok(authorization.clone());
        }
        *cached = None;
    }
    let response = client()
        .post(local_api_endpoint(port, "local/authorize")?)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .header("Zotero-Server-ID", &server_id)
        .json(&serde_json::json!({ "appName": "TextEx" }))
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let bytes = bounded_response(response, 64 * 1024).await?;
    let granted: LocalAuthorizationResponse = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Zotero(format!("invalid authorization response: {error}")))?;
    if granted.key.is_empty()
        || granted.key.len() > 256
        || granted.key.chars().any(char::is_control)
    {
        return Err(AppError::Zotero(
            "Zotero returned an invalid local authorization".to_owned(),
        ));
    }
    let authorization = LocalAuthorization {
        server_id,
        key: granted.key,
        remember: granted.remember,
    };
    if authorization.remember {
        *cached = Some(authorization.clone());
    }
    Ok(authorization)
}

async fn local_server_id(port: Option<u16>) -> AppResult<String> {
    let response = client()
        .get(local_api_endpoint(port, "")?)
        .header("Zotero-API-Version", "3")
        .header("Zotero-Allowed-Request", "1")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let server_id = response
        .headers()
        .get("Zotero-Server-ID")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or_else(|| AppError::Zotero("Zotero did not provide a server ID".to_owned()))?;
    Ok(server_id.to_owned())
}

async fn citation_key_for_item(item_key: &str, port: Option<u16>) -> AppResult<Option<String>> {
    for attempt in 0..5 {
        let response: JsonRpcResponse<HashMap<String, Option<String>>> = json_rpc(
            port,
            JsonRpcRequest {
                jsonrpc: "2.0",
                method: "item.citationkey",
                params: serde_json::json!({ "item_keys": [item_key] }),
            },
            Duration::from_secs(15),
        )
        .await?;
        let keys = rpc_result(response)?;
        if let Some(citekey) = keys.get(item_key).cloned().flatten() {
            if research_limits::is_safe_citation_key(&citekey) {
                return Ok(Some(citekey));
            }
        }
        if attempt < 4 {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }
    Ok(None)
}

async fn citation_keys_for_items(
    item_keys: &[String],
    port: Option<u16>,
) -> AppResult<HashMap<String, Option<String>>> {
    if item_keys.is_empty() {
        return Ok(HashMap::new());
    }
    if item_keys.len() > MAX_COLLECTION_ITEMS_PAGE as usize
        || item_keys.iter().any(|key| !valid_local_key(key))
    {
        return Err(AppError::Zotero(
            "Zotero returned invalid collection item keys".to_owned(),
        ));
    }
    let response: JsonRpcResponse<HashMap<String, Option<String>>> = json_rpc(
        port,
        JsonRpcRequest {
            jsonrpc: "2.0",
            method: "item.citationkey",
            params: serde_json::json!({ "item_keys": item_keys }),
        },
        Duration::from_secs(15),
    )
    .await?;
    let mut keys = rpc_result(response)?;
    keys.retain(|item_key, citekey| {
        valid_local_key(item_key)
            && citekey
                .as_deref()
                .is_none_or(research_limits::is_safe_citation_key)
    });
    Ok(keys)
}

fn local_item_payload(reference: &OnlineReference) -> serde_json::Value {
    let creators = reference
        .authors
        .iter()
        .map(|author| {
            let author = author.trim();
            if let Some((last_name, first_name)) = author.split_once(',') {
                serde_json::json!({
                    "creatorType": "author",
                    "firstName": first_name.trim(),
                    "lastName": last_name.trim()
                })
            } else if let Some((first_name, last_name)) = author.rsplit_once(' ') {
                serde_json::json!({
                    "creatorType": "author",
                    "firstName": first_name.trim(),
                    "lastName": last_name.trim()
                })
            } else {
                serde_json::json!({ "creatorType": "author", "name": author })
            }
        })
        .collect::<Vec<_>>();
    let mut payload = serde_json::json!({
        "itemType": zotero_item_type(&reference.item_type),
        "title": &reference.title,
        "creators": creators,
        "date": &reference.year,
        "collections": [],
        "tags": [],
        "relations": {}
    });
    let object = payload.as_object_mut().expect("JSON object payload");
    for (field, value) in [
        ("DOI", reference.doi.as_deref()),
        ("url", reference.url.as_deref()),
        ("abstractNote", reference.r#abstract.as_deref()),
        ("archiveLocation", reference.arxiv_id.as_deref()),
    ] {
        if let Some(value) = value {
            object.insert(
                field.to_owned(),
                serde_json::Value::String(value.to_owned()),
            );
        }
    }
    if reference.arxiv_id.is_some() {
        object.insert(
            "archive".to_owned(),
            serde_json::Value::String("arXiv".to_owned()),
        );
    }
    payload
}

fn zotero_item_type(item_type: &str) -> &'static str {
    match item_type {
        "book" | "monograph" => "book",
        "book-chapter" | "book-section" => "bookSection",
        "proceedings-article" | "conference-paper" => "conferencePaper",
        "report" | "technical-report" => "report",
        "thesis" | "dissertation" => "thesis",
        "preprint" | "posted-content" => "preprint",
        _ => "journalArticle",
    }
}

fn local_write_item_key(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| {
            value
                .get("key")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .or_else(|| value.get("data")?.get("key")?.as_str().map(str::to_owned))
}

fn collection_endpoint(port: Option<u16>, collection: &str) -> AppResult<reqwest::Url> {
    let mut url = reqwest::Url::parse(&endpoint(port, "collection")?)
        .map_err(|error| AppError::Zotero(error.to_string()))?;
    url.set_query(Some(&format!("{collection}.bibtex")));
    Ok(url)
}

fn collection_export_endpoints(
    port: Option<u16>,
    collection: &str,
) -> AppResult<Vec<reqwest::Url>> {
    let collection = validate_collection(collection)?;
    let mut endpoints = Vec::new();
    if let Some((library_id, key)) = collection_key_parts(collection) {
        let mut modern = reqwest::Url::parse(&endpoint(port, "export")?)
            .map_err(|error| AppError::Zotero(error.to_string()))?;
        let library = if matches!(library_id, "0" | "1") {
            String::new()
        } else {
            format!("library;id:{library_id}/")
        };
        modern.set_query(Some(&format!("{library}collection;key:{key}/{key}.bibtex")));
        endpoints.push(modern);
    }
    endpoints.push(collection_endpoint(port, collection)?);
    if let Some(("1", key)) = collection_key_parts(collection) {
        endpoints.push(collection_endpoint(port, &format!("/0/{key}"))?);
    }
    endpoints.dedup_by(|left, right| left == right);
    Ok(endpoints)
}

fn collection_key_parts(collection: &str) -> Option<(&str, &str)> {
    let mut parts = collection.strip_prefix('/')?.split('/');
    let library_id = parts.next()?;
    let key = parts.next()?;
    if parts.next().is_some()
        || library_id.is_empty()
        || !library_id.bytes().all(|byte| byte.is_ascii_digit())
        || !valid_local_key(key)
    {
        return None;
    }
    Some((library_id, key))
}

async fn request_collection_export(
    port: Option<u16>,
    collection: &str,
) -> AppResult<reqwest::Response> {
    let endpoints = collection_export_endpoints(port, collection)?;
    for (index, url) in endpoints.iter().enumerate() {
        let response = client()
            .get(url.clone())
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(zotero_request_error)?;
        if response.status() == reqwest::StatusCode::NOT_FOUND && index + 1 < endpoints.len() {
            continue;
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(AppError::Zotero(
                "Better BibTeX could not find this collection. Refresh the Zotero collections in TextEx and try again."
                    .to_owned(),
            ));
        }
        return response.error_for_status().map_err(zotero_request_error);
    }
    Err(AppError::Zotero(
        "Better BibTeX did not provide a collection export endpoint".to_owned(),
    ))
}

fn search_result(item: ZoteroItem) -> ZoteroSearchResult {
    ZoteroSearchResult {
        citekey: item.citekey,
        title: item.title,
        author: format_authors(&item.creators),
        year: extract_year(&item.date),
        item_type: item.item_type,
    }
}

fn format_authors(creators: &[ZoteroCreator]) -> String {
    creators
        .iter()
        .filter(|creator| creator.creator_type == "author")
        .map(|creator| {
            creator.name.clone().unwrap_or_else(|| {
                format!(
                    "{}, {}",
                    creator.last_name.as_deref().unwrap_or_default(),
                    creator.first_name.as_deref().unwrap_or_default()
                )
            })
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn extract_year(date: &str) -> String {
    date.as_bytes()
        .windows(4)
        .find(|window| window.iter().all(u8::is_ascii_digit))
        .map_or_else(String::new, |year| {
            String::from_utf8_lossy(year).into_owned()
        })
}

fn validate_collection(collection: &str) -> AppResult<&str> {
    let collection = collection.trim();
    if collection.is_empty()
        || collection.len() > 2_048
        || !collection.starts_with('/')
        || collection
            .chars()
            .any(|character| character.is_control() || matches!(character, '?' | '#' | '&'))
    {
        return Err(AppError::Zotero(
            "collection must be an absolute Better BibTeX collection path".to_owned(),
        ));
    }
    Ok(collection)
}

fn default_item_type() -> String {
    "misc".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_collection(
        key: &str,
        version: u64,
        name: &str,
        parent: Option<&str>,
    ) -> LocalCollectionEnvelope {
        LocalCollectionEnvelope {
            key: key.to_owned(),
            version,
            data: LocalCollectionData {
                name: name.to_owned(),
                parent_collection: parent.map_or(serde_json::Value::Bool(false), |value| {
                    serde_json::Value::String(value.to_owned())
                }),
            },
        }
    }

    #[test]
    fn accepts_prefixed_item_keys_and_rejects_anything_else() {
        assert_eq!(local_item_key("ABCD2345").unwrap(), "ABCD2345");
        assert_eq!(local_item_key("/0/ABCD2345").unwrap(), "ABCD2345");
        // Lowercase, wrong length, and path traversal are all outside the
        // Zotero key alphabet, so the URI can never be steered elsewhere.
        assert!(local_item_key("abcd2345").is_err());
        assert!(local_item_key("ABCD234").is_err());
        assert!(local_item_key("../../etc").is_err());
        assert!(local_item_key("").is_err());
    }

    #[test]
    fn trims_item_detail_fields_and_drops_empty_ones() {
        assert_eq!(
            optional_detail("  Robotics: Science and Systems  ", MAX_DETAIL_CHARS),
            Some("Robotics: Science and Systems".to_owned())
        );
        assert_eq!(optional_detail("   ", MAX_DETAIL_CHARS), None);
        assert_eq!(
            optional_detail(&"a".repeat(MAX_ABSTRACT_CHARS + 100), MAX_ABSTRACT_CHARS)
                .unwrap()
                .chars()
                .count(),
            MAX_ABSTRACT_CHARS
        );
    }

    #[test]
    fn formats_search_metadata() {
        let result = search_result(ZoteroItem {
            citekey: "smith2026".to_owned(),
            title: "Paper".to_owned(),
            creators: vec![ZoteroCreator {
                creator_type: "author".to_owned(),
                first_name: Some("Ada".to_owned()),
                last_name: Some("Smith".to_owned()),
                name: None,
            }],
            date: "2026-08-22".to_owned(),
            item_type: "journalArticle".to_owned(),
        });
        assert_eq!(result.author, "Smith, Ada");
        assert_eq!(result.year, "2026");
    }

    #[test]
    fn builds_stable_collection_paths_and_rejects_ambiguous_names() {
        let inventory = build_collection_inventory(&[
            local_collection("ABCD2345", 1, "Writing", None),
            local_collection("EFGH6789", 2, "ForRSS", Some("ABCD2345")),
            local_collection("JKLM2345", 3, "ForRSS", None),
        ])
        .unwrap();
        assert_eq!(
            resolve_collection(&inventory, "Writing / ForRSS")
                .unwrap()
                .key,
            "EFGH6789"
        );
        assert!(resolve_collection(&inventory, "ForRSS").is_err());
        assert_eq!(
            resolve_collection(&inventory, "JKLM2345").unwrap().path,
            "ForRSS"
        );
    }

    #[test]
    fn generated_keys_and_root_parent_payload_follow_local_api_rules() {
        let key = generate_collection_key(["ABCD2345"].into_iter());
        assert!(valid_local_key(&key));
        assert_ne!(key, "ABCD2345");
        assert_eq!(local_parent_value(&None), serde_json::Value::Bool(false));
        assert_eq!(
            local_parent_value(&Some("ABCD2345".to_owned())),
            serde_json::Value::String("ABCD2345".to_owned())
        );
    }

    #[test]
    fn detects_collection_cycles_before_writing() {
        let parents = HashMap::from([
            ("ABCD2345".to_owned(), None),
            ("EFGH6789".to_owned(), Some("ABCD2345".to_owned())),
        ]);
        assert!(collection_descends_from("EFGH6789", "ABCD2345", &parents));
        assert!(!collection_descends_from("ABCD2345", "EFGH6789", &parents));
    }

    #[test]
    fn item_collection_updates_preserve_unrelated_memberships() {
        let current = vec!["ABCD2345".to_owned(), "EFGH6789".to_owned()];
        let added = vec![ZoteroMutationCollectionRef {
            key: "JKLM2345".to_owned(),
            path: "Writing / VLA".to_owned(),
        }];
        let removed = vec![ZoteroMutationCollectionRef {
            key: "EFGH6789".to_owned(),
            path: "Reading Queue".to_owned(),
        }];

        assert_eq!(
            updated_collection_keys(&current, &added, &removed),
            vec!["ABCD2345".to_owned(), "JKLM2345".to_owned()]
        );
    }

    #[test]
    fn collection_reference_resolution_supports_nested_paths() {
        let inventory = build_collection_inventory(&[
            local_collection("ABCD2345", 1, "Writing", None),
            local_collection("EFGH6789", 2, "VLA", Some("ABCD2345")),
        ])
        .unwrap();
        let resolved = resolve_mutation_collection_refs(
            &inventory,
            vec!["Writing / VLA".to_owned(), "Writing / VLA".to_owned()],
        )
        .unwrap();

        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].key, "EFGH6789");
        assert_eq!(resolved[0].path, "Writing / VLA");
    }

    #[test]
    fn maps_online_reference_to_local_zotero_item() {
        let payload = local_item_payload(&OnlineReference {
            source: "crossref".to_owned(),
            id: "10.1000/example".to_owned(),
            title: "A Paper".to_owned(),
            authors: vec!["Lovelace, Ada".to_owned(), "Grace Hopper".to_owned()],
            year: "2026".to_owned(),
            item_type: "journal-article".to_owned(),
            doi: Some("10.1000/example".to_owned()),
            arxiv_id: None,
            url: Some("https://doi.org/10.1000/example".to_owned()),
            r#abstract: Some("Summary".to_owned()),
        });
        assert_eq!(payload["itemType"], "journalArticle");
        assert_eq!(payload["DOI"], "10.1000/example");
        assert_eq!(payload["creators"][0]["firstName"], "Ada");
        assert_eq!(payload["creators"][0]["lastName"], "Lovelace");
        assert_eq!(payload["creators"][1]["firstName"], "Grace");
        assert_eq!(payload["creators"][1]["lastName"], "Hopper");
    }

    #[test]
    fn validates_collection_pull_export_paths() {
        assert_eq!(validate_collection("/0/8CV58ZVD").unwrap(), "/0/8CV58ZVD");
        assert_eq!(
            validate_collection("//Research/Papers").unwrap(),
            "//Research/Papers"
        );
        assert!(validate_collection("Research").is_err());
        assert!(validate_collection("/Research?format=json").is_err());
        assert_eq!(
            collection_endpoint(Some(23_119), "/0/8CV58ZVD")
                .unwrap()
                .as_str(),
            "http://127.0.0.1:23119/better-bibtex/collection?/0/8CV58ZVD.bibtex"
        );
        assert_eq!(
            collection_export_endpoints(Some(23_119), "/1/D9ZCPFJ2")
                .unwrap()
                .into_iter()
                .map(|url| url.to_string())
                .collect::<Vec<_>>(),
            vec![
                "http://127.0.0.1:23119/better-bibtex/export?collection;key:D9ZCPFJ2/D9ZCPFJ2.bibtex",
                "http://127.0.0.1:23119/better-bibtex/collection?/1/D9ZCPFJ2.bibtex",
                "http://127.0.0.1:23119/better-bibtex/collection?/0/D9ZCPFJ2.bibtex"
            ]
        );
        assert_eq!(
            collection_export_endpoints(Some(23_119), "/7/8CV58ZVD")
                .unwrap()[0]
                .as_str(),
            "http://127.0.0.1:23119/better-bibtex/export?library;id:7/collection;key:8CV58ZVD/8CV58ZVD.bibtex"
        );
    }

    #[test]
    fn local_library_tree_keeps_unknown_counts_unknown() {
        let collections = library_collections(vec![
            local_collection("RQQT2234", 1, "Writing", None),
            local_collection("CHILD567", 2, "Thesis", Some("RQQT2234")),
        ])
        .unwrap();

        assert_eq!(collections[0].key, "/0/RQQT2234");
        assert_eq!(collections[0].item_count, None);
        assert_eq!(collections[1].parent_key.as_deref(), Some("/0/RQQT2234"));
    }

    #[tokio::test]
    async fn collection_commit_uses_the_common_research_write_lock() {
        let project = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();
        let research_state = ResearchState::default();
        let (_, epoch, epoch_counter) = state.project_root_epoch().unwrap();
        let target = root.join("zotero.bib").to_string_lossy().into_owned();
        let guard = research_state.lock().await;
        let commit = commit_collection_export(
            &state,
            &research_state,
            &root,
            epoch,
            &epoch_counter,
            &target,
            "@article{one, title={One}}\n".to_owned(),
        );
        tokio::pin!(commit);

        assert!(tokio::time::timeout(Duration::from_millis(20), &mut commit)
            .await
            .is_err());
        drop(guard);
        tokio::time::timeout(Duration::from_secs(1), &mut commit)
            .await
            .expect("commit should resume after releasing the research lock")
            .unwrap();
        assert!(root.join("zotero.bib").is_file());
    }

    #[tokio::test]
    async fn collection_commit_never_replaces_the_single_reference_file() {
        let project = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();
        let research_state = ResearchState::default();
        let (_, epoch, epoch_counter) = state.project_root_epoch().unwrap();
        let target = root.join("references.bib");
        std::fs::write(&target, "@article{local, title={Keep me}}\n").unwrap();

        let result = commit_collection_export(
            &state,
            &research_state,
            &root,
            epoch,
            &epoch_counter,
            &target.to_string_lossy(),
            "@article{collection, title={Collection}}\n".to_owned(),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(
            std::fs::read_to_string(target).unwrap(),
            "@article{local, title={Keep me}}\n"
        );
    }
}
