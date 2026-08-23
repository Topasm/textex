use std::{
    collections::HashSet,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use futures_util::StreamExt;
use regex::Regex;
use reqwest::{header, redirect::Policy, Client, Response, Url};

use crate::{
    error::{AppError, AppResult},
    models::{
        ResearchChatAccess, ResearchProfile, ResearchResource, ResearchResourceKind,
        ResearchResourceSnapshot,
    },
    services::research_profile,
    state::AppState,
};

const MAX_RESOURCE_ID_BYTES: usize = 128;
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_TEXT_BYTES: usize = 512 * 1024;
const MAX_REDIRECTS: usize = 3;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub async fn snapshot(state: &AppState, resource_id: &str) -> AppResult<ResearchResourceSnapshot> {
    validate_resource_id(resource_id)?;
    // Resolve the URL exclusively from the active project's validated profile.
    let project_operation = state.lock_project_operation().await;
    let (project_root, project_epoch, _) = state.project_root_epoch()?;
    let profile = research_profile::load_unlocked(state).await?;
    let resource = authorized_resource(&profile, resource_id)?;
    let resolved_resource_id = resource.id.clone();
    let configured_url = validate_snapshot_url(
        resource
            .url
            .as_deref()
            .ok_or_else(|| snapshot_error("snapshot resource has no URL"))?,
    )?;
    drop(project_operation);
    let (final_url, response) = tokio::time::timeout(
        REQUEST_TIMEOUT,
        fetch_with_validated_redirects(configured_url.clone()),
    )
    .await
    .map_err(|_| snapshot_error("snapshot request timed out"))??;
    let content_type = validate_content_type(&response)?;
    let (body, response_truncated) = tokio::time::timeout(REQUEST_TIMEOUT, bounded_body(response))
        .await
        .map_err(|_| snapshot_error("snapshot response body timed out"))??;
    let raw = String::from_utf8_lossy(&body);
    let readable = if content_type == "text/html" {
        html_to_readable_text(&raw)?
    } else if content_type == "application/json" {
        json_to_readable_text(&raw)?
    } else {
        normalize_readable_text(&raw)
    };
    let (content, text_truncated) = truncate_utf8(readable, MAX_TEXT_BYTES);
    if content.trim().is_empty() {
        return Err(snapshot_error(
            "snapshot response contained no readable text",
        ));
    }
    let _project_operation = state.lock_project_operation().await;
    let (active_root, active_epoch, _) = state.project_root_epoch()?;
    if active_epoch != project_epoch
        || !crate::services::filesystem::paths_equal(&active_root, &project_root)
    {
        return Err(snapshot_error(
            "the active project changed while the snapshot was being fetched",
        ));
    }
    let profile = research_profile::load_unlocked(state).await?;
    let active_resource = authorized_resource(&profile, resource_id)?;
    let active_url = validate_snapshot_url(
        active_resource
            .url
            .as_deref()
            .ok_or_else(|| snapshot_error("snapshot resource has no URL"))?,
    )?;
    if active_resource.id != resolved_resource_id || active_url != configured_url {
        return Err(snapshot_error(
            "the configured snapshot resource changed while it was being fetched",
        ));
    }
    let fetched_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| snapshot_error(error.to_string()))?
        .as_millis()
        .try_into()
        .map_err(|_| snapshot_error("snapshot timestamp overflowed"))?;

    Ok(ResearchResourceSnapshot {
        resource_id: resolved_resource_id,
        url: final_url.to_string(),
        fetched_at,
        content,
        truncated: response_truncated || text_truncated,
    })
}

fn authorized_resource<'a>(
    profile: &'a ResearchProfile,
    resource_id: &str,
) -> AppResult<&'a ResearchResource> {
    let resource = profile
        .resources
        .iter()
        .find(|resource| resource.id == resource_id)
        .ok_or_else(|| snapshot_error("research resource was not found in the active profile"))?;
    if !matches!(
        resource.kind,
        ResearchResourceKind::Website
            | ResearchResourceKind::Documentation
            | ResearchResourceKind::Dataset
    ) || resource.chat_access != ResearchChatAccess::Snapshot
    {
        return Err(snapshot_error(
            "research resource is not authorized for website snapshots",
        ));
    }
    Ok(resource)
}

