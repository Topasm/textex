use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};

use regex::Regex;
use tokio::{fs, sync::Mutex};

use crate::{
    error::{AppError, AppResult},
    models::{BibEntry, LabelInfo, ProjectIndexSnapshot, ReferenceIndex},
    state::AppState,
};

const MAX_REFERENCE_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Clone)]
struct CachedReferenceIndex {
    root: String,
    generation: u64,
    index: ReferenceIndex,
}

#[derive(Default)]
pub struct ReferenceIndexState {
    cache: Mutex<Option<CachedReferenceIndex>>,
    build_lock: Mutex<()>,
}

impl ReferenceIndexState {
    pub async fn invalidate(&self) {
        *self.cache.lock().await = None;
    }
}

pub async fn project_index(
    state: &ReferenceIndexState,
    snapshot: ProjectIndexSnapshot,
) -> AppResult<ReferenceIndex> {
    if let Some(cached) = state.cache.lock().await.as_ref() {
        if cached.root == snapshot.root && cached.generation == snapshot.generation {
            return Ok(cached.index.clone());
        }
    }

    let _build_guard = state.build_lock.lock().await;
    if let Some(cached) = state.cache.lock().await.as_ref() {
        if cached.root == snapshot.root && cached.generation == snapshot.generation {
            return Ok(cached.index.clone());
        }
    }

    let root = snapshot.root.clone();
    let files = snapshot
        .entries
        .into_iter()
        .filter(|entry| matches!(entry.entry_type, crate::models::DirectoryEntryType::File))
        .filter_map(|entry| {
            let extension = Path::new(&entry.path)
                .extension()
                .and_then(|value| value.to_str())?;
            (extension.eq_ignore_ascii_case("bib") || extension.eq_ignore_ascii_case("tex"))
                .then_some((entry.path, entry.size))
        })
        .collect::<Vec<_>>();
    let index = tauri::async_runtime::spawn_blocking(move || scan_files(files))
        .await
        .map_err(|error| AppError::ReferenceIndex(error.to_string()))?;
    *state.cache.lock().await = Some(CachedReferenceIndex {
        root,
        generation: snapshot.generation,
        index: index.clone(),
    });
    Ok(index)
}

pub async fn parse_bib_file(state: &AppState, file_path: &str) -> AppResult<Vec<BibEntry>> {
    let path = validate_bib_file(state, file_path).await?;
    let display = path.to_string_lossy().into_owned();
    let metadata = fs::metadata(&path)
        .await
        .map_err(|source| AppError::io("inspect bibliography", display.clone(), source))?;
    if metadata.len() > MAX_REFERENCE_FILE_BYTES {
        return Err(AppError::ReferenceIndex(format!(
            "bibliography exceeds 10 MiB: {display}"
        )));
    }
    let content = fs::read_to_string(&path)
        .await
        .map_err(|source| AppError::io("read bibliography", display.clone(), source))?;
    tauri::async_runtime::spawn_blocking(move || parse_bib_content(&content, Some(&display)))
        .await
        .map_err(|error| AppError::ReferenceIndex(error.to_string()))
}

fn scan_files(files: Vec<(String, Option<u64>)>) -> ReferenceIndex {
    let mut index = ReferenceIndex::default();
    for (file, known_size) in files {
        if known_size.is_some_and(|size| size > MAX_REFERENCE_FILE_BYTES) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };
        if content.len() as u64 > MAX_REFERENCE_FILE_BYTES {
            continue;
        }
        let extension = Path::new(&file)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if extension.eq_ignore_ascii_case("bib") {
            index
                .bib_entries
                .extend(parse_bib_content(&content, Some(&file)));
        } else if extension.eq_ignore_ascii_case("tex") {
            index.labels.extend(parse_labels(&content, &file));
        }
    }
    index
}

