use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::{
        CitationGroup, CompileDatabase, CompileRecord, NewProjectBookmark, NewProjectSnippet,
        ProjectBookmark, ProjectDatabase, ProjectSnippet,
    },
    services::filesystem,
    state::AppState,
};

const DATABASE_VERSION: u32 = 1;
const MAX_JSON_BYTES: u64 = 4 * 1024 * 1024;
const MAX_COMPILE_LOG_BYTES: usize = 10 * 1024 * 1024;
const MAX_SHORT_TEXT_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 1024 * 1024;
const MAX_ITEMS: usize = 10_000;
const MAX_CITATION_GROUPS: usize = 1_000;
const MAX_CITATION_KEYS: usize = 100_000;
static NEXT_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct ProjectDataState {
    operation_lock: Mutex<()>,
}

#[derive(Default, Deserialize, Serialize)]
struct CitationData {
    groups: Vec<CitationGroup>,
}

pub async fn init(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<ProjectDatabase> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let textex_dir = ensure_textex_directories(state, &root).await?;
    let project_path = textex_dir.join("project.json");
    let project = match tokio::fs::symlink_metadata(&project_path).await {
        Ok(_) => read_json_or_default(state, &project_path, default_project).await?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let mut project = default_project()?;
            project.name = project_name(&root);
            project
        }
        Err(source) => {
            return Err(AppError::io(
                "inspect project metadata",
                display(&project_path),
                source,
            ))
        }
    };

    let mut missing = Vec::new();
    add_missing_json(state, &project_path, &project, &mut missing).await?;
    let compile = default_compile()?;
    add_missing_json(
        state,
        &textex_dir.join("compile.json"),
        &compile,
        &mut missing,
    )
    .await?;
    add_missing_json(
        state,
        &textex_dir.join("snippets.json"),
        &Vec::<ProjectSnippet>::new(),
        &mut missing,
    )
    .await?;
    add_missing_json(
        state,
        &textex_dir.join("bookmarks.json"),
        &Vec::<ProjectBookmark>::new(),
        &mut missing,
    )
    .await?;
    if !missing.is_empty() {
        filesystem::write_files_transactionally(missing).await?;
    }
    Ok(project)
}

pub async fn exists(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<bool> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let requested = root.join(".textex");
    match tokio::fs::symlink_metadata(&requested).await {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(AppError::io(
            "inspect project metadata directory",
            display(&requested),
            source,
        )),
        Ok(_) => {
            let directory = filesystem::validate_project_directory_target(state, requested).await?;
            let metadata = tokio::fs::metadata(&directory).await.map_err(|source| {
                AppError::io(
                    "inspect project metadata directory",
                    display(&directory),
                    source,
                )
            })?;
            Ok(metadata.is_dir())
        }
    }
}

pub async fn load_project(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<ProjectDatabase> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_path(state, &root, "project.json").await?;
    read_json_or_default(state, &path, default_project).await
}

pub async fn save_project(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    partial: Value,
) -> AppResult<ProjectDatabase> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "project.json").await?;
    let current = read_json_or_default(state, &path, default_project).await?;
    let Value::Object(partial) = partial else {
        return Err(AppError::ProjectData(
            "project metadata update must be an object".to_owned(),
        ));
    };
    let mut merged =
        serde_json::to_value(current).map_err(|error| AppError::ProjectData(error.to_string()))?;
    let Value::Object(ref mut current) = merged else {
        unreachable!("ProjectDatabase always serializes to an object")
    };
    current.extend(partial);
    current.insert("version".to_owned(), Value::from(DATABASE_VERSION));
    let project: ProjectDatabase = serde_json::from_value(merged)
        .map_err(|error| AppError::ProjectData(format!("invalid project metadata: {error}")))?;
    validate_project(&project)?;
    write_json(state, path, &project).await?;
    Ok(project)
}

pub async fn touch(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<()> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "project.json").await?;
    let mut project = read_json_or_default(state, &path, default_project).await?;
    project.last_opened = now_iso()?;
    validate_project(&project)?;
    write_json(state, path, &project).await
}

pub async fn load_compile(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<CompileDatabase> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_path(state, &root, "compile.json").await?;
    read_json_or_default(state, &path, default_compile).await
}

