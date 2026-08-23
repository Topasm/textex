use std::{
    collections::HashMap,
    path::Path,
    sync::{atomic::Ordering, OnceLock},
    time::Duration,
};

use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::{
        OnlineReference, ReferenceAddResult, ZoteroCollection, ZoteroSaveResult,
        ZoteroSearchResult, ZoteroSyncResult,
    },
    services::{
        filesystem, references,
        research::{self, ResearchState},
    },
    state::AppState,
};

const DEFAULT_PORT: u16 = 23_119;
const MAX_SEARCH_LENGTH: usize = 1_024;
const MAX_CITEKEYS: usize = 10_000;
const MAX_COLLECTION_EXPORT_BYTES: usize = 50 * 1024 * 1024;
const MAX_RPC_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CAYW_RESPONSE_BYTES: usize = 64 * 1024;
const MAX_COLLECTIONS: usize = 10_000;
const MAX_LOCAL_API_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

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
    failed: HashMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
struct LocalItemEnvelope {
    data: LocalItemData,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalItemData {
    key: String,
    #[serde(default)]
    title: String,
    #[serde(rename = "DOI", default)]
    doi: String,
    #[serde(default)]
    archive_location: String,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Serialize)]
struct JsonRpcRequest<P> {
    jsonrpc: &'static str,
    method: &'static str,
    params: P,
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

#[derive(Debug, Deserialize)]
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

pub async fn cite_cayw(port: Option<u16>) -> AppResult<String> {
    let response = client()
        .get(endpoint(port, "cayw?format=latex")?)
        .timeout(Duration::from_secs(300))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let bytes = bounded_response(response, MAX_CAYW_RESPONSE_BYTES).await?;
    String::from_utf8(bytes)
        .map_err(|_| AppError::Zotero("CAYW response is not valid UTF-8".to_owned()))
}

pub async fn export_bibtex(citekeys: Vec<String>, port: Option<u16>) -> AppResult<String> {
    if citekeys.is_empty() {
        return Ok(String::new());
    }
    if citekeys.len() > MAX_CITEKEYS || citekeys.iter().any(|key| !valid_citekey(key)) {
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

pub async fn collections(port: Option<u16>) -> AppResult<Vec<ZoteroCollection>> {
    let response: JsonRpcResponse<serde_json::Value> = json_rpc(
        port,
        JsonRpcRequest {
            jsonrpc: "2.0",
            method: "user.groups",
            params: [true],
        },
        Duration::from_secs(15),
    )
    .await?;
    let value = rpc_result(response)?;
    let mut result = Vec::new();
    collect_libraries(&value, &mut result);
    if result.len() > MAX_COLLECTIONS {
        return Err(AppError::Zotero(
            "Zotero returned too many collections".to_owned(),
        ));
    }
    result.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    result.dedup_by(|left, right| left.key == right.key);
    Ok(result)
}

pub async fn add_to_project(
    state: &AppState,
    citekey: String,
    port: Option<u16>,
) -> AppResult<ReferenceAddResult> {
    if !valid_citekey(&citekey) {
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
    research::merge_exported_bibtex(state, &root, &bibtex, &citekey).await
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

pub async fn sync_collection(
    state: &AppState,
    research_state: &ResearchState,
    collection: &str,
    target_file: Option<String>,
    port: Option<u16>,
) -> AppResult<ZoteroSyncResult> {
    let (root, epoch, epoch_counter) = state.project_root_epoch()?;
    let collection = validate_collection(collection)?;
    let file_path = match target_file {
        Some(path) => path,
        None => state
            .project_root()?
            .join("zotero.bib")
            .to_string_lossy()
            .into_owned(),
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
    let url = collection_endpoint(port, collection)?;

    let mut response = client()
        .get(url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
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
    commit_collection_export(
        state,
        research_state,
        &root,
        epoch,
        &epoch_counter,
        &file_path,
        content,
    )
    .await?;
    Ok(ZoteroSyncResult {
        file_path,
        bytes_written,
        entry_count,
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
) -> AppResult<()> {
    // Collection downloads remain deduplicated by ZoteroSyncState. Only the
    // final local commit joins the ResearchState critical section shared by
    // online and Zotero single-reference additions and research config writes.
    let _write_guard = research_state.lock().await;
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
    filesystem::write_files_transactionally(vec![(target, content.into_bytes())]).await
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
            if valid_citekey(&citekey) {
                return Ok(Some(citekey));
            }
        }
        if attempt < 4 {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }
    Ok(None)
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

async fn json_rpc<P, T>(
    port: Option<u16>,
    request: JsonRpcRequest<P>,
    timeout: Duration,
) -> AppResult<JsonRpcResponse<T>>
where
    P: Serialize,
    T: for<'de> Deserialize<'de>,
{
    let response = client()
        .post(endpoint(port, "json-rpc")?)
        .timeout(timeout)
        .json(&request)
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?;
    let bytes = bounded_response(response, MAX_RPC_RESPONSE_BYTES).await?;
    serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Zotero(format!("invalid JSON-RPC response: {error}")))
}

async fn bounded_response(mut response: reqwest::Response, limit: usize) -> AppResult<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(AppError::Zotero("Zotero response is too large".to_owned()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(zotero_request_error)? {
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err(AppError::Zotero("Zotero response is too large".to_owned()));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn rpc_result<T>(response: JsonRpcResponse<T>) -> AppResult<T> {
    if let Some(error) = response.error {
        return Err(AppError::Zotero(format!(
            "JSON-RPC {}: {}",
            error.code, error.message
        )));
    }
    response
        .result
        .ok_or_else(|| AppError::Zotero("Zotero returned no result".to_owned()))
}

fn endpoint(port: Option<u16>, path: &str) -> AppResult<String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port == 0 {
        return Err(AppError::Zotero(
            "port must be between 1 and 65535".to_owned(),
        ));
    }
    Ok(format!("http://127.0.0.1:{port}/better-bibtex/{path}"))
}

fn local_api_endpoint(port: Option<u16>, path: &str) -> AppResult<String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port == 0 {
        return Err(AppError::Zotero(
            "port must be between 1 and 65535".to_owned(),
        ));
    }
    Ok(format!("http://127.0.0.1:{port}/api/{path}"))
}

fn collection_endpoint(port: Option<u16>, collection: &str) -> AppResult<reqwest::Url> {
    let mut url = reqwest::Url::parse(&endpoint(port, "collection")?)
        .map_err(|error| AppError::Zotero(error.to_string()))?;
    url.set_query(Some(&format!("{collection}.bibtex")));
    Ok(url)
}

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(Policy::none())
            .build()
            .expect("valid Zotero HTTP client")
    })
}

fn zotero_request_error(error: reqwest::Error) -> AppError {
    AppError::Zotero(error.to_string())
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

fn valid_citekey(key: &str) -> bool {
    !key.is_empty() && key.len() <= 512 && !key.chars().any(char::is_control)
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

fn collect_libraries(value: &serde_json::Value, result: &mut Vec<ZoteroCollection>) {
    let Some(libraries) = value.as_array() else {
        return;
    };
    for library in libraries {
        let Some(object) = library.as_object() else {
            continue;
        };
        let library_id = object
            .get("id")
            .or_else(|| object.get("libraryID"))
            .and_then(value_identifier)
            .unwrap_or_else(|| "0".to_owned());
        if let Some(collections) = object.get("collections") {
            collect_collections(collections, &library_id, None, result);
        }
    }
}

fn collect_collections(
    value: &serde_json::Value,
    library_id: &str,
    inherited_parent: Option<&str>,
    result: &mut Vec<ZoteroCollection>,
) {
    if result.len() > MAX_COLLECTIONS {
        return;
    }
    match value {
        serde_json::Value::Array(values) => {
            for value in values {
                collect_collections(value, library_id, inherited_parent, result);
            }
        }
        serde_json::Value::Object(object) => {
            let name = object
                .get("name")
                .or_else(|| object.get("title"))
                .and_then(serde_json::Value::as_str);
            let key = object
                .get("key")
                .or_else(|| object.get("id"))
                .and_then(value_identifier);
            let current_key = if let (Some(name), Some(key)) = (name, key) {
                let export_path = if key.starts_with('/') {
                    key
                } else {
                    format!("/{library_id}/{key}")
                };
                result.push(ZoteroCollection {
                    key: export_path.clone(),
                    name: name.to_owned(),
                    parent_key: inherited_parent.map(str::to_owned),
                    item_count: collection_item_count(object),
                });
                Some(export_path)
            } else {
                inherited_parent.map(str::to_owned)
            };
            for (field, child) in object {
                if matches!(
                    field.as_str(),
                    "collections" | "children" | "subcollections"
                ) {
                    collect_collections(child, library_id, current_key.as_deref(), result);
                }
            }
        }
        _ => {}
    }
}

fn collection_item_count(object: &serde_json::Map<String, serde_json::Value>) -> u32 {
    object
        .get("itemCount")
        .or_else(|| object.get("numItems"))
        .or_else(|| object.get("items"))
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_array().map(|items| items.len() as u64))
        })
        .unwrap_or(0)
        .min(u32::MAX as u64) as u32
}

fn value_identifier(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|id| id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn endpoint_is_always_loopback_and_rejects_zero_port() {
        assert_eq!(
            endpoint(Some(24_119), "json-rpc").unwrap(),
            "http://127.0.0.1:24119/better-bibtex/json-rpc"
        );
        assert!(endpoint(Some(0), "json-rpc").is_err());
        assert_eq!(
            local_api_endpoint(Some(24_119), "users/0/items").unwrap(),
            "http://127.0.0.1:24119/api/users/0/items"
        );
        assert!(local_api_endpoint(Some(0), "users/0/items").is_err());
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
    }

    #[test]
    fn maps_group_collections_to_pull_export_paths() {
        let value = serde_json::json!([
            {
                "id": 0,
                "name": "My Library",
                "collections": [
                    {
                        "key": "ROOT1234",
                        "name": "Research",
                        "items": [1, 2],
                        "collections": [
                            { "key": "CHILD567", "name": "Papers", "itemCount": 3 }
                        ]
                    }
                ]
            }
        ]);
        let mut collections = Vec::new();
        collect_libraries(&value, &mut collections);
        assert_eq!(collections[0].key, "/0/ROOT1234");
        assert_eq!(collections[0].item_count, 2);
        assert_eq!(collections[1].key, "/0/CHILD567");
        assert_eq!(collections[1].parent_key.as_deref(), Some("/0/ROOT1234"));
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
