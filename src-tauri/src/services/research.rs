use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
    time::Duration,
};

use regex::Regex;
use reqwest::{redirect::Policy, Client};
use serde::Deserialize;
use tokio::{fs, io::AsyncReadExt, sync::Mutex};

use crate::{
    error::{AppError, AppResult},
    models::{OnlineReference, ReferenceAddResult, ResearchConfig},
    services::{filesystem, references, research_limits},
    state::AppState,
};

const MAX_QUERY_BYTES: usize = 512;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CONFIG_BYTES: u64 = 64 * 1024;
const MAX_BIBLIOGRAPHY_BYTES: u64 = 10 * 1024 * 1024;
const MAX_EXPORTED_ENTRY_BYTES: usize = 2 * 1024 * 1024;
const MAX_TITLE_BYTES: usize = 16 * 1024;
const MAX_ABSTRACT_BYTES: usize = 256 * 1024;
const MAX_AUTHORS: usize = 256;
const MAX_AUTHOR_BYTES: usize = 2 * 1024;

#[derive(Default)]
pub struct ResearchState {
    write_lock: Mutex<()>,
}

pub(crate) struct ProjectCommit<T> {
    pub(crate) result: T,
    pub(crate) project_root: PathBuf,
    pub(crate) project_epoch: u64,
}

struct ProjectActivation<'a> {
    root: &'a Path,
    epoch: u64,
    epoch_counter: &'a AtomicU64,
}

impl ResearchState {
    pub async fn lock(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.write_lock.lock().await
    }
}

#[derive(Deserialize)]
struct CrossrefEnvelope {
    message: CrossrefMessage,
}

#[derive(Deserialize)]
struct CrossrefMessage {
    #[serde(default)]
    items: Vec<CrossrefWork>,
}

#[derive(Deserialize)]
struct CrossrefWork {
    #[serde(rename = "DOI")]
    doi: Option<String>,
    #[serde(default)]
    title: Vec<String>,
    #[serde(default)]
    author: Vec<CrossrefAuthor>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    #[serde(rename = "URL")]
    url: Option<String>,
    published: Option<CrossrefDate>,
    issued: Option<CrossrefDate>,
}

