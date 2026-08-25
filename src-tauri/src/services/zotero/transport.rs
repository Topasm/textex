use std::{sync::OnceLock, time::Duration};

use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const DEFAULT_PORT: u16 = 23_119;
const MAX_RPC_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Deserialize)]
pub(super) struct JsonRpcResponse<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Serialize)]
pub(super) struct JsonRpcRequest<P> {
    pub(super) jsonrpc: &'static str,
    pub(super) method: &'static str,
    pub(super) params: P,
}

pub(super) async fn json_rpc<P, T>(
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

pub(super) fn rpc_result<T>(response: JsonRpcResponse<T>) -> AppResult<T> {
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

pub(super) async fn bounded_response(
    mut response: reqwest::Response,
    limit: usize,
) -> AppResult<Vec<u8>> {
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

pub(super) fn endpoint(port: Option<u16>, path: &str) -> AppResult<String> {
    let port = validated_port(port)?;
    Ok(format!("http://127.0.0.1:{port}/better-bibtex/{path}"))
}

pub(super) fn local_api_endpoint(port: Option<u16>, path: &str) -> AppResult<String> {
    let port = validated_port(port)?;
    Ok(format!("http://127.0.0.1:{port}/api/{path}"))
}

pub(super) fn validated_port(port: Option<u16>) -> AppResult<u16> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port == 0 {
        return Err(AppError::Zotero(
            "port must be between 1 and 65535".to_owned(),
        ));
    }
    Ok(port)
}

pub(super) fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(Policy::none())
            .build()
            .expect("valid Zotero HTTP client")
    })
}

pub(super) fn zotero_request_error(error: reqwest::Error) -> AppError {
    AppError::Zotero(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_are_always_loopback_and_reject_zero_port() {
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
    fn json_rpc_results_fail_closed_for_errors_and_missing_results() {
        let error = rpc_result::<serde_json::Value>(JsonRpcResponse {
            result: None,
            error: Some(JsonRpcError {
                code: -32_000,
                message: "failed".to_owned(),
            }),
        })
        .unwrap_err();
        assert!(error.to_string().contains("JSON-RPC -32000: failed"));

        let missing = rpc_result::<serde_json::Value>(JsonRpcResponse {
            result: None,
            error: None,
        })
        .unwrap_err();
        assert!(missing.to_string().contains("no result"));
    }
}