pub async fn save_compile_record(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    record: CompileRecord,
) -> AppResult<CompileDatabase> {
    validate_compile_record(&record)?;
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "compile.json").await?;
    let mut database = read_json_or_default(state, &path, default_compile).await?;
    if database.records.len() >= MAX_ITEMS && !database.records.contains_key(&record.file_path) {
        return Err(AppError::ProjectData(
            "compile metadata contains too many records".to_owned(),
        ));
    }
    database.version = DATABASE_VERSION;
    database.total_compiles = database.total_compiles.saturating_add(1);
    database.last_compiled = Some(record.last_compiled.clone());
    database.records.insert(record.file_path.clone(), record);
    write_json(state, path, &database).await?;
    Ok(database)
}

pub async fn clear_compile(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<CompileDatabase> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "compile.json").await?;
    let database = default_compile()?;
    write_json(state, path, &database).await?;
    Ok(database)
}

pub async fn save_compile_log(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    file_path: &str,
    log: String,
) -> AppResult<String> {
    if log.len() > MAX_COMPILE_LOG_BYTES {
        return Err(AppError::ProjectData(
            "compile log exceeds 10 MiB".to_owned(),
        ));
    }
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let source = filesystem::validate_existing_project_file(state, file_path).await?;
    let compile_dir = ensure_compile_directory(state, &root).await?;
    let path = compile_dir.join(compile_log_name(&source)?);
    let path = filesystem::validate_save_file_target(state, path_to_str(&path)?).await?;
    filesystem::write_files_transactionally(vec![(path.clone(), log.into_bytes())]).await?;
    Ok(display(&path))
}

pub async fn load_compile_log(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    file_path: &str,
) -> AppResult<Option<String>> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let source = filesystem::validate_existing_project_file(state, file_path).await?;
    let textex_dir = metadata_directory(state, &root).await?;
    let path = textex_dir.join("compile").join(compile_log_name(&source)?);
    match tokio::fs::symlink_metadata(&path).await {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(AppError::io("inspect compile log", display(&path), source)),
        Ok(_) => {
            let path =
                filesystem::validate_existing_project_file(state, path_to_str(&path)?).await?;
            read_text(&path, MAX_COMPILE_LOG_BYTES as u64)
                .await
                .map(Some)
        }
    }
}

pub async fn load_snippets(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<Vec<ProjectSnippet>> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_path(state, &root, "snippets.json").await?;
    read_json_or_default(state, &path, empty_vec).await
}

pub async fn add_snippet(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    snippet: NewProjectSnippet,
) -> AppResult<ProjectSnippet> {
    validate_snippet_input(&snippet)?;
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "snippets.json").await?;
    let mut snippets = read_json_or_default(state, &path, empty_vec).await?;
    if snippets.len() >= MAX_ITEMS {
        return Err(AppError::ProjectData(
            "too many project snippets".to_owned(),
        ));
    }
    let snippet = ProjectSnippet {
        id: unique_id("snippet")?,
        prefix: snippet.prefix,
        label: snippet.label,
        body: snippet.body,
        description: snippet.description,
    };
    snippets.push(snippet.clone());
    write_json(state, path, &snippets).await?;
    Ok(snippet)
}

pub async fn remove_snippet(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    id: &str,
) -> AppResult<()> {
    validate_short_text("snippet id", id)?;
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "snippets.json").await?;
    let mut snippets: Vec<ProjectSnippet> = read_json_or_default(state, &path, empty_vec).await?;
    snippets.retain(|snippet| snippet.id != id);
    write_json(state, path, &snippets).await
}

pub async fn load_bookmarks(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<Vec<ProjectBookmark>> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_path(state, &root, "bookmarks.json").await?;
    read_json_or_default(state, &path, empty_vec).await
}

pub async fn add_bookmark(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    bookmark: NewProjectBookmark,
) -> AppResult<ProjectBookmark> {
    validate_bookmark_input(&bookmark)?;
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "bookmarks.json").await?;
    let mut bookmarks = read_json_or_default(state, &path, empty_vec).await?;
    if bookmarks.len() >= MAX_ITEMS {
        return Err(AppError::ProjectData(
            "too many project bookmarks".to_owned(),
        ));
    }
    let bookmark = ProjectBookmark {
        id: unique_id("bm")?,
        file: bookmark.file,
        line: bookmark.line,
        column: bookmark.column,
        label: bookmark.label,
        created: now_iso()?,
    };
    bookmarks.push(bookmark.clone());
    write_json(state, path, &bookmarks).await?;
    Ok(bookmark)
}

