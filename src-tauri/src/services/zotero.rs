use std::{path::Path, sync::OnceLock, time::Duration};

use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::{ZoteroSearchResult, ZoteroSyncResult},
    services::{filesystem, references},
    state::AppState,
};

const DEFAULT_PORT: u16 = 23_119;
const MAX_SEARCH_LENGTH: usize = 1_024;
const MAX_CITEKEYS: usize = 10_000;
const MAX_COLLECTION_EXPORT_BYTES: usize = 50 * 1024 * 1024;

#[derive(Default)]
pub struct ZoteroSyncState {
    lock: Mutex<()>,
}

impl ZoteroSyncState {
    pub async fn lock(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.lock.lock().await
    }
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
    response.text().await.map_err(zotero_request_error)
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

pub async fn sync_collection(
    state: &AppState,
    collection: &str,
    target_file: Option<String>,
    port: Option<u16>,
) -> AppResult<ZoteroSyncResult> {
    let collection = validate_collection(collection)?;
    let file_path = match target_file {
        Some(path) => path,
        None => state
            .project_root()?
            .join("references.bib")
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
    filesystem::save_file(state, &file_path, content).await?;
    Ok(ZoteroSyncResult {
        file_path,
        bytes_written,
        entry_count,
    })
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
    client()
        .post(endpoint(port, "json-rpc")?)
        .timeout(timeout)
        .json(&request)
        .send()
        .await
        .map_err(zotero_request_error)?
        .error_for_status()
        .map_err(zotero_request_error)?
        .json()
        .await
        .map_err(zotero_request_error)
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
}