async fn fetch_with_validated_redirects(mut url: Url) -> AppResult<(Url, Response)> {
    for redirect_count in 0..=MAX_REDIRECTS {
        let (client, allowed_addresses) = client_for_url(&url).await?;
        let response = client
            .get(url.clone())
            .header(
                header::ACCEPT,
                "text/html, text/plain;q=0.9, application/json;q=0.8",
            )
            .send()
            .await
            .map_err(|error| snapshot_error(format!("snapshot request failed: {error}")))?;
        let remote = response
            .remote_addr()
            .ok_or_else(|| snapshot_error("snapshot response did not expose its remote address"))?;
        if !is_public_ip(remote.ip())
            || !allowed_addresses
                .iter()
                .any(|address| address.ip() == remote.ip())
        {
            return Err(snapshot_error(
                "snapshot connected to an unapproved network destination",
            ));
        }

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err(snapshot_error("snapshot exceeded the redirect limit"));
            }
            let location = response
                .headers()
                .get(header::LOCATION)
                .ok_or_else(|| snapshot_error("snapshot redirect omitted Location"))?
                .to_str()
                .map_err(|_| snapshot_error("snapshot redirect Location is invalid"))?;
            let next = url
                .join(location)
                .map_err(|_| snapshot_error("snapshot redirect URL is invalid"))?;
            url = validate_snapshot_url(next.as_str())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(snapshot_error(format!(
                "snapshot server returned status {}",
                response.status()
            )));
        }
        return Ok((url, response));
    }
    Err(snapshot_error("snapshot exceeded the redirect limit"))
}

async fn client_for_url(url: &Url) -> AppResult<(Client, Vec<SocketAddr>)> {
    let host = url
        .host_str()
        .ok_or_else(|| snapshot_error("snapshot URL has no host"))?
        .to_owned();
    let lookup_host = host.clone();
    let lookup = tauri::async_runtime::spawn_blocking(move || {
        (lookup_host.as_str(), 443)
            .to_socket_addrs()
            .map(|addresses| addresses.collect::<Vec<_>>())
    });
    let addresses = tokio::time::timeout(CONNECT_TIMEOUT, lookup)
        .await
        .map_err(|_| snapshot_error("snapshot DNS lookup timed out"))?
        .map_err(|error| AppError::Worker(error.to_string()))?
        .map_err(|error| snapshot_error(format!("snapshot DNS lookup failed: {error}")))?;
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(snapshot_error(
            "snapshot DNS resolved to a non-public network destination",
        ));
    }
    let mut unique = HashSet::new();
    let addresses = addresses
        .into_iter()
        .filter(|address| unique.insert(*address))
        .collect::<Vec<_>>();
    let client = Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .resolve_to_addrs(&host, &addresses)
        .user_agent("TextEx/ResearchSnapshot")
        .build()
        .map_err(|error| snapshot_error(format!("could not create snapshot client: {error}")))?;
    Ok((client, addresses))
}

fn validate_snapshot_url(value: &str) -> AppResult<Url> {
    let url = Url::parse(value).map_err(|_| snapshot_error("invalid snapshot URL"))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
    {
        return Err(snapshot_error(
            "snapshot URL must be credential-free HTTPS on port 443",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| snapshot_error("snapshot URL has no host"))?;
    let unbracketed = host.trim_matches(['[', ']']);
    if unbracketed.parse::<IpAddr>().is_ok() {
        return Err(snapshot_error("snapshot URL may not use an IP literal"));
    }
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty()
        || host == "localhost"
        || host.ends_with(".localhost")
        || host == "local"
        || host.ends_with(".local")
        || host == "home.arpa"
        || host.ends_with(".home.arpa")
        || host == "test"
        || host.ends_with(".test")
        || host == "invalid"
        || host.ends_with(".invalid")
        || host == "example"
        || host.ends_with(".example")
        || host == "onion"
        || host.ends_with(".onion")
    {
        return Err(snapshot_error("snapshot URL uses a reserved host"));
    }
    Ok(url)
}

fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_ipv4(address),
        IpAddr::V6(address) => is_public_ipv6(address),
    }
}

fn is_public_ipv4(address: Ipv4Addr) -> bool {
    let [a, b, c, d] = address.octets();
    !(a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224
        || (a == 255 && b == 255 && c == 255 && d == 255))
}