pub async fn remove_bookmark(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    id: &str,
) -> AppResult<()> {
    validate_short_text("bookmark id", id)?;
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "bookmarks.json").await?;
    let mut bookmarks: Vec<ProjectBookmark> = read_json_or_default(state, &path, empty_vec).await?;
    bookmarks.retain(|bookmark| bookmark.id != id);
    write_json(state, path, &bookmarks).await
}

pub async fn load_citation_groups(
    app: &AppHandle,
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
) -> AppResult<Vec<CitationGroup>> {
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_path(state, &root, "citations.json").await?;
    let citations_exist = tokio::fs::try_exists(&path)
        .await
        .map_err(|source| AppError::io("inspect citation groups", display(&path), source))?;
    let data: CitationData =
        read_json_or_default(state, &path, || Ok(CitationData::default())).await?;
    validate_citation_groups(&data.groups)?;
    if citations_exist {
        return Ok(data.groups);
    }

    for legacy_path in legacy_citation_paths(app, project_root, &root)? {
        let Ok(bytes) = read_bounded_file(&legacy_path, MAX_JSON_BYTES).await else {
            continue;
        };
        let Ok(legacy) = serde_json::from_slice::<CitationData>(&bytes) else {
            continue;
        };
        if legacy.groups.is_empty() || validate_citation_groups(&legacy.groups).is_err() {
            continue;
        }
        let target = metadata_write_path(state, &root, "citations.json").await?;
        write_json(state, target, &legacy).await?;
        return Ok(legacy.groups);
    }
    Ok(Vec::new())
}

pub async fn save_citation_groups(
    state: &AppState,
    project_data_state: &ProjectDataState,
    project_root: &str,
    groups: Vec<CitationGroup>,
) -> AppResult<()> {
    validate_citation_groups(&groups)?;
    let _guard = project_data_state.operation_lock.lock().await;
    let root = validate_project_root(state, project_root).await?;
    let path = metadata_write_path(state, &root, "citations.json").await?;
    write_json(state, path, &CitationData { groups }).await
}

async fn validate_project_root(state: &AppState, project_root: &str) -> AppResult<PathBuf> {
    let requested = filesystem::canonical_project_directory(project_root).await?;
    let active = state.project_root()?;
    if !filesystem::paths_equal(&requested, &active) {
        return Err(AppError::OutsideProject(display(&requested)));
    }
    Ok(active)
}

async fn ensure_textex_directories(state: &AppState, root: &Path) -> AppResult<PathBuf> {
    let requested =
        filesystem::validate_project_directory_target(state, root.join(".textex")).await?;
    tokio::fs::create_dir_all(&requested)
        .await
        .map_err(|source| {
            AppError::io(
                "create project metadata directory",
                display(&requested),
                source,
            )
        })?;
    let textex_dir = filesystem::validate_project_directory_target(state, requested).await?;
    let history_dir =
        filesystem::validate_project_directory_target(state, textex_dir.join("history")).await?;
    tokio::fs::create_dir_all(&history_dir)
        .await
        .map_err(|source| {
            AppError::io(
                "create project history directory",
                display(&history_dir),
                source,
            )
        })?;
    filesystem::validate_project_directory_target(state, history_dir).await?;
    let compile_dir =
        filesystem::validate_project_directory_target(state, textex_dir.join("compile")).await?;
    tokio::fs::create_dir_all(&compile_dir)
        .await
        .map_err(|source| {
            AppError::io(
                "create project compile directory",
                display(&compile_dir),
                source,
            )
        })?;
    filesystem::validate_project_directory_target(state, compile_dir).await?;
    Ok(textex_dir)
}