#[derive(Deserialize)]
struct CrossrefAuthor {
    given: Option<String>,
    family: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct CrossrefDate {
    #[serde(rename = "date-parts")]
    date_parts: Vec<Vec<u32>>,
}

pub async fn search_online(query: &str) -> AppResult<Vec<OnlineReference>> {
    let query = query.trim();
    if query.len() < 2 {
        return Ok(Vec::new());
    }
    if query.len() > MAX_QUERY_BYTES {
        return Err(AppError::ReferenceIndex(
            "online search query is too long".to_owned(),
        ));
    }

    let (crossref_result, arxiv_result) = tokio::join!(search_crossref(query), search_arxiv(query));
    let mut results = Vec::new();
    let crossref_error = match crossref_result {
        Ok(items) => {
            results.extend(items);
            None
        }
        Err(error) => Some(error),
    };
    let arxiv_error = match arxiv_result {
        Ok(items) => {
            results.extend(items);
            None
        }
        Err(error) => Some(error),
    };
    if results.is_empty() {
        if let (Some(crossref_error), Some(arxiv_error)) = (crossref_error, arxiv_error) {
            return Err(AppError::ReferenceIndex(format!(
                "online search failed: {crossref_error}; {arxiv_error}"
            )));
        }
    }

    let mut identities = HashSet::new();
    results.retain(|item| identities.insert(reference_identity(item)));
    results.truncate(40);
    Ok(results)
}

pub async fn add_online(
    state: &AppState,
    mut reference: OnlineReference,
) -> AppResult<ProjectCommit<ReferenceAddResult>> {
    validate_online_reference(&reference)?;
    normalize_reference(&mut reference);
    let (root, epoch, epoch_counter) = state.project_root_epoch()?;
    let config = load_config(state).await?;
    let file_path = root.join(config.references_file);
    let citekey = create_citekey(&reference);
    let bibtex = render_bibtex(&reference, &citekey);
    ensure_project_epoch(epoch, &epoch_counter)?;
    let result = merge_bibtex(
        state,
        ProjectActivation {
            root: &root,
            epoch,
            epoch_counter: &epoch_counter,
        },
        file_path,
        &bibtex,
        &citekey,
        reference.doi.as_deref().or(reference.arxiv_id.as_deref()),
    )
    .await?;
    Ok(ProjectCommit {
        result,
        project_root: root,
        project_epoch: epoch,
    })
}

pub async fn merge_exported_bibtex(
    state: &AppState,
    root: &Path,
    project_epoch: u64,
    epoch_counter: &std::sync::Arc<std::sync::atomic::AtomicU64>,
    bibtex: &str,
    requested_key: &str,
) -> AppResult<ReferenceAddResult> {
    if bibtex.trim().is_empty() || bibtex.len() > MAX_EXPORTED_ENTRY_BYTES {
        return Err(AppError::ReferenceIndex(
            "exported bibliography entry is empty or too large".to_owned(),
        ));
    }
    if !research_limits::is_safe_citation_key(requested_key) {
        return Err(AppError::ReferenceIndex(
            "exported bibliography has an invalid citation key".to_owned(),
        ));
    }
    if epoch_counter.load(Ordering::Acquire) != project_epoch
        || !state
            .project_root()
            .is_ok_and(|active_root| filesystem::paths_equal(&active_root, root))
    {
        return Err(AppError::ReferenceIndex(
            "project changed while adding reference".to_owned(),
        ));
    }
    let config = load_config(state).await?;
    merge_bibtex(
        state,
        ProjectActivation {
            root,
            epoch: project_epoch,
            epoch_counter,
        },
        root.join(config.references_file),
        bibtex,
        requested_key,
        extract_field(bibtex, "doi")
            .or_else(|| extract_field(bibtex, "eprint"))
            .as_deref(),
    )
    .await
}

pub async fn load_config(state: &AppState) -> AppResult<ResearchConfig> {
    let Some(path) = existing_config_path(state).await? else {
        return Ok(ResearchConfig::default());
    };
    let metadata = fs::metadata(&path).await.map_err(|source| {
        AppError::io("inspect research config", path.to_string_lossy(), source)
    })?;
    if metadata.len() > MAX_CONFIG_BYTES {
        return Err(AppError::ProjectData(
            "research config exceeds 64 KiB".to_owned(),
        ));
    }
    let file = fs::File::open(&path)
        .await
        .map_err(|source| AppError::io("open research config", path.to_string_lossy(), source))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|source| AppError::io("read research config", path.to_string_lossy(), source))?;
    let config: ResearchConfig = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::ProjectData(format!("invalid research config: {error}")))?;
    validate_config(&config)?;
    Ok(config)
}

pub async fn save_config(
    state: &AppState,
    mut config: ResearchConfig,
) -> AppResult<ResearchConfig> {
    config.version = 1;
    validate_config(&config)?;
    let _project_operation = state.lock_project_operation().await;
    let root = state.project_root()?;
    let directory = root.join(".textex");
    let directory = filesystem::validate_project_directory_target(state, directory).await?;
    fs::create_dir_all(&directory).await.map_err(|source| {
        AppError::io(
            "create research config directory",
            directory.to_string_lossy(),
            source,
        )
    })?;
    let path_text = directory
        .join("research.json")
        .to_string_lossy()
        .into_owned();
    let path = filesystem::validate_save_file_target(state, &path_text).await?;
    let bytes = serde_json::to_vec_pretty(&config)
        .map_err(|error| AppError::ProjectData(error.to_string()))?;
    filesystem::write_files_transactionally(vec![(path, bytes)]).await?;
    Ok(config)
}