fn is_public_ipv6(address: Ipv6Addr) -> bool {
    if let Some(mapped) = address.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }
    let segments = address.segments();
    // Public IPv6 unicast is currently allocated from 2000::/3. Exclude
    // protocol assignments, benchmarking, documentation, ORCHID, and 6to4.
    (0x2000..=0x3fff).contains(&segments[0])
        && !(segments[0] == 0x2001 && segments[1] <= 0x01ff)
        && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        && segments[0] != 0x2002
}

fn validate_content_type(response: &Response) -> AppResult<&'static str> {
    let value = response
        .headers()
        .get(header::CONTENT_TYPE)
        .ok_or_else(|| snapshot_error("snapshot response omitted Content-Type"))?
        .to_str()
        .map_err(|_| snapshot_error("snapshot Content-Type is invalid"))?;
    let media_type = value
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    match media_type.as_str() {
        "text/html" => Ok("text/html"),
        "text/plain" => Ok("text/plain"),
        "application/json" => Ok("application/json"),
        _ => Err(snapshot_error("snapshot Content-Type is not supported")),
    }
}

async fn bounded_body(response: Response) -> AppResult<(Vec<u8>, bool)> {
    if response.content_length().is_some_and(|length| length == 0) {
        return Err(snapshot_error("snapshot response was empty"));
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    let mut truncated = false;
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|error| snapshot_error(format!("snapshot body failed: {error}")))?;
        let remaining = MAX_RESPONSE_BYTES.saturating_sub(bytes.len());
        if chunk.len() > remaining {
            bytes.extend_from_slice(&chunk[..remaining]);
            truncated = true;
            break;
        }
        bytes.extend_from_slice(&chunk);
        if bytes.len() == MAX_RESPONSE_BYTES {
            truncated = true;
            break;
        }
    }
    if bytes.is_empty() {
        return Err(snapshot_error("snapshot response was empty"));
    }
    Ok((bytes, truncated))
}

fn html_to_readable_text(html: &str) -> AppResult<String> {
    let scripts = Regex::new(
        r"(?is)<(?:script|style|noscript|template)\b[^>]*>.*?(?:</(?:script|style|noscript|template)\s*>|$)",
    )
    .map_err(|error| snapshot_error(error.to_string()))?;
    let blocks = Regex::new(
        r"(?is)</?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)\b[^>]*>",
    )
    .map_err(|error| snapshot_error(error.to_string()))?;
    let tags = Regex::new(r"(?is)<[^>]*>").map_err(|error| snapshot_error(error.to_string()))?;
    let without_scripts = scripts.replace_all(html, "\n");
    let with_breaks = blocks.replace_all(&without_scripts, "\n");
    let without_tags = tags.replace_all(&with_breaks, " ");
    Ok(normalize_readable_text(&decode_html_entities(
        &without_tags,
    )))
}

fn json_to_readable_text(json: &str) -> AppResult<String> {
    let value: serde_json::Value = serde_json::from_str(json)
        .map_err(|_| snapshot_error("snapshot response contained invalid JSON"))?;
    let formatted = serde_json::to_string_pretty(&value)
        .map_err(|error| snapshot_error(format!("could not format snapshot JSON: {error}")))?;
    Ok(normalize_readable_text(&formatted))
}

fn decode_html_entities(value: &str) -> String {
    let mut decoded = value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    let numeric = Regex::new(r"&#(?:(?P<hex>[xX][0-9A-Fa-f]+)|(?P<dec>[0-9]+));").unwrap();
    decoded = numeric
        .replace_all(&decoded, |captures: &regex::Captures<'_>| {
            let value = if let Some(hex) = captures.name("hex") {
                u32::from_str_radix(&hex.as_str()[1..], 16).ok()
            } else {
                captures
                    .name("dec")
                    .and_then(|value| value.as_str().parse::<u32>().ok())
            };
            value
                .and_then(char::from_u32)
                .filter(|character| !character.is_control() || matches!(*character, '\n' | '\t'))
                .map(String::from)
                .unwrap_or_default()
        })
        .into_owned();
    decoded
}

fn normalize_readable_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len().min(MAX_TEXT_BYTES));
    let mut line = String::new();
    let mut pending_blank_line = false;
    for raw_line in value.lines() {
        line.clear();
        for word in raw_line.split_whitespace() {
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        if line.is_empty() {
            if !output.is_empty() {
                pending_blank_line = true;
            }
            continue;
        }
        if !output.is_empty() {
            output.push('\n');
            if pending_blank_line {
                output.push('\n');
            }
        }
        output.push_str(&line);
        pending_blank_line = false;
    }
    output
}