async fn ensure_compile_directory(state: &AppState, root: &Path) -> AppResult<PathBuf> {
    let textex_dir = ensure_metadata_directory(state, root).await?;
    let compile_dir =
        filesystem::validate_project_directory_target(state, textex_dir.join("compile")).await?;
    tokio::fs::create_dir_all(&compile_dir)
        .await
        .map_err(|source| {
            AppError::io(
                "create project compile directory",
                display(&compile_dir),
                source,
            )
        })?;
    filesystem::validate_project_directory_target(state, compile_dir).await
}

async fn metadata_directory(state: &AppState, root: &Path) -> AppResult<PathBuf> {
    filesystem::validate_project_directory_target(state, root.join(".textex")).await
}

async fn metadata_path(state: &AppState, root: &Path, name: &str) -> AppResult<PathBuf> {
    let directory = metadata_directory(state, root).await?;
    Ok(directory.join(name))
}

async fn metadata_write_path(state: &AppState, root: &Path, name: &str) -> AppResult<PathBuf> {
    let directory = ensure_metadata_directory(state, root).await?;
    let path = directory.join(name);
    filesystem::validate_save_file_target(state, path_to_str(&path)?).await
}

async fn ensure_metadata_directory(state: &AppState, root: &Path) -> AppResult<PathBuf> {
    let directory = metadata_directory(state, root).await?;
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|source| {
            AppError::io(
                "create project metadata directory",
                display(&directory),
                source,
            )
        })?;
    filesystem::validate_project_directory_target(state, directory).await
}

async fn add_missing_json<T: Serialize>(
    state: &AppState,
    path: &Path,
    value: &T,
    missing: &mut Vec<(PathBuf, Vec<u8>)>,
) -> AppResult<()> {
    match tokio::fs::symlink_metadata(path).await {
        Ok(_) => {
            filesystem::validate_save_file_target(state, path_to_str(path)?).await?;
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let target = filesystem::validate_save_file_target(state, path_to_str(path)?).await?;
            missing.push((target, pretty_json(value)?));
        }
        Err(source) => {
            return Err(AppError::io(
                "inspect project metadata",
                display(path),
                source,
            ))
        }
    }
    Ok(())
}

async fn read_json_or_default<T, F>(state: &AppState, path: &Path, fallback: F) -> AppResult<T>
where
    T: DeserializeOwned,
    F: FnOnce() -> AppResult<T>,
{
    let path = match tokio::fs::symlink_metadata(path).await {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return fallback(),
        Err(source) => {
            return Err(AppError::io(
                "inspect project metadata",
                display(path),
                source,
            ))
        }
        Ok(_) => filesystem::validate_existing_project_file(state, path_to_str(path)?).await?,
    };
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|source| AppError::io("inspect project metadata", display(&path), source))?;
    if metadata.len() > MAX_JSON_BYTES {
        return Err(AppError::ProjectData(format!(
            "project metadata exceeds {} MiB: {}",
            MAX_JSON_BYTES / 1024 / 1024,
            display(&path)
        )));
    }
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|source| AppError::io("read project metadata", display(&path), source))?;
    match serde_json::from_slice(&bytes) {
        Ok(value) => Ok(value),
        Err(_) => fallback(),
    }
}

async fn write_json<T: Serialize>(state: &AppState, path: PathBuf, value: &T) -> AppResult<()> {
    let path = filesystem::validate_save_file_target(state, path_to_str(&path)?).await?;
    filesystem::write_files_transactionally(vec![(path, pretty_json(value)?)]).await
}

fn pretty_json<T: Serialize>(value: &T) -> AppResult<Vec<u8>> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::ProjectData(error.to_string()))?;
    if bytes.len() as u64 > MAX_JSON_BYTES {
        return Err(AppError::ProjectData(
            "project metadata exceeds 4 MiB".to_owned(),
        ));
    }
    Ok(bytes)
}

async fn read_text(path: &Path, limit: u64) -> AppResult<String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|source| AppError::io("inspect compile log", display(path), source))?;
    if metadata.len() > limit {
        return Err(AppError::ProjectData(
            "compile log exceeds 10 MiB".to_owned(),
        ));
    }
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|source| AppError::io("read compile log", display(path), source))?;
    String::from_utf8(bytes)
        .map_err(|_| AppError::ProjectData("compile log is not valid UTF-8".to_owned()))
}