async fn existing_config_path(state: &AppState) -> AppResult<Option<PathBuf>> {
    let root = state.project_root()?;
    let requested = root.join(".textex").join("research.json");
    match fs::symlink_metadata(&requested).await {
        Ok(_) => {
            let path_text = requested.to_string_lossy().into_owned();
            filesystem::validate_existing_project_file(state, &path_text)
                .await
                .map(Some)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(AppError::io(
            "inspect research config",
            requested.to_string_lossy(),
            source,
        )),
    }
}

async fn search_crossref(query: &str) -> Result<Vec<OnlineReference>, String> {
    let response = client()
        .get("https://api.crossref.org/works")
        .query(&[("query.bibliographic", query), ("rows", "20")])
        .header(
            "User-Agent",
            "TextEx/1.0 (https://github.com/Topasm/textex)",
        )
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let bytes = bounded_body(response).await?;
    let envelope: CrossrefEnvelope =
        serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    Ok(envelope
        .message
        .items
        .into_iter()
        .filter_map(crossref_reference)
        .collect())
}

async fn search_arxiv(query: &str) -> Result<Vec<OnlineReference>, String> {
    let response = client()
        .get("https://export.arxiv.org/api/query")
        .query(&[
            ("search_query", format!("all:{query}")),
            ("max_results", "20".to_owned()),
        ])
        .header(
            "User-Agent",
            "TextEx/1.0 (https://github.com/Topasm/textex)",
        )
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let bytes = bounded_body(response).await?;
    let body = String::from_utf8(bytes).map_err(|error| error.to_string())?;
    Ok(parse_arxiv(&body))
}

async fn bounded_body(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("online search response is too large".to_owned());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err("online search response is too large".to_owned());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn crossref_reference(work: CrossrefWork) -> Option<OnlineReference> {
    let title = work.title.into_iter().next()?.trim().to_owned();
    if title.is_empty() {
        return None;
    }
    let doi = work.doi.map(|value| value.to_lowercase());
    let year = work
        .published
        .or(work.issued)
        .and_then(|date| {
            date.date_parts
                .first()
                .and_then(|part| part.first())
                .copied()
        })
        .map_or_else(String::new, |value| value.to_string());
    let authors = work
        .author
        .into_iter()
        .map(|author| {
            author.name.unwrap_or_else(|| {
                [author.given, author.family]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
        })
        .filter(|author| !author.is_empty())
        .collect::<Vec<_>>();
    let id = doi.clone().unwrap_or_else(|| normalize_title(&title));
    Some(OnlineReference {
        source: "crossref".to_owned(),
        id,
        title,
        authors,
        year,
        item_type: work.item_type.unwrap_or_else(|| "article".to_owned()),
        doi,
        arxiv_id: None,
        url: work.url,
        r#abstract: None,
    })
}

fn parse_arxiv(xml: &str) -> Vec<OnlineReference> {
    let entry_re = Regex::new(r"(?s)<entry>(.*?)</entry>").expect("valid arXiv entry regex");
    entry_re
        .captures_iter(xml)
        .filter_map(|entry| {
            let body = entry.get(1)?.as_str();
            let url = xml_tag(body, "id")?;
            let arxiv_id = url.rsplit('/').next()?.split('v').next()?.to_owned();
            let title = collapse_whitespace(&xml_tag(body, "title")?);
            let year = xml_tag(body, "published")
                .and_then(|published| published.get(0..4).map(str::to_owned))
                .unwrap_or_default();
            let author_re = Regex::new(r"(?s)<author>.*?<name>(.*?)</name>.*?</author>")
                .expect("valid arXiv author regex");
            let authors = author_re
                .captures_iter(body)
                .filter_map(|capture| capture.get(1))
                .map(|value| decode_xml(value.as_str()))
                .collect();
            Some(OnlineReference {
                source: "arxiv".to_owned(),
                id: arxiv_id.clone(),
                title: decode_xml(&title),
                authors,
                year,
                item_type: "article".to_owned(),
                doi: xml_tag(body, "arxiv:doi").map(|value| value.to_lowercase()),
                arxiv_id: Some(arxiv_id),
                url: Some(url),
                r#abstract: xml_tag(body, "summary")
                    .map(|value| decode_xml(&collapse_whitespace(&value))),
            })
        })
        .collect()
}

fn xml_tag(input: &str, tag: &str) -> Option<String> {
    let expression = format!(r"(?s)<{tag}[^>]*>(.*?)</{tag}>");
    Regex::new(&expression)
        .ok()?
        .captures(input)?
        .get(1)
        .map(|value| decode_xml(value.as_str()).trim().to_owned())
}

fn decode_xml(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn reference_identity(reference: &OnlineReference) -> String {
    reference
        .doi
        .as_ref()
        .map(|doi| format!("doi:{}", doi.to_lowercase()))
        .or_else(|| reference.arxiv_id.as_ref().map(|id| format!("arxiv:{id}")))
        .unwrap_or_else(|| format!("title:{}", normalize_title(&reference.title)))
}

fn normalize_title(title: &str) -> String {
    title
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn create_citekey(reference: &OnlineReference) -> String {
    let author = reference
        .authors
        .first()
        .and_then(|name| name.split_whitespace().last())
        .unwrap_or("ref");
    let title_word = reference
        .title
        .split_whitespace()
        .find(|word| word.chars().any(char::is_alphanumeric))
        .unwrap_or("work");
    sanitize_key(&format!("{author}{}{title_word}", reference.year))
}

fn sanitize_key(value: &str) -> String {
    let key = value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, ':' | '-' | '_')
        })
        .collect::<String>();
    if key.is_empty() {
        "reference".to_owned()
    } else {
        key
    }
}

fn render_bibtex(reference: &OnlineReference, key: &str) -> String {
    let mut fields = vec![format!("  title = {{{}}}", bib_escape(&reference.title))];
    if !reference.authors.is_empty() {
        fields.push(format!(
            "  author = {{{}}}",
            bib_escape(&reference.authors.join(" and "))
        ));
    }
    if !reference.year.is_empty() {
        fields.push(format!("  year = {{{}}}", bib_escape(&reference.year)));
    }
    if let Some(doi) = &reference.doi {
        fields.push(format!("  doi = {{{}}}", bib_escape(doi)));
    }
    if let Some(url) = &reference.url {
        fields.push(format!("  url = {{{}}}", bib_escape(url)));
    }
    if let Some(arxiv_id) = &reference.arxiv_id {
        fields.push(format!("  eprint = {{{}}}", bib_escape(arxiv_id)));
        fields.push("  archivePrefix = {arXiv}".to_owned());
    }
    format!(
        "@{}{{{key},\n{}\n}}\n",
        bib_entry_type(&reference.item_type),
        fields.join(",\n")
    )
}

fn bib_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    let mut previous_was_space = false;
    for character in value.chars() {
        let is_space = character.is_whitespace() || character.is_control();
        if is_space {
            if !previous_was_space {
                escaped.push(' ');
            }
            previous_was_space = true;
            continue;
        }
        previous_was_space = false;
        match character {
            '\\' => escaped.push_str("\\textbackslash{}"),
            '{' => escaped.push_str("\\{"),
            '}' => escaped.push_str("\\}"),
            '&' => escaped.push_str("\\&"),
            '%' => escaped.push_str("\\%"),
            '#' => escaped.push_str("\\#"),
            '_' => escaped.push_str("\\_"),
            '$' => escaped.push_str("\\$"),
            '^' => escaped.push_str("\\^{}"),
            '~' => escaped.push_str("\\~{}"),
            _ => escaped.push(character),
        }
    }
    escaped.trim().to_owned()
}

async fn merge_bibtex(
    state: &AppState,
    activation: ProjectActivation<'_>,
    file_path: PathBuf,
    bibtex: &str,
    requested_key: &str,
    identity: Option<&str>,
) -> AppResult<ReferenceAddResult> {
    let _project_operation = state.lock_project_operation().await;
    if bibtex.len() > MAX_EXPORTED_ENTRY_BYTES {
        return Err(AppError::ReferenceIndex(
            "bibliography entry exceeds 2 MiB".to_owned(),
        ));
    }
    if activation.epoch_counter.load(Ordering::Acquire) != activation.epoch
        || !state
            .project_root()
            .is_ok_and(|root| filesystem::paths_equal(&root, activation.root))
    {
        return Err(AppError::ReferenceIndex(
            "project changed while adding reference".to_owned(),
        ));
    }
    let path_text = file_path.to_string_lossy().into_owned();
    let validated = filesystem::validate_save_file_target(state, &path_text).await?;
    match fs::metadata(&validated).await {
        Ok(metadata) if metadata.len() > MAX_BIBLIOGRAPHY_BYTES => {
            return Err(AppError::ReferenceIndex(
                "managed bibliography exceeds 10 MiB".to_owned(),
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(source) => {
            return Err(AppError::io(
                "inspect managed bibliography",
                &path_text,
                source,
            ));
        }
    }
    let existing = match fs::read_to_string(&validated).await {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(source) => {
            return Err(AppError::io(
                "read managed bibliography",
                &path_text,
                source,
            ))
        }
    };
    let committed_path_text = filesystem::path_to_string(&validated)?;
    let entries = references::parse_bib_content(&existing, None);
    if let Some(identity) = identity {
        if let Some(citekey) = existing_identity_citekey(&existing, identity) {
            return Ok(ReferenceAddResult {
                file_path: committed_path_text,
                citekey,
                inserted: false,
                duplicate: true,
            });
        }
    }
    let existing_keys = entries
        .iter()
        .map(|entry| entry.key.as_str())
        .collect::<HashSet<_>>();
    let citekey = unique_citekey(requested_key, &existing_keys);
    let rendered_entry = if citekey == requested_key {
        bibtex.trim().to_owned()
    } else {
        replace_first_citekey(bibtex, &citekey)?
    };
    let separator = if existing.trim().is_empty() {
        ""
    } else {
        "\n\n"
    };
    let merged = format!("{}{separator}{rendered_entry}", existing.trim_end());
    if merged.len() as u64 > MAX_BIBLIOGRAPHY_BYTES {
        return Err(AppError::ReferenceIndex(
            "managed bibliography would exceed 10 MiB".to_owned(),
        ));
    }
    if activation.epoch_counter.load(Ordering::Acquire) != activation.epoch
        || !state
            .project_root()
            .is_ok_and(|root| filesystem::paths_equal(&root, activation.root))
    {
        return Err(AppError::ReferenceIndex(
            "project changed while adding reference".to_owned(),
        ));
    }
    filesystem::write_files_transactionally(vec![(validated, format!("{merged}\n").into_bytes())])
        .await?;
    Ok(ReferenceAddResult {
        file_path: committed_path_text,
        citekey,
        inserted: true,
        duplicate: false,
    })
}

fn unique_citekey(requested: &str, existing: &HashSet<&str>) -> String {
    if !existing.contains(requested) {
        return requested.to_owned();
    }
    for index in 0..=existing.len() {
        let candidate = format!("{requested}{}", alphabetic_suffix(index));
        if !existing.contains(candidate.as_str()) {
            return candidate;
        }
    }
    // The loop has more candidates than the number of occupied keys, so this
    // is unreachable unless the set changes independently.
    requested.to_owned()
}

fn alphabetic_suffix(mut index: usize) -> String {
    let mut suffix = Vec::new();
    loop {
        suffix.push((b'a' + (index % 26) as u8) as char);
        if index < 26 {
            break;
        }
        index = index / 26 - 1;
    }
    suffix.iter().rev().collect()
}

fn replace_first_citekey(bibtex: &str, citekey: &str) -> AppResult<String> {
    let header = Regex::new(r"(?is)(@\s*[a-z]+\s*\{\s*)[^,\r\n]+(\s*,)")
        .map_err(|error| AppError::ReferenceIndex(error.to_string()))?;
    if !header.is_match(bibtex) {
        return Err(AppError::ReferenceIndex(
            "exported bibliography entry has no parseable citation key".to_owned(),
        ));
    }
    Ok(header
        .replace(bibtex, |captures: &regex::Captures<'_>| {
            format!("{}{citekey}{}", &captures[1], &captures[2])
        })
        .into_owned())
}

fn existing_identity_citekey(content: &str, identity: &str) -> Option<String> {
    let identity = identity.trim().to_ascii_lowercase();
    let header = Regex::new(r"(?is)@\s*[a-z]+\s*\{\s*([^,\r\n]+)\s*,").ok()?;
    let mut entries = header.captures_iter(content).peekable();

    while let Some(captures) = entries.next() {
        let key = captures.get(1)?.as_str().trim();
        let fields_start = captures.get(0)?.end();
        let fields_end = entries
            .peek()
            .and_then(|next| next.get(0))
            .map_or(content.len(), |next| next.start());
        let fields = content.get(fields_start..fields_end)?;
        if ["doi", "eprint"].into_iter().any(|field| {
            extract_field(fields, field)
                .is_some_and(|value| value.trim().eq_ignore_ascii_case(&identity))
        }) {
            return Some(key.to_owned());
        }
    }

    None
}

fn extract_field(content: &str, field: &str) -> Option<String> {
    let expression = format!(
        r#"(?i){field}\s*=\s*[{{"]([^}}"]+)"#,
        field = regex::escape(field)
    );
    Regex::new(&expression)
        .ok()?
        .captures(content)?
        .get(1)
        .map(|value| value.as_str().trim().to_owned())
}

fn validate_config(config: &ResearchConfig) -> AppResult<()> {
    validate_managed_file(&config.references_file)?;
    validate_managed_file(&config.zotero_file)?;
    if config
        .references_file
        .eq_ignore_ascii_case(&config.zotero_file)
    {
        return Err(AppError::ProjectData(
            "referencesFile and zoteroFile must name different bibliography files".to_owned(),
        ));
    }
    if let Some(collection) = &config.zotero_collection {
        validate_collection(collection)?;
    }
    Ok(())
}

fn validate_managed_file(file: &str) -> AppResult<()> {
    let path = PathBuf::from(file);
    if path.is_absolute()
        || path.components().count() != 1
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("bib"))
    {
        return Err(AppError::ProjectData(format!(
            "invalid managed bibliography file: {file}"
        )));
    }
    Ok(())
}

fn validate_collection(collection: &str) -> AppResult<()> {
    let collection = collection.trim();
    if collection.is_empty()
        || collection.len() > 2_048
        || !collection.starts_with('/')
        || collection
            .chars()
            .any(|character| character.is_control() || matches!(character, '?' | '#' | '&'))
    {
        return Err(AppError::ProjectData(
            "invalid Zotero collection path".to_owned(),
        ));
    }
    Ok(())
}

fn validate_online_reference(reference: &OnlineReference) -> AppResult<()> {
    if !matches!(reference.source.as_str(), "crossref" | "arxiv") {
        return Err(invalid_reference("unsupported online reference source"));
    }
    validate_required_text("reference id", &reference.id, 2_048)?;
    validate_required_text("reference title", &reference.title, MAX_TITLE_BYTES)?;
    if reference.authors.len() > MAX_AUTHORS {
        return Err(invalid_reference("reference has too many authors"));
    }
    for author in &reference.authors {
        validate_required_text("reference author", author, MAX_AUTHOR_BYTES)?;
    }
    validate_optional_text("reference year", Some(&reference.year), 32)?;
    validate_required_text("reference type", &reference.item_type, 128)?;
    validate_optional_text("reference DOI", reference.doi.as_ref(), 2_048)?;
    validate_optional_text("reference arXiv id", reference.arxiv_id.as_ref(), 2_048)?;
    validate_optional_text(
        "reference abstract",
        reference.r#abstract.as_ref(),
        MAX_ABSTRACT_BYTES,
    )?;
    if let Some(url) = &reference.url {
        validate_optional_text("reference URL", Some(url), 4_096)?;
        let parsed =
            reqwest::Url::parse(url).map_err(|_| invalid_reference("reference URL is invalid"))?;
        if !matches!(parsed.scheme(), "https" | "http")
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err(invalid_reference("reference URL is not allowed"));
        }
    }
    Ok(())
}

pub(crate) fn validate_online_reference_for_import(reference: &OnlineReference) -> AppResult<()> {
    validate_online_reference(reference)
}

fn validate_required_text(label: &str, value: &str, max_bytes: usize) -> AppResult<()> {
    if value.trim().is_empty() || value.len() > max_bytes || value.contains('\0') {
        return Err(invalid_reference(&format!("{label} is invalid")));
    }
    Ok(())
}

fn validate_optional_text(label: &str, value: Option<&String>, max_bytes: usize) -> AppResult<()> {
    if value.is_some_and(|value| value.len() > max_bytes || value.contains('\0')) {
        return Err(invalid_reference(&format!("{label} is invalid")));
    }
    Ok(())
}

fn invalid_reference(message: &str) -> AppError {
    AppError::ReferenceIndex(message.to_owned())
}

fn normalize_reference(reference: &mut OnlineReference) {
    reference.source.make_ascii_lowercase();
    reference.id = reference.id.trim().to_owned();
    reference.title = collapse_whitespace(reference.title.trim());
    reference.authors = reference
        .authors
        .iter()
        .map(|author| collapse_whitespace(author.trim()))
        .collect();
    reference.year = collapse_whitespace(reference.year.trim());
    reference.item_type = reference.item_type.trim().to_ascii_lowercase();
    reference.doi = reference
        .doi
        .take()
        .map(|doi| doi.trim().to_ascii_lowercase())
        .filter(|doi| !doi.is_empty());
    reference.arxiv_id = reference
        .arxiv_id
        .take()
        .map(|id| id.trim().to_owned())
        .filter(|id| !id.is_empty());
    reference.url = reference
        .url
        .take()
        .map(|url| url.trim().to_owned())
        .filter(|url| !url.is_empty());
    reference.r#abstract = reference
        .r#abstract
        .take()
        .map(|abstract_text| collapse_whitespace(abstract_text.trim()))
        .filter(|abstract_text| !abstract_text.is_empty());
}

fn bib_entry_type(item_type: &str) -> &'static str {
    match item_type.to_ascii_lowercase().as_str() {
        "book" | "book-chapter" | "monograph" => "book",
        "proceedings-article" | "inproceedings" => "inproceedings",
        "dissertation" | "thesis" => "phdthesis",
        "report" | "report-component" => "techreport",
        "posted-content" | "preprint" => "unpublished",
        _ => "article",
    }
}

fn ensure_project_epoch(
    expected: u64,
    epoch: &std::sync::Arc<std::sync::atomic::AtomicU64>,
) -> AppResult<()> {
    if epoch.load(Ordering::Acquire) != expected {
        return Err(AppError::ReferenceIndex(
            "project changed while adding reference".to_owned(),
        ));
    }
    Ok(())
}

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(Policy::custom(|attempt| {
                let allowed = attempt
                    .url()
                    .host_str()
                    .is_some_and(|host| matches!(host, "api.crossref.org" | "export.arxiv.org"));
                if allowed && attempt.previous().len() < 3 {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .expect("valid research HTTP client")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn online_reference() -> OnlineReference {
        OnlineReference {
            source: "crossref".to_owned(),
            id: "10.1000/example".to_owned(),
            title: "A Useful Paper".to_owned(),
            authors: vec!["Ada Lovelace".to_owned()],
            year: "2026".to_owned(),
            item_type: "journal-article".to_owned(),
            doi: Some("10.1000/example".to_owned()),
            arxiv_id: None,
            url: Some("https://doi.org/10.1000/example".to_owned()),
            r#abstract: Some("An abstract".to_owned()),
        }
    }

    #[test]
    fn parses_arxiv_feed() {
        let items = parse_arxiv(
            r#"<feed><entry><id>http://arxiv.org/abs/2401.12345v2</id><title>A Paper</title><published>2024-01-02T00:00:00Z</published><author><name>Ada Lovelace</name></author><summary>Useful work</summary></entry></feed>"#,
        );
        assert_eq!(items[0].arxiv_id.as_deref(), Some("2401.12345"));
        assert_eq!(items[0].authors, vec!["Ada Lovelace"]);
    }

    #[test]
    fn creates_stable_key() {
        let reference = OnlineReference {
            source: "arxiv".to_owned(),
            id: "1".to_owned(),
            title: "Diffusion Policy".to_owned(),
            authors: vec!["Cheng Chi".to_owned()],
            year: "2023".to_owned(),
            item_type: "article".to_owned(),
            doi: None,
            arxiv_id: None,
            url: None,
            r#abstract: None,
        };
        assert_eq!(create_citekey(&reference), "Chi2023Diffusion");
    }

    #[test]
    fn validates_reference_payload_and_escapes_bibtex_fields() {
        let mut reference = online_reference();
        assert!(validate_online_reference(&reference).is_ok());
        reference.source = "untrusted".to_owned();
        assert!(validate_online_reference(&reference).is_err());

        let rendered = render_bibtex(&online_reference(), "Lovelace2026Useful");
        assert!(rendered.starts_with("@article{Lovelace2026Useful,"));
        assert!(rendered.contains("doi = {10.1000/example}"));
        assert_eq!(bib_escape("line\n{value}"), "line \\{value\\}");
        assert_eq!(
            bib_escape("A & B_1 costs $5% #x ^ ~"),
            "A \\& B\\_1 costs \\$5\\% \\#x \\^{} \\~{}"
        );
    }

    #[test]
    fn duplicate_identity_requires_an_exact_doi_or_eprint_field() {
        let bibliography = r#"@article{first,
  title = {Mentions 10.1000/example in prose},
  doi = {10.1000/example-long}
}

@article{second,
  eprint = {2401.12345}
}"#;

        assert_eq!(
            existing_identity_citekey(bibliography, "10.1000/example-long").as_deref(),
            Some("first")
        );
        assert_eq!(
            existing_identity_citekey(bibliography, "2401.12345").as_deref(),
            Some("second")
        );
        assert_eq!(
            existing_identity_citekey(bibliography, "10.1000/example"),
            None
        );
    }

    #[test]
    fn resolves_citation_key_collisions_with_alphabetic_suffixes() {
        let mut existing = HashSet::new();
        existing.insert("Chi2023Diffusion");
        existing.insert("Chi2023Diffusiona");
        assert_eq!(
            unique_citekey("Chi2023Diffusion", &existing),
            "Chi2023Diffusionb"
        );
        assert_eq!(alphabetic_suffix(25), "z");
        assert_eq!(alphabetic_suffix(26), "aa");
        assert!(replace_first_citekey(
            "@article{Chi2023Diffusion,\n  title = {Other}\n}",
            "Chi2023Diffusionb"
        )
        .unwrap()
        .starts_with("@article{Chi2023Diffusionb,"));
    }

    #[test]
    fn rejects_one_file_for_collection_sync_and_single_reference_merges() {
        let config = ResearchConfig {
            references_file: "References.bib".to_owned(),
            zotero_file: "references.bib".to_owned(),
            ..ResearchConfig::default()
        };

        assert!(validate_config(&config).is_err());
    }

    #[tokio::test]
    async fn atomically_saves_and_loads_project_research_config() {
        let project = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();
        let config = ResearchConfig {
            zotero_collection: Some("/0/8CV58ZVD".to_owned()),
            sync_on_open: true,
            ..ResearchConfig::default()
        };

        assert_eq!(save_config(&state, config.clone()).await.unwrap(), config);
        assert_eq!(load_config(&state).await.unwrap(), config);
        assert!(root.join(".textex/research.json").is_file());
    }

    #[tokio::test]
    async fn adds_online_reference_once_and_reports_duplicate_doi() {
        let project = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();

        let inserted = add_online(&state, online_reference()).await.unwrap().result;
        assert!(inserted.inserted);
        assert!(!inserted.duplicate);
        let duplicate = add_online(&state, online_reference()).await.unwrap().result;
        assert!(!duplicate.inserted);
        assert!(duplicate.duplicate);
        let bibliography = std::fs::read_to_string(root.join("references.bib")).unwrap();
        assert_eq!(bibliography.matches("@article{").count(), 1);
    }

    #[tokio::test]
    async fn stale_same_root_epoch_cannot_commit_after_an_aba_transition() {
        let project = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();
        let (_, old_epoch, epoch_counter) = state.project_root_epoch().unwrap();

        state
            .set_project_root(dunce::canonicalize(other.path()).unwrap())
            .unwrap();
        state.set_project_root(root.clone()).unwrap();
        let result = merge_bibtex(
            &state,
            ProjectActivation {
                root: &root,
                epoch: old_epoch,
                epoch_counter: &epoch_counter,
            },
            root.join("references.bib"),
            "@article{old,\n  doi = {10.1000/old}\n}",
            "old",
            Some("10.1000/old"),
        )
        .await;

        assert!(result.is_err());
        assert!(!root.join("references.bib").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_research_config_symlink_escape() {
        use std::os::unix::fs::symlink;

        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        std::fs::create_dir(root.join(".textex")).unwrap();
        symlink(
            outside.path().join("research.json"),
            root.join(".textex/research.json"),
        )
        .unwrap();
        let state = AppState::default();
        state.set_project_root(root).unwrap();
        assert!(load_config(&state).await.is_err());
    }
}