pub(crate) fn parse_bib_content(content: &str, file: Option<&str>) -> Vec<BibEntry> {
    bib_entry_regex()
        .captures_iter(content)
        .filter_map(|captures| {
            let entry_match = captures.get(0)?;
            let entry_type = captures.get(1)?.as_str().to_ascii_lowercase();
            if matches!(entry_type.as_str(), "comment" | "string" | "preamble") {
                return None;
            }
            let block = captures.get(3)?.as_str();
            Some(BibEntry {
                key: captures.get(2)?.as_str().trim().to_owned(),
                entry_type,
                title: extract_field(block, "title"),
                author: extract_field(block, "author"),
                year: extract_field(block, "year"),
                journal: nonempty(extract_field(block, "journal")),
                file: file.map(str::to_owned),
                line: Some(
                    content[..entry_match.start()]
                        .bytes()
                        .filter(|byte| *byte == b'\n')
                        .count() as u32
                        + 1,
                ),
            })
        })
        .collect()
}

fn parse_labels(content: &str, file: &str) -> Vec<LabelInfo> {
    content
        .lines()
        .enumerate()
        .flat_map(|(line_number, line)| {
            label_regex()
                .captures_iter(line)
                .filter_map(move |captures| {
                    Some(LabelInfo {
                        label: captures.get(1)?.as_str().to_owned(),
                        file: file.to_owned(),
                        line: line_number as u32 + 1,
                        context: line.trim().to_owned(),
                    })
                })
        })
        .collect()
}

fn extract_field(block: &str, field: &str) -> String {
    let pattern = format!(
        r#"(?i){}\s*=\s*[{{\"]([^}}\"]*)[}}\"]"#,
        regex::escape(field)
    );
    Regex::new(&pattern)
        .ok()
        .and_then(|regex| regex.captures(block))
        .and_then(|captures| captures.get(1))
        .map_or_else(String::new, |value| value.as_str().trim().to_owned())
}

fn nonempty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn bib_entry_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"(?s)@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*)").unwrap())
}

fn label_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\\label\{([^}]+)\}").unwrap())
}

async fn validate_bib_file(state: &AppState, file_path: &str) -> AppResult<PathBuf> {
    if file_path.is_empty() || file_path.contains('\0') {
        return Err(AppError::InvalidPath(file_path.to_owned()));
    }
    let requested = PathBuf::from(file_path);
    if !requested.is_absolute()
        || !requested
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"))
    {
        return Err(AppError::InvalidPath(file_path.to_owned()));
    }
    let display = requested.to_string_lossy().into_owned();
    let canonical = tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(requested))
        .await
        .map_err(|error| AppError::ReferenceIndex(error.to_string()))?
        .map_err(|source| AppError::io("resolve bibliography", display, source))?;
    let project_root = state.project_root()?;
    if !path_is_within(&project_root, &canonical) {
        return Err(AppError::OutsideProject(
            canonical.to_string_lossy().into_owned(),
        ));
    }
    Ok(canonical)
}

#[cfg(not(windows))]
fn path_is_within(root: &Path, candidate: &Path) -> bool {
    candidate.starts_with(root)
}

#[cfg(windows)]
fn path_is_within(root: &Path, candidate: &Path) -> bool {
    let mut candidate_components = candidate.components();
    root.components().all(|root_component| {
        candidate_components
            .next()
            .is_some_and(|candidate_component| {
                root_component
                    .as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(&candidate_component.as_os_str().to_string_lossy())
            })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bibliography_fields_and_source_lines() {
        let entries = parse_bib_content(
            "@comment{skip}\n@article{smith2026,\n title={A Paper},\n author={A. Smith},\n year={2026},\n journal={J. Tests}\n}",
            Some("/project/references.bib"),
        );
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key, "smith2026");
        assert_eq!(entries[0].title, "A Paper");
        assert_eq!(entries[0].line, Some(2));
    }

    #[test]
    fn parses_multiple_labels_per_line() {
        let labels = parse_labels(
            "\\section{Intro}\\label{sec:intro}\\label{sec:start}\nBody",
            "/project/main.tex",
        );
        assert_eq!(labels.len(), 2);
        assert_eq!(labels[1].label, "sec:start");
        assert_eq!(labels[1].line, 1);
    }
}