async fn read_bounded_file(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    let metadata = tokio::fs::symlink_metadata(path)
        .await
        .map_err(|source| AppError::io("inspect legacy citation data", display(path), source))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > limit {
        return Err(AppError::ProjectData(
            "legacy citation data is not a bounded regular file".to_owned(),
        ));
    }
    tokio::fs::read(path)
        .await
        .map_err(|source| AppError::io("read legacy citation data", display(path), source))
}

fn legacy_citation_paths(
    app: &AppHandle,
    requested_root: &str,
    canonical_root: &Path,
) -> AppResult<Vec<PathBuf>> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?;
    let config_root = config_dir
        .parent()
        .ok_or_else(|| AppError::RuntimePath(display(&config_dir)))?
        .to_path_buf();
    let mut user_data_dirs = vec![config_dir];
    user_data_dirs.extend(
        ["TextEx", "textex", "com.textex.app"]
            .into_iter()
            .map(|name| config_root.join(name)),
    );
    let canonical = display(canonical_root);
    let hashes = [requested_root, canonical.as_str()]
        .into_iter()
        .map(|root| format!("{:x}", Sha256::digest(root.as_bytes())))
        .collect::<HashSet<_>>();
    let mut paths = Vec::new();
    for directory in user_data_dirs {
        for hash in &hashes {
            let candidate = directory.join("projects").join(format!("{hash}.json"));
            if !paths.contains(&candidate) {
                paths.push(candidate);
            }
        }
    }
    Ok(paths)
}

fn default_project() -> AppResult<ProjectDatabase> {
    let timestamp = now_iso()?;
    Ok(ProjectDatabase {
        version: DATABASE_VERSION,
        name: String::new(),
        main_file: String::new(),
        created: timestamp.clone(),
        last_opened: timestamp,
        document_class: String::new(),
        description: String::new(),
        tags: Vec::new(),
        authors: Vec::new(),
    })
}

fn project_name(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_owned()
}

fn default_compile() -> AppResult<CompileDatabase> {
    Ok(CompileDatabase {
        version: DATABASE_VERSION,
        total_compiles: 0,
        last_compiled: None,
        records: Default::default(),
    })
}

fn empty_vec<T>() -> AppResult<Vec<T>> {
    Ok(Vec::new())
}

fn validate_project(project: &ProjectDatabase) -> AppResult<()> {
    validate_short_text("project name", &project.name)?;
    validate_short_text("main file", &project.main_file)?;
    validate_short_text("created timestamp", &project.created)?;
    validate_short_text("last-opened timestamp", &project.last_opened)?;
    validate_short_text("document class", &project.document_class)?;
    validate_body("project description", &project.description)?;
    if project.tags.len() > MAX_ITEMS || project.authors.len() > MAX_ITEMS {
        return Err(AppError::ProjectData(
            "project metadata contains too many tags or authors".to_owned(),
        ));
    }
    for value in project.tags.iter().chain(&project.authors) {
        validate_short_text("project metadata item", value)?;
    }
    Ok(())
}

fn validate_compile_record(record: &CompileRecord) -> AppResult<()> {
    if !record.duration.is_finite() || record.duration < 0.0 {
        return Err(AppError::ProjectData(
            "compile duration must be a non-negative finite number".to_owned(),
        ));
    }
    for (label, value) in [
        ("compile file path", record.file_path.as_str()),
        ("compile timestamp", record.last_compiled.as_str()),
        ("compiled PDF path", record.pdf_path.as_str()),
        ("compile hash", record.hash.as_str()),
    ] {
        validate_short_text(label, value)?;
    }
    Ok(())
}

fn validate_snippet_input(snippet: &NewProjectSnippet) -> AppResult<()> {
    validate_short_text("snippet prefix", &snippet.prefix)?;
    validate_short_text("snippet label", &snippet.label)?;
    validate_body("snippet body", &snippet.body)?;
    validate_body("snippet description", &snippet.description)
}

fn validate_bookmark_input(bookmark: &NewProjectBookmark) -> AppResult<()> {
    validate_short_text("bookmark file", &bookmark.file)?;
    validate_short_text("bookmark label", &bookmark.label)
}

