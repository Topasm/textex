use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
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
    project_epoch: u64,
    generation: u64,
    invalidation_revision: u64,
    index: ReferenceIndex,
}

#[derive(Default)]
pub struct ReferenceIndexState {
    cache: Mutex<Option<CachedReferenceIndex>>,
    build_lock: Mutex<()>,
    invalidation_revision: AtomicU64,
}

impl ReferenceIndexState {
    pub async fn invalidate(&self) {
        // Advance the fence before waiting for the cache lock. A build that
        // started from an older project-index snapshot can therefore never
        // install (or return) its result after this invalidation begins.
        self.invalidation_revision.fetch_add(1, Ordering::AcqRel);
        *self.cache.lock().await = None;
    }

    pub(crate) fn request_revision(&self) -> u64 {
        self.invalidation_revision.load(Ordering::Acquire)
    }

    async fn install_if_current(
        &self,
        cached: CachedReferenceIndex,
        project_epoch_tracker: &AtomicU64,
    ) -> AppResult<()> {
        let mut cache = self.cache.lock().await;
        ensure_request_current(
            self,
            cached.project_epoch,
            project_epoch_tracker,
            cached.invalidation_revision,
        )?;
        *cache = Some(cached);
        Ok(())
    }
}

pub async fn project_index(
    state: &ReferenceIndexState,
    snapshot: ProjectIndexSnapshot,
    project_epoch: u64,
    project_epoch_tracker: &AtomicU64,
    invalidation_revision: u64,
) -> AppResult<ReferenceIndex> {
    ensure_request_current(
        state,
        project_epoch,
        project_epoch_tracker,
        invalidation_revision,
    )?;
    if let Some(index) = cached_index(state, &snapshot, project_epoch, invalidation_revision).await
    {
        ensure_request_current(
            state,
            project_epoch,
            project_epoch_tracker,
            invalidation_revision,
        )?;
        return Ok(index);
    }

    let _build_guard = state.build_lock.lock().await;
    ensure_request_current(
        state,
        project_epoch,
        project_epoch_tracker,
        invalidation_revision,
    )?;
    if let Some(index) = cached_index(state, &snapshot, project_epoch, invalidation_revision).await
    {
        ensure_request_current(
            state,
            project_epoch,
            project_epoch_tracker,
            invalidation_revision,
        )?;
        return Ok(index);
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
    ensure_request_current(
        state,
        project_epoch,
        project_epoch_tracker,
        invalidation_revision,
    )?;
    state
        .install_if_current(
            CachedReferenceIndex {
                root,
                project_epoch,
                generation: snapshot.generation,
                invalidation_revision,
                index: index.clone(),
            },
            project_epoch_tracker,
        )
        .await?;
    ensure_request_current(
        state,
        project_epoch,
        project_epoch_tracker,
        invalidation_revision,
    )?;
    Ok(index)
}

async fn cached_index(
    state: &ReferenceIndexState,
    snapshot: &ProjectIndexSnapshot,
    project_epoch: u64,
    invalidation_revision: u64,
) -> Option<ReferenceIndex> {
    state
        .cache
        .lock()
        .await
        .as_ref()
        .filter(|cached| {
            cached.project_epoch == project_epoch
                && cached.generation == snapshot.generation
                && cached.invalidation_revision == invalidation_revision
                && roots_equal(&cached.root, &snapshot.root)
        })
        .map(|cached| cached.index.clone())
}

fn ensure_request_current(
    state: &ReferenceIndexState,
    project_epoch: u64,
    project_epoch_tracker: &AtomicU64,
    invalidation_revision: u64,
) -> AppResult<()> {
    if project_epoch_tracker.load(Ordering::Acquire) != project_epoch
        || state.invalidation_revision.load(Ordering::Acquire) != invalidation_revision
    {
        return Err(AppError::ReferenceIndex(
            "Reference index request was superseded by a project change".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn roots_equal(left: &str, right: &str) -> bool {
    left == right
}

#[cfg(windows)]
fn roots_equal(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
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
    let mut entries = Vec::new();
    let mut scanned_offset = 0;
    let mut source_line = 1;

    for captures in bib_entry_regex().captures_iter(content) {
        let Some(entry_match) = captures.get(0) else {
            continue;
        };
        source_line += content[scanned_offset..entry_match.start()]
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count() as u32;
        scanned_offset = entry_match.start();

        let Some(entry_type) = captures
            .get(1)
            .map(|value| value.as_str().to_ascii_lowercase())
        else {
            continue;
        };
        if matches!(entry_type.as_str(), "comment" | "string" | "preamble") {
            continue;
        }
        let (Some(key), Some(block)) = (captures.get(2), captures.get(3)) else {
            continue;
        };
        entries.push(BibEntry {
            key: key.as_str().trim().to_owned(),
            entry_type,
            title: extract_field(block.as_str(), title_field_regex()),
            author: extract_field(block.as_str(), author_field_regex()),
            year: extract_field(block.as_str(), year_field_regex()),
            journal: nonempty(extract_field(block.as_str(), journal_field_regex())),
            file: file.map(str::to_owned),
            line: Some(source_line),
        });
    }

    entries
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

fn extract_field(block: &str, regex: &Regex) -> String {
    regex
        .captures(block)
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

fn title_field_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"(?i)title\s*=\s*[{\"]([^}\"]*)[}\"]"#).unwrap())
}

fn author_field_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"(?i)author\s*=\s*[{\"]([^}\"]*)[}\"]"#).unwrap())
}

fn year_field_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"(?i)year\s*=\s*[{\"]([^}\"]*)[}\"]"#).unwrap())
}

fn journal_field_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"(?i)journal\s*=\s*[{\"]([^}\"]*)[}\"]"#).unwrap())
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
    fn preserves_nested_and_multiline_field_parsing() {
        let entries = parse_bib_content(
            r#"@article{nested,
 title={An {Existing} Title},
 author="Ada
 Lovelace",
 year={2026},
 journal={Journal
 of Tests}
}"#,
            None,
        );

        assert_eq!(entries.len(), 1);
        // Keep the established parser semantics: braced fields end at the
        // first closing brace, while quoted and braced values may span lines.
        assert_eq!(entries[0].title, "An {Existing");
        assert_eq!(entries[0].author, "Ada\n Lovelace");
        assert_eq!(entries[0].journal.as_deref(), Some("Journal\n of Tests"));
    }

    #[test]
    fn tracks_source_lines_across_a_large_bibliography() {
        const ENTRY_COUNT: usize = 10_000;
        let mut content = String::with_capacity(ENTRY_COUNT * 120);
        let mut expected_lines = Vec::with_capacity(ENTRY_COUNT);
        let mut next_line = 1_u32;

        for index in 0..ENTRY_COUNT {
            let padding = "\n".repeat(index % 4);
            next_line += padding.len() as u32;
            content.push_str(&padding);
            expected_lines.push(next_line);

            let entry = format!(
                "@article{{key{index},\n title={{Title {index}}},\n author={{Author}},\n year={{2026}},\n journal={{Journal}}\n}}\n"
            );
            next_line += entry.bytes().filter(|byte| *byte == b'\n').count() as u32;
            content.push_str(&entry);
        }

        // This fixture is intentionally large: prefix rescanning would make
        // its work grow quadratically, without relying on a fragile timer.
        let entries = parse_bib_content(&content, Some("/project/large.bib"));

        assert_eq!(entries.len(), ENTRY_COUNT);
        for (index, entry) in entries.iter().enumerate() {
            assert_eq!(entry.key, format!("key{index}"));
            assert_eq!(entry.line, Some(expected_lines[index]));
        }
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

    #[tokio::test(flavor = "current_thread")]
    async fn activation_epoch_prevents_same_root_generation_cache_reuse() {
        let state = ReferenceIndexState::default();
        let epoch_tracker = AtomicU64::new(1);
        let revision = state.request_revision();
        state
            .install_if_current(
                CachedReferenceIndex {
                    root: "/project".to_owned(),
                    project_epoch: 1,
                    generation: 1,
                    invalidation_revision: revision,
                    index: ReferenceIndex {
                        bib_entries: Vec::new(),
                        labels: vec![LabelInfo {
                            label: "old-project".to_owned(),
                            file: "/project/main.tex".to_owned(),
                            line: 1,
                            context: "old".to_owned(),
                        }],
                    },
                },
                &epoch_tracker,
            )
            .await
            .expect("install first activation cache");

        epoch_tracker.store(2, Ordering::Release);
        let rebuilt = project_index(
            &state,
            ProjectIndexSnapshot {
                root: "/project".to_owned(),
                generation: 1,
                entries: Vec::new(),
            },
            2,
            &epoch_tracker,
            revision,
        )
        .await
        .expect("rebuild the repeated path for its new activation");

        assert!(rebuilt.labels.is_empty());
        assert_eq!(
            state
                .cache
                .lock()
                .await
                .as_ref()
                .expect("new activation cache")
                .project_epoch,
            2
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn invalidation_during_build_rejects_the_stale_install() {
        let state = ReferenceIndexState::default();
        let epoch_tracker = AtomicU64::new(7);
        let build_revision = state.request_revision();
        let pending_build = CachedReferenceIndex {
            root: "/project".to_owned(),
            project_epoch: 7,
            generation: 3,
            invalidation_revision: build_revision,
            index: ReferenceIndex::default(),
        };

        // Model a scan that captured its token, then completed only after a
        // bibliography write invalidated the reference cache.
        state.invalidate().await;
        let error = state
            .install_if_current(pending_build, &epoch_tracker)
            .await
            .expect_err("a pre-invalidation build must not install");

        assert!(matches!(error, AppError::ReferenceIndex(_)));
        assert!(state.cache.lock().await.is_none());
    }
}