fn truncate_utf8(mut value: String, max_bytes: usize) -> (String, bool) {
    if value.len() <= max_bytes {
        return (value, false);
    }
    let mut boundary = max_bytes;
    while boundary > 0 && !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    value.truncate(boundary);
    (value.trim_end().to_owned(), true)
}

fn validate_resource_id(resource_id: &str) -> AppResult<()> {
    if resource_id.is_empty()
        || resource_id.len() > MAX_RESOURCE_ID_BYTES
        || !resource_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(snapshot_error("invalid research resource ID"));
    }
    Ok(())
}

fn snapshot_error(message: impl Into<String>) -> AppError {
    AppError::ResearchSource(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ResearchPaperMetadata, ResearchResource};

    fn profile(kind: ResearchResourceKind, access: ResearchChatAccess) -> ResearchProfile {
        ResearchProfile {
            version: 1,
            paper: ResearchPaperMetadata {
                title: String::new(),
                r#abstract: None,
                doi: None,
                arxiv: None,
                venue: None,
                website: None,
                authors: Vec::new(),
            },
            resources: vec![ResearchResource {
                id: "project-site".to_owned(),
                kind,
                label: "Project website".to_owned(),
                url: Some("https://example.org/paper".to_owned()),
                ssh_url: None,
                local_path: None,
                branch: None,
                chat_access: access,
            }],
            instructions: Vec::new(),
        }
    }

    #[test]
    fn authorizes_only_saved_snapshot_resources() {
        assert!(authorized_resource(
            &profile(ResearchResourceKind::Website, ResearchChatAccess::Snapshot),
            "project-site"
        )
        .is_ok());
        assert!(authorized_resource(
            &profile(ResearchResourceKind::Git, ResearchChatAccess::Snapshot),
            "project-site"
        )
        .is_err());
        assert!(authorized_resource(
            &profile(ResearchResourceKind::Website, ResearchChatAccess::Metadata),
            "project-site"
        )
        .is_err());
    }

    #[test]
    fn snapshot_urls_reject_credentials_ports_literals_and_reserved_hosts() {
        assert!(validate_snapshot_url("https://www.rust-lang.org/learn").is_ok());
        assert!(validate_snapshot_url("http://www.rust-lang.org").is_err());
        assert!(validate_snapshot_url("https://token@example.org/private").is_err());
        assert!(validate_snapshot_url("https://example.org:8443/private").is_err());
        assert!(validate_snapshot_url("https://127.0.0.1/private").is_err());
        assert!(validate_snapshot_url("https://[::1]/private").is_err());
        assert!(validate_snapshot_url("https://localhost/private").is_err());
        assert!(validate_snapshot_url("https://service.internal.test/private").is_err());
    }

    #[test]
    fn address_filter_rejects_private_link_local_and_reserved_ranges() {
        for address in [
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.1.2",
            "172.16.0.1",
            "192.0.2.1",
            "192.168.1.1",
            "198.18.0.1",
            "203.0.113.1",
            "224.0.0.1",
            "::1",
            "fe80::1",
            "fc00::1",
            "2001:db8::1",
        ] {
            assert!(!is_public_ip(address.parse().unwrap()), "{address}");
        }
        assert!(is_public_ip("8.8.8.8".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn html_snapshot_removes_executable_sections_and_tags() {
        let html = r#"<html><head><style>.secret {display:none}</style><script>ignore()</script></head><body><h1>Paper &amp; Code</h1><p>Loss: &#955;</p><template>hidden</template></body></html>"#;
        let text = html_to_readable_text(html).unwrap();

        assert!(text.contains("Paper & Code"));
        assert!(text.contains("Loss: λ"));
        assert!(!text.contains("ignore"));
        assert!(!text.contains("display:none"));
        assert!(!text.contains("hidden"));
        assert!(!text.contains('<'));
    }

    #[test]
    fn utf8_truncation_keeps_a_valid_character_boundary() {
        let (value, truncated) = truncate_utf8("a😀b".repeat(200_000), MAX_TEXT_BYTES);
        assert!(truncated);
        assert!(value.len() <= MAX_TEXT_BYTES);
        assert!(std::str::from_utf8(value.as_bytes()).is_ok());
    }
}