fn validate_citation_groups(groups: &[CitationGroup]) -> AppResult<()> {
    if groups.len() > MAX_CITATION_GROUPS {
        return Err(AppError::ProjectData("too many citation groups".to_owned()));
    }
    let mut group_ids = HashSet::new();
    let mut total_keys = 0_usize;
    for group in groups {
        validate_short_text("citation group id", &group.id)?;
        validate_short_text("citation group name", &group.name)?;
        if group.id.trim().is_empty()
            || group.name.trim().is_empty()
            || !group_ids.insert(group.id.as_str())
        {
            return Err(AppError::ProjectData(
                "citation groups require unique non-empty IDs and names".to_owned(),
            ));
        }
        total_keys = total_keys
            .checked_add(group.citekeys.len())
            .ok_or_else(|| AppError::ProjectData("citation key count overflow".to_owned()))?;
        if total_keys > MAX_CITATION_KEYS {
            return Err(AppError::ProjectData("too many citation keys".to_owned()));
        }
        let mut keys = HashSet::new();
        for citekey in &group.citekeys {
            validate_short_text("citation key", citekey)?;
            if citekey.trim().is_empty() || !keys.insert(citekey.as_str()) {
                return Err(AppError::ProjectData(
                    "citation keys must be unique and non-empty within each group".to_owned(),
                ));
            }
        }
    }
    Ok(())
}

fn validate_short_text(label: &str, value: &str) -> AppResult<()> {
    if value.contains('\0') || value.len() > MAX_SHORT_TEXT_BYTES {
        return Err(AppError::ProjectData(format!("invalid {label}")));
    }
    Ok(())
}

fn validate_body(label: &str, value: &str) -> AppResult<()> {
    if value.contains('\0') || value.len() > MAX_BODY_BYTES {
        return Err(AppError::ProjectData(format!("invalid {label}")));
    }
    Ok(())
}

fn compile_log_name(file: &Path) -> AppResult<String> {
    let name = file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::InvalidPath(display(file)))?;
    let base = name.strip_suffix(".tex").unwrap_or(name);
    if base.is_empty() {
        return Err(AppError::InvalidPath(display(file)));
    }
    Ok(format!("{base}.log"))
}

fn unique_id(prefix: &str) -> AppResult<String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::ProjectData(error.to_string()))?
        .as_millis();
    let sequence = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    Ok(format!("{prefix}-{millis}-{sequence}"))
}

fn now_iso() -> AppResult<String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| AppError::ProjectData(error.to_string()))
}

fn path_to_str(path: &Path) -> AppResult<&str> {
    path.to_str()
        .ok_or_else(|| AppError::NonUtf8Path(display(path)))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_for(path: &Path) -> AppState {
        let state = AppState::default();
        state.set_project_root(path.to_path_buf()).unwrap();
        state
    }

    #[tokio::test]
    async fn initializes_and_updates_project_metadata() {
        let project = tempfile::tempdir().unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();
        let root = project.path().to_str().unwrap();

        let initialized = init(&state, &service, root).await.unwrap();
        assert_eq!(
            initialized.name,
            project.path().file_name().unwrap().to_str().unwrap()
        );
        assert!(exists(&state, &service, root).await.unwrap());
        assert!(project.path().join(".textex/history").is_dir());
        assert!(project.path().join(".textex/compile").is_dir());
        assert!(!project.path().join(".textex/citations.json").exists());

        let updated = save_project(
            &state,
            &service,
            root,
            serde_json::json!({"description": "A paper", "tags": ["rust"]}),
        )
        .await
        .unwrap();
        assert_eq!(updated.description, "A paper");
        assert_eq!(updated.tags, vec!["rust"]);
        assert_eq!(load_project(&state, &service, root).await.unwrap(), updated);
    }

    #[tokio::test]
    async fn stores_compile_records_logs_snippets_and_bookmarks() {
        let project = tempfile::tempdir().unwrap();
        let source = project.path().join("paper.tex");
        std::fs::write(&source, "test").unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();
        let root = project.path().to_str().unwrap();
        init(&state, &service, root).await.unwrap();

        let record = CompileRecord {
            file_path: display(&source),
            last_compiled: "2026-08-23T00:00:00Z".to_owned(),
            duration: 1.5,
            exit_code: 0,
            pdf_path: display(&project.path().join("paper.pdf")),
            error_count: 0,
            warning_count: 1,
            hash: "abc".to_owned(),
        };
        let compiled = save_compile_record(&state, &service, root, record.clone())
            .await
            .unwrap();
        assert_eq!(compiled.total_compiles, 1);
        assert_eq!(compiled.records.get(&record.file_path), Some(&record));

        let log_path = save_compile_log(
            &state,
            &service,
            root,
            source.to_str().unwrap(),
            "compiled".to_owned(),
        )
        .await
        .unwrap();
        assert!(log_path.ends_with("paper.log"));
        assert_eq!(
            load_compile_log(&state, &service, root, source.to_str().unwrap())
                .await
                .unwrap(),
            Some("compiled".to_owned())
        );

        let snippet = add_snippet(
            &state,
            &service,
            root,
            NewProjectSnippet {
                prefix: "fig".to_owned(),
                label: "Figure".to_owned(),
                body: r"\begin{figure}".to_owned(),
                description: String::new(),
            },
        )
        .await
        .unwrap();
        assert_eq!(
            load_snippets(&state, &service, root).await.unwrap(),
            vec![snippet.clone()]
        );
        remove_snippet(&state, &service, root, &snippet.id)
            .await
            .unwrap();
        assert!(load_snippets(&state, &service, root)
            .await
            .unwrap()
            .is_empty());

        let bookmark = add_bookmark(
            &state,
            &service,
            root,
            NewProjectBookmark {
                file: display(&source),
                line: 10,
                column: 2,
                label: "Result".to_owned(),
            },
        )
        .await
        .unwrap();
        assert_eq!(
            load_bookmarks(&state, &service, root).await.unwrap(),
            vec![bookmark.clone()]
        );
        remove_bookmark(&state, &service, root, &bookmark.id)
            .await
            .unwrap();
        assert!(load_bookmarks(&state, &service, root)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn rejects_a_different_project_root() {
        let project = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();

        let error = init(&state, &service, other.path().to_str().unwrap())
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::OutsideProject(_)));
        assert!(!other.path().join(".textex").exists());
    }

    #[tokio::test]
    async fn stores_validated_citation_groups_atomically() {
        let project = tempfile::tempdir().unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();
        let root = project.path().to_str().unwrap();
        let groups = vec![CitationGroup {
            id: "methods".to_owned(),
            name: "Methods".to_owned(),
            citekeys: vec!["knuth1984".to_owned()],
        }];

        save_citation_groups(&state, &service, root, groups.clone())
            .await
            .unwrap();
        let stored: CitationData = serde_json::from_slice(
            &std::fs::read(project.path().join(".textex/citations.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(stored.groups, groups);

        let duplicates = vec![
            CitationGroup {
                id: "same".to_owned(),
                name: "First".to_owned(),
                citekeys: Vec::new(),
            },
            CitationGroup {
                id: "same".to_owned(),
                name: "Second".to_owned(),
                citekeys: Vec::new(),
            },
        ];
        assert!(save_citation_groups(&state, &service, root, duplicates)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn malformed_json_falls_back_without_overwriting_it_on_load() {
        let project = tempfile::tempdir().unwrap();
        let metadata = project.path().join(".textex");
        std::fs::create_dir_all(&metadata).unwrap();
        std::fs::write(metadata.join("project.json"), "not-json").unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();
        let root = project.path().to_str().unwrap();

        let loaded = load_project(&state, &service, root).await.unwrap();
        assert_eq!(loaded.version, DATABASE_VERSION);
        assert_eq!(
            std::fs::read_to_string(metadata.join("project.json")).unwrap(),
            "not-json"
        );
    }

    #[tokio::test]
    async fn loads_defaults_and_creates_metadata_on_first_save_without_init() {
        let project = tempfile::tempdir().unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();
        let root = project.path().to_str().unwrap();

        let loaded = load_project(&state, &service, root).await.unwrap();
        assert!(loaded.name.is_empty());
        assert!(!project.path().join(".textex").exists());

        let saved = save_project(
            &state,
            &service,
            root,
            serde_json::json!({"mainFile": "main.tex"}),
        )
        .await
        .unwrap();
        assert_eq!(saved.main_file, "main.tex");
        assert!(project.path().join(".textex/project.json").is_file());
    }
}
