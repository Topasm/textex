use std::{
    cmp::Ordering,
    collections::HashSet,
    io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering as AtomicOrdering},
};

#[cfg(windows)]
use std::ffi::OsStr;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::{
    error::{AppError, AppResult},
    models::{
        Base64FileResult, BinaryFileResult, DirectoryEntry, DirectoryEntryType, OpenFileResult,
        SaveFileAsResult, SaveFileInput, SuccessResult,
    },
    state::AppState,
};

const LARGE_FILE_WARN_BYTES: u64 = 5 * 1024 * 1024;
const LARGE_FILE_REFUSE_BYTES: u64 = 50 * 1024 * 1024;
const BINARY_TRANSFER_LIMIT_BYTES: u64 = 10 * 1024 * 1024;
const MEBIBYTE: u64 = 1024 * 1024;
const TEMP_FILE_ATTEMPTS: usize = 32;
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub async fn open_file(app: &AppHandle, state: &AppState) -> AppResult<Option<OpenFileResult>> {
    let selected = app
        .dialog()
        .file()
        .add_filter(
            "LaTeX Files",
            &["tex", "sty", "cls", "bib", "bst", "dtx", "ins"],
        )
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };

    let selected_path = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    open_selected_file(state, selected_path).await.map(Some)
}

async fn open_selected_file(state: &AppState, selected_path: PathBuf) -> AppResult<OpenFileResult> {
    let requested = require_absolute_path(&selected_path)?;
    let canonical = canonicalize(requested, "open file").await?;
    let result = read_text_file_at(&canonical).await?;
    let parent = canonical.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "selected file has no parent directory: {}",
            canonical.to_string_lossy()
        ))
    })?;
    let canonical_parent = canonicalize(parent.to_path_buf(), "resolve parent directory").await?;
    ensure_directory(&canonical_parent).await?;
    state.set_project_root(canonical_parent)?;
    Ok(result)
}

pub async fn open_directory(app: &AppHandle, state: &AppState) -> AppResult<Option<String>> {
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };

    let selected_path = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    let requested = require_absolute_path(&selected_path)?;
    let canonical = canonicalize(requested, "open directory").await?;
    ensure_directory(&canonical).await?;
    let display_path = path_to_string(&canonical)?;

    state.set_project_root(canonical)?;
    Ok(Some(display_path))
}

pub async fn read_directory(state: &AppState, dir_path: &str) -> AppResult<Vec<DirectoryEntry>> {
    let requested = require_absolute_str(dir_path)?;
    let canonical = canonicalize(requested, "open directory").await?;
    ensure_inside_project(state, &canonical)?;
    ensure_directory(&canonical).await?;

    let display_dir = path_to_string(&canonical)?;
    let mut reader = fs::read_dir(&canonical)
        .await
        .map_err(|source| AppError::io("read directory", display_dir.clone(), source))?;
    let mut entries = Vec::new();

    while let Some(entry) = reader
        .next_entry()
        .await
        .map_err(|source| AppError::io("read directory", display_dir.clone(), source))?
    {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            // JavaScript paths cannot losslessly address non-UTF-8 filenames.
            continue;
        };
        if name.starts_with('.') {
            continue;
        }

        let file_type = entry
            .file_type()
            .await
            .map_err(|source| AppError::io("inspect directory entry", name.clone(), source))?;
        let entry_type = if file_type.is_dir() {
            DirectoryEntryType::Directory
        } else {
            DirectoryEntryType::File
        };

        entries.push(DirectoryEntry {
            name,
            path: path_to_string(&entry.path())?,
            entry_type,
        });
    }

    entries.sort_by(compare_directory_entries);
    Ok(entries)
}

pub async fn read_file(state: &AppState, file_path: &str) -> AppResult<OpenFileResult> {
    let requested = require_absolute_str(file_path)?;
    let canonical = canonicalize(requested, "open file").await?;
    ensure_inside_project(state, &canonical)?;

    read_text_file_at(&canonical).await
}

async fn read_text_file_at(canonical: &Path) -> AppResult<OpenFileResult> {
    let display_path = path_to_string(&canonical)?;
    let metadata = fs::metadata(&canonical)
        .await
        .map_err(|source| AppError::io("inspect file", display_path.clone(), source))?;
    if !metadata.is_file() {
        return Err(AppError::NotAFile(display_path));
    }
    if metadata.len() > LARGE_FILE_REFUSE_BYTES {
        return Err(AppError::FileTooLarge {
            size_mb: rounded_mebibytes(metadata.len()),
        });
    }

    let file = fs::File::open(&canonical)
        .await
        .map_err(|source| AppError::io("open file", display_path.clone(), source))?;
    let mut bytes = Vec::with_capacity(metadata.len().min(LARGE_FILE_REFUSE_BYTES) as usize);
    file.take(LARGE_FILE_REFUSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|source| AppError::io("read file", display_path.clone(), source))?;
    let actual_size = bytes.len() as u64;
    if actual_size > LARGE_FILE_REFUSE_BYTES {
        return Err(AppError::FileTooLarge {
            size_mb: rounded_mebibytes(actual_size),
        });
    }

    Ok(OpenFileResult {
        content: decode_text_file(bytes),
        file_path: display_path,
        warn_large_file: actual_size > LARGE_FILE_WARN_BYTES,
    })
}

pub async fn save_file(
    state: &AppState,
    file_path: &str,
    content: String,
) -> AppResult<SuccessResult> {
    let requested = require_absolute_str(file_path)?;
    let target = resolve_write_target(state, requested).await?;
    write_files_transactionally(vec![(target, content.into_bytes())]).await?;

    Ok(SuccessResult::ok())
}

pub async fn save_file_as(
    app: &AppHandle,
    state: &AppState,
    content: String,
) -> AppResult<Option<SaveFileAsResult>> {
    let selected = app
        .dialog()
        .file()
        .set_file_name("untitled.tex")
        .add_filter("LaTeX Files", &["tex"])
        .add_filter("All Files", &["*"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };

    let selected_path = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    save_as_selected(state, selected_path, content)
        .await
        .map(Some)
}

async fn save_as_selected(
    state: &AppState,
    selected_path: PathBuf,
    content: String,
) -> AppResult<SaveFileAsResult> {
    let requested = require_absolute_path(&selected_path)?;
    trust_dialog_parent_if_no_project(state, &requested).await?;
    let target = resolve_write_target(state, requested).await?;
    let file_path = path_to_string(&target)?;
    write_files_transactionally(vec![(target, content.into_bytes())]).await?;
    Ok(SaveFileAsResult { file_path })
}

pub async fn save_file_batch(
    state: &AppState,
    files: Vec<SaveFileInput>,
) -> AppResult<SuccessResult> {
    let mut targets = Vec::with_capacity(files.len());
    let mut unique_targets = HashSet::with_capacity(files.len());

    // Validate the complete batch before staging or changing any file. This is
    // stronger than Promise.all(): a rejected path cannot leave earlier files
    // partially updated.
    for file in files {
        let requested = require_absolute_str(&file.file_path)?;
        let target = resolve_write_target(state, requested).await?;
        let identity = comparable_path_identity(&target);
        if !unique_targets.insert(identity) {
            return Err(AppError::InvalidPath(format!(
                "duplicate batch target: {}",
                target.to_string_lossy()
            )));
        }
        targets.push((target, file.content.into_bytes()));
    }

    write_files_transactionally(targets).await?;
    Ok(SuccessResult::ok())
}

pub async fn create_file(state: &AppState, file_path: &str) -> AppResult<SuccessResult> {
    let requested = require_absolute_str(file_path)?;
    let target = resolve_write_target(state, requested).await?;
    // Electron's fs.writeFile() truncates an existing regular file.
    write_files_transactionally(vec![(target, Vec::new())]).await?;
    Ok(SuccessResult::ok())
}

pub async fn create_directory(state: &AppState, dir_path: &str) -> AppResult<SuccessResult> {
    let requested = require_absolute_str(dir_path)?;
    let target = resolve_directory_target(state, requested).await?;
    let display_path = path_to_string(&target)?;
    fs::create_dir_all(&target)
        .await
        .map_err(|source| AppError::io("create directory", display_path.clone(), source))?;

    // Re-resolve after creation so a concurrently introduced symlink cannot
    // silently move the resulting directory outside the trusted root.
    let canonical = canonicalize(target, "resolve created directory").await?;
    ensure_inside_project(state, &canonical)?;
    ensure_directory(&canonical).await?;
    Ok(SuccessResult::ok())
}

pub async fn copy_file(
    state: &AppState,
    source: &str,
    destination: &str,
) -> AppResult<SuccessResult> {
    let source = resolve_existing_file(state, require_absolute_str(source)?, "copy source").await?;
    let destination = resolve_write_target(state, require_absolute_str(destination)?).await?;

    // Node's fs.copyFile(source, source) succeeds without changing the file.
    if comparable_path_identity(&source) == comparable_path_identity(&destination) {
        return Ok(SuccessResult::ok());
    }

    copy_file_transactionally(&source, &destination).await?;
    Ok(SuccessResult::ok())
}

pub async fn read_file_base64(state: &AppState, file_path: &str) -> AppResult<Base64FileResult> {
    let canonical =
        resolve_existing_file(state, require_absolute_str(file_path)?, "read base64 file").await?;
    let bytes = read_limited_binary(&canonical, "base64 encoding").await?;
    let mime_type = mime_type_for_path(&canonical).to_owned();
    let data = format!("data:{mime_type};base64,{}", encode_base64(&bytes));
    Ok(Base64FileResult { data, mime_type })
}

pub async fn read_file_binary(state: &AppState, file_path: &str) -> AppResult<BinaryFileResult> {
    let canonical =
        resolve_existing_file(state, require_absolute_str(file_path)?, "read binary file").await?;
    let data = read_limited_binary(&canonical, "binary transfer").await?;
    let mime_type = mime_type_for_path(&canonical).to_owned();
    Ok(BinaryFileResult { data, mime_type })
}

pub(crate) async fn resolve_project_directory(
    state: &AppState,
    dir_path: &str,
) -> AppResult<PathBuf> {
    let canonical = canonical_project_directory(dir_path).await?;
    ensure_inside_project(state, &canonical)?;
    Ok(canonical)
}

pub(crate) async fn canonical_project_directory(dir_path: &str) -> AppResult<PathBuf> {
    let requested = require_absolute_str(dir_path)?;
    let canonical = canonicalize(requested, "resolve project directory").await?;
    ensure_directory(&canonical).await?;
    Ok(canonical)
}

pub(crate) fn paths_equal(left: &Path, right: &Path) -> bool {
    comparable_path_identity(left) == comparable_path_identity(right)
}

fn require_absolute_str(path: &str) -> AppResult<PathBuf> {
    if path.is_empty() || path.contains('\0') {
        return Err(AppError::InvalidPath(path.to_owned()));
    }
    require_absolute_path(Path::new(path))
}

fn require_absolute_path(path: &Path) -> AppResult<PathBuf> {
    if !path.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "file path must be absolute: {}",
            path.to_string_lossy()
        )));
    }
    Ok(path.to_path_buf())
}

async fn canonicalize(path: PathBuf, operation: &'static str) -> AppResult<PathBuf> {
    let display_path = path.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(path))
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?
        .map_err(|source| AppError::io(operation, display_path, source))
}

async fn ensure_directory(path: &Path) -> AppResult<()> {
    let display_path = path_to_string(path)?;
    let metadata = fs::metadata(path)
        .await
        .map_err(|source| AppError::io("inspect directory", display_path.clone(), source))?;
    if !metadata.is_dir() {
        return Err(AppError::NotADirectory(display_path));
    }
    Ok(())
}

fn ensure_inside_project(state: &AppState, candidate: &Path) -> AppResult<()> {
    let root = state.project_root()?;
    if path_is_within(&root, candidate) {
        return Ok(());
    }
    Err(AppError::OutsideProject(
        candidate.to_string_lossy().into_owned(),
    ))
}

async fn resolve_write_target(state: &AppState, requested: PathBuf) -> AppResult<PathBuf> {
    match fs::symlink_metadata(&requested).await {
        Ok(_) => {
            let canonical = canonicalize(requested, "resolve file").await?;
            ensure_inside_project(state, &canonical)?;

            let display_path = path_to_string(&canonical)?;
            let metadata = fs::metadata(&canonical)
                .await
                .map_err(|source| AppError::io("inspect file", display_path.clone(), source))?;
            if !metadata.is_file() {
                return Err(AppError::NotAFile(display_path));
            }
            Ok(canonical)
        }
        Err(source) if source.kind() == io::ErrorKind::NotFound => {
            let file_name = requested.file_name().ok_or_else(|| {
                AppError::InvalidPath(format!(
                    "path has no file name: {}",
                    requested.to_string_lossy()
                ))
            })?;
            let parent = requested.parent().ok_or_else(|| {
                AppError::InvalidPath(format!(
                    "path has no parent directory: {}",
                    requested.to_string_lossy()
                ))
            })?;
            let canonical_parent =
                canonicalize(parent.to_path_buf(), "resolve parent directory").await?;
            ensure_inside_project(state, &canonical_parent)?;
            ensure_directory(&canonical_parent).await?;
            Ok(canonical_parent.join(file_name))
        }
        Err(source) => Err(AppError::io(
            "inspect file",
            requested.to_string_lossy().into_owned(),
            source,
        )),
    }
}

async fn trust_dialog_parent_if_no_project(state: &AppState, requested: &Path) -> AppResult<()> {
    match state.project_root() {
        Ok(_) => return Ok(()),
        Err(AppError::ProjectNotOpen) => {}
        Err(error) => return Err(error),
    }

    let trusted_parent = match fs::symlink_metadata(requested).await {
        Ok(_) => {
            let canonical = canonicalize(requested.to_path_buf(), "resolve selected file").await?;
            canonical
                .parent()
                .ok_or_else(|| {
                    AppError::InvalidPath(format!(
                        "selected path has no parent directory: {}",
                        requested.to_string_lossy()
                    ))
                })?
                .to_path_buf()
        }
        Err(source) if source.kind() == io::ErrorKind::NotFound => {
            let parent = requested.parent().ok_or_else(|| {
                AppError::InvalidPath(format!(
                    "selected path has no parent directory: {}",
                    requested.to_string_lossy()
                ))
            })?;
            canonicalize(parent.to_path_buf(), "resolve selected parent directory").await?
        }
        Err(source) => {
            return Err(AppError::io(
                "inspect selected file",
                requested.to_string_lossy().into_owned(),
                source,
            ));
        }
    };

    ensure_directory(&trusted_parent).await?;
    state.set_project_root(trusted_parent)
}

async fn resolve_existing_file(
    state: &AppState,
    requested: PathBuf,
    operation: &'static str,
) -> AppResult<PathBuf> {
    let canonical = canonicalize(requested, operation).await?;
    ensure_inside_project(state, &canonical)?;

    let display_path = path_to_string(&canonical)?;
    let metadata = fs::metadata(&canonical)
        .await
        .map_err(|source| AppError::io("inspect file", display_path.clone(), source))?;
    if !metadata.is_file() {
        return Err(AppError::NotAFile(display_path));
    }
    Ok(canonical)
}

async fn resolve_directory_target(state: &AppState, requested: PathBuf) -> AppResult<PathBuf> {
    match fs::symlink_metadata(&requested).await {
        Ok(_) => {
            let canonical = canonicalize(requested, "resolve directory").await?;
            ensure_inside_project(state, &canonical)?;
            ensure_directory(&canonical).await?;
            Ok(canonical)
        }
        Err(source) if source.kind() == io::ErrorKind::NotFound => {
            let mut existing_ancestor = requested.as_path();
            loop {
                match fs::symlink_metadata(existing_ancestor).await {
                    Ok(_) => break,
                    Err(source) if source.kind() == io::ErrorKind::NotFound => {
                        existing_ancestor = existing_ancestor.parent().ok_or_else(|| {
                            AppError::InvalidPath(format!(
                                "directory has no existing parent: {}",
                                requested.to_string_lossy()
                            ))
                        })?;
                    }
                    Err(source) => {
                        return Err(AppError::io(
                            "inspect directory",
                            existing_ancestor.to_string_lossy().into_owned(),
                            source,
                        ));
                    }
                }
            }

            let canonical_ancestor =
                canonicalize(existing_ancestor.to_path_buf(), "resolve parent directory").await?;
            ensure_inside_project(state, &canonical_ancestor)?;
            ensure_directory(&canonical_ancestor).await?;

            let unresolved = requested.strip_prefix(existing_ancestor).map_err(|_| {
                AppError::InvalidPath(format!(
                    "could not resolve directory path: {}",
                    requested.to_string_lossy()
                ))
            })?;
            if unresolved
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
            {
                return Err(AppError::InvalidPath(format!(
                    "directory path contains unresolved traversal: {}",
                    requested.to_string_lossy()
                )));
            }

            Ok(canonical_ancestor.join(unresolved))
        }
        Err(source) => Err(AppError::io(
            "inspect directory",
            requested.to_string_lossy().into_owned(),
            source,
        )),
    }
}

async fn read_limited_binary(path: &Path, purpose: &'static str) -> AppResult<Vec<u8>> {
    let display_path = path_to_string(path)?;
    let metadata = fs::metadata(path)
        .await
        .map_err(|source| AppError::io("inspect file", display_path.clone(), source))?;
    if !metadata.is_file() {
        return Err(AppError::NotAFile(display_path));
    }
    ensure_binary_size(metadata.len(), purpose, &display_path)?;

    let file = fs::File::open(path)
        .await
        .map_err(|source| AppError::io("open file", display_path.clone(), source))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(BINARY_TRANSFER_LIMIT_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|source| AppError::io("read file", display_path.clone(), source))?;
    ensure_binary_size(bytes.len() as u64, purpose, &display_path)?;
    Ok(bytes)
}

fn ensure_binary_size(size: u64, purpose: &'static str, path: &str) -> AppResult<()> {
    if size <= BINARY_TRANSFER_LIMIT_BYTES {
        return Ok(());
    }
    Err(AppError::io(
        purpose,
        path,
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "file too large for {purpose} ({}MB; limit is 10MB)",
                rounded_mebibytes(size)
            ),
        ),
    ))
}

fn mime_type_for_path(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

fn encode_base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);

        encoded.push(ALPHABET[(first >> 2) as usize] as char);
        encoded.push(ALPHABET[(((first & 0x03) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            encoded.push(ALPHABET[(((second & 0x0f) << 2) | (third >> 6)) as usize] as char);
        } else {
            encoded.push('=');
        }
        if chunk.len() > 2 {
            encoded.push(ALPHABET[(third & 0x3f) as usize] as char);
        } else {
            encoded.push('=');
        }
    }
    encoded
}

struct StagedWrite {
    target: PathBuf,
    staged: PathBuf,
    backup: Option<PathBuf>,
}

pub(crate) async fn write_files_transactionally(files: Vec<(PathBuf, Vec<u8>)>) -> AppResult<()> {
    let mut staged_writes = Vec::with_capacity(files.len());
    for (target, bytes) in files {
        match stage_bytes(&target, &bytes).await {
            Ok(staged) => staged_writes.push(StagedWrite {
                target,
                staged,
                backup: None,
            }),
            Err(error) => {
                cleanup_transaction_files(&mut staged_writes).await;
                return Err(error);
            }
        }
    }
    commit_staged_writes(&mut staged_writes).await
}

async fn copy_file_transactionally(source: &Path, target: &Path) -> AppResult<()> {
    let staged = stage_copy(source, target, "copy").await?;
    let mut staged_writes = vec![StagedWrite {
        target: target.to_path_buf(),
        staged,
        backup: None,
    }];
    commit_staged_writes(&mut staged_writes).await
}

async fn commit_staged_writes(staged_writes: &mut [StagedWrite]) -> AppResult<()> {
    for index in 0..staged_writes.len() {
        match fs::symlink_metadata(&staged_writes[index].target).await {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    let error = AppError::NotAFile(
                        staged_writes[index].target.to_string_lossy().into_owned(),
                    );
                    cleanup_transaction_files(staged_writes).await;
                    return Err(error);
                }
                match stage_copy(
                    &staged_writes[index].target,
                    &staged_writes[index].target,
                    "backup",
                )
                .await
                {
                    Ok(backup) => staged_writes[index].backup = Some(backup),
                    Err(error) => {
                        cleanup_transaction_files(staged_writes).await;
                        return Err(error);
                    }
                }
            }
            Err(source) if source.kind() == io::ErrorKind::NotFound => {}
            Err(source) => {
                let error = AppError::io(
                    "inspect transaction target",
                    staged_writes[index].target.to_string_lossy().into_owned(),
                    source,
                );
                cleanup_transaction_files(staged_writes).await;
                return Err(error);
            }
        }
    }

    let mut committed = 0;
    while committed < staged_writes.len() {
        if let Err(error) = replace_staged_file(
            staged_writes[committed].staged.clone(),
            staged_writes[committed].target.clone(),
        )
        .await
        {
            rollback_committed_writes(staged_writes, committed).await;
            cleanup_transaction_files(staged_writes).await;
            return Err(error);
        }
        committed += 1;
    }

    cleanup_transaction_files(staged_writes).await;
    Ok(())
}

async fn rollback_committed_writes(staged_writes: &mut [StagedWrite], committed: usize) {
    for item in staged_writes[..committed].iter_mut().rev() {
        if let Some(backup) = item.backup.take() {
            let _ = replace_staged_file(backup, item.target.clone()).await;
        } else {
            let _ = fs::remove_file(&item.target).await;
        }
    }
}

async fn cleanup_transaction_files(staged_writes: &mut [StagedWrite]) {
    for item in staged_writes {
        let _ = fs::remove_file(&item.staged).await;
        if let Some(backup) = item.backup.take() {
            let _ = fs::remove_file(backup).await;
        }
    }
}

async fn stage_bytes(target: &Path, bytes: &[u8]) -> AppResult<PathBuf> {
    let (staged, mut file) = reserve_sibling_file(target, "write").await?;
    if let Err(source) = file.write_all(bytes).await {
        drop(file);
        let _ = fs::remove_file(&staged).await;
        return Err(AppError::io(
            "stage file",
            target.to_string_lossy().into_owned(),
            source,
        ));
    }
    if let Err(source) = file.flush().await {
        drop(file);
        let _ = fs::remove_file(&staged).await;
        return Err(AppError::io(
            "flush staged file",
            target.to_string_lossy().into_owned(),
            source,
        ));
    }
    drop(file);

    if let Ok(metadata) = fs::metadata(target).await {
        if let Err(source) = fs::set_permissions(&staged, metadata.permissions()).await {
            let _ = fs::remove_file(&staged).await;
            return Err(AppError::io(
                "preserve file permissions",
                target.to_string_lossy().into_owned(),
                source,
            ));
        }
    }
    Ok(staged)
}

async fn stage_copy(source: &Path, target: &Path, label: &str) -> AppResult<PathBuf> {
    let (staged, file) = reserve_sibling_file(target, label).await?;
    drop(file);
    if let Err(source_error) = fs::copy(source, &staged).await {
        let _ = fs::remove_file(&staged).await;
        return Err(AppError::io(
            "stage file copy",
            source.to_string_lossy().into_owned(),
            source_error,
        ));
    }
    Ok(staged)
}

async fn reserve_sibling_file(target: &Path, label: &str) -> AppResult<(PathBuf, fs::File)> {
    let parent = target.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "path has no parent directory: {}",
            target.to_string_lossy()
        ))
    })?;
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::NonUtf8Path(target.to_string_lossy().into_owned()))?;

    for _ in 0..TEMP_FILE_ATTEMPTS {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, AtomicOrdering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.textex-{label}-{}-{sequence}",
            std::process::id()
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
            .await
        {
            Ok(file) => return Ok((candidate, file)),
            Err(source) if source.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(source) => {
                return Err(AppError::io(
                    "create transaction file",
                    candidate.to_string_lossy().into_owned(),
                    source,
                ));
            }
        }
    }

    Err(AppError::io(
        "create transaction file",
        target.to_string_lossy().into_owned(),
        io::Error::new(
            io::ErrorKind::AlreadyExists,
            "could not reserve a unique transaction file",
        ),
    ))
}

#[cfg(not(windows))]
async fn replace_staged_file(staged: PathBuf, target: PathBuf) -> AppResult<()> {
    let display_target = path_to_string(&target)?;
    fs::rename(staged, target)
        .await
        .map_err(|source| AppError::io("replace file", display_target, source))
}

#[cfg(windows)]
async fn replace_staged_file(staged: PathBuf, target: PathBuf) -> AppResult<()> {
    let display_target = path_to_string(&target)?;
    tauri::async_runtime::spawn_blocking(move || move_file_replace(&staged, &target))
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?
        .map_err(|source| AppError::io("replace file", display_target, source))
}

#[cfg(windows)]
fn move_file_replace(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    // SAFETY: both pointers reference NUL-terminated UTF-16 buffers that stay
    // alive for the duration of the call, and the flags are documented values.
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn comparable_path_identity(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(windows)]
fn comparable_path_identity(path: &Path) -> String {
    path.to_string_lossy().to_ascii_lowercase()
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
                os_str_eq_ignore_ascii_case(
                    root_component.as_os_str(),
                    candidate_component.as_os_str(),
                )
            })
    })
}

#[cfg(windows)]
fn os_str_eq_ignore_ascii_case(left: &OsStr, right: &OsStr) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

pub(crate) fn path_to_string(path: &Path) -> AppResult<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))
}

fn compare_directory_entries(left: &DirectoryEntry, right: &DirectoryEntry) -> Ordering {
    directory_rank(&left.entry_type)
        .cmp(&directory_rank(&right.entry_type))
        .then_with(|| compare_names_case_insensitively(&left.name, &right.name))
        .then_with(|| left.name.cmp(&right.name))
}

fn compare_names_case_insensitively(left: &str, right: &str) -> Ordering {
    left.chars()
        .flat_map(char::to_lowercase)
        .cmp(right.chars().flat_map(char::to_lowercase))
}

const fn directory_rank(entry_type: &DirectoryEntryType) -> u8 {
    match entry_type {
        DirectoryEntryType::Directory => 0,
        DirectoryEntryType::File => 1,
    }
}

const fn rounded_mebibytes(bytes: u64) -> u64 {
    (bytes + MEBIBYTE / 2) / MEBIBYTE
}

fn decode_text_file(mut bytes: Vec<u8>) -> String {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        bytes.drain(..3);
        return String::from_utf8_lossy(&bytes).into_owned();
    }

    if bytes.starts_with(&[0xff, 0xfe]) {
        let utf16 = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16_lossy(&utf16);
    }

    let bytes = match String::from_utf8(bytes) {
        Ok(content) if !content.contains('\u{fffd}') => return content,
        Ok(content) => content.into_bytes(),
        Err(error) => error.into_bytes(),
    };

    // Match Buffer's latin1 fallback, including the existing Electron edge
    // case where a literal replacement character also triggers the fallback.
    bytes.into_iter().map(char::from).collect()
}

#[cfg(test)]
mod tests {
    #[cfg(not(windows))]
    use super::path_is_within;
    use super::{
        create_directory, create_file, decode_text_file, encode_base64, ensure_binary_size,
        mime_type_for_path, open_selected_file, read_file_base64, read_file_binary,
        save_as_selected, save_file_batch, BINARY_TRANSFER_LIMIT_BYTES,
    };
    use crate::{models::SaveFileInput, state::AppState};
    use std::{
        fs,
        future::Future,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEST_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let sequence = TEST_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "textex-tauri-{label}-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn child(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn block_on<T>(future: impl Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    fn path_string(path: &Path) -> String {
        path.to_str().expect("UTF-8 test path").to_owned()
    }

    #[test]
    fn decodes_utf8_bom() {
        assert_eq!(decode_text_file(b"\xef\xbb\xbfTextEx".to_vec()), "TextEx");
    }

    #[test]
    fn decodes_utf16_little_endian_bom() {
        assert_eq!(
            decode_text_file(vec![0xff, 0xfe, b'T', 0, b'e', 0, b'X', 0]),
            "TeX"
        );
    }

    #[test]
    fn falls_back_to_latin1_for_invalid_utf8() {
        assert_eq!(decode_text_file(vec![0x63, 0x61, 0x66, 0xe9]), "caf\u{e9}");
    }

    #[test]
    fn matches_electron_fallback_for_a_literal_replacement_character() {
        assert_eq!(
            decode_text_file("\u{fffd}".as_bytes().to_vec()),
            "\u{ef}\u{bf}\u{bd}"
        );
    }

    #[test]
    fn encodes_base64_with_standard_padding() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"M"), "TQ==");
        assert_eq!(encode_base64(b"Ma"), "TWE=");
        assert_eq!(encode_base64(b"Man"), "TWFu");
    }

    #[test]
    fn detects_pdf_and_image_mime_types_case_insensitively() {
        assert_eq!(
            mime_type_for_path(Path::new("preview.PDF")),
            "application/pdf"
        );
        assert_eq!(mime_type_for_path(Path::new("figure.JPEG")), "image/jpeg");
        assert_eq!(
            mime_type_for_path(Path::new("main.tex")),
            "application/octet-stream"
        );
    }

    #[test]
    fn enforces_the_ten_mebibyte_binary_limit() {
        assert!(ensure_binary_size(BINARY_TRANSFER_LIMIT_BYTES, "binary transfer", "x").is_ok());
        let error = ensure_binary_size(
            BINARY_TRANSFER_LIMIT_BYTES + 1,
            "binary transfer",
            "preview.pdf",
        )
        .expect_err("oversized transfer must fail");
        assert!(error.to_string().contains("limit is 10MB"));
    }

    #[test]
    fn opening_a_file_trusts_its_canonical_parent() {
        let project = TestDirectory::new("open-file");
        let file = project.child("main.tex");
        fs::write(&file, "TextEx").expect("write fixture");
        let state = AppState::default();

        let result = block_on(open_selected_file(&state, file.clone())).expect("open file");

        assert_eq!(result.content, "TextEx");
        assert_eq!(result.file_path, path_string(&file));
        assert_eq!(state.project_root().expect("trusted root"), project.path());
    }

    #[test]
    fn save_as_establishes_a_root_only_when_no_project_is_open() {
        let first = TestDirectory::new("save-as-first");
        let second = TestDirectory::new("save-as-second");
        let state = AppState::default();
        let first_file = first.child("untitled.tex");

        let result = block_on(save_as_selected(
            &state,
            first_file.clone(),
            "first".to_owned(),
        ))
        .expect("initial Save As");
        assert_eq!(result.file_path, path_string(&first_file));
        assert_eq!(state.project_root().expect("trusted root"), first.path());

        let outside = second.child("outside.tex");
        let error = block_on(save_as_selected(&state, outside, "outside".to_owned()))
            .expect_err("Save As outside the active project must fail");
        assert!(error.to_string().contains("outside the open project"));
    }

    #[test]
    fn batch_validation_prevents_partial_writes() {
        let project = TestDirectory::new("batch-project");
        let outside = TestDirectory::new("batch-outside");
        let first = project.child("first.tex");
        let second = project.child("second.tex");
        let outside_file = outside.child("outside.tex");
        fs::write(&first, "old-first").expect("write first fixture");
        fs::write(&second, "old-second").expect("write second fixture");
        fs::write(&outside_file, "old-outside").expect("write outside fixture");
        let state = AppState::default();
        state
            .set_project_root(project.path().to_path_buf())
            .expect("set project root");

        block_on(save_file_batch(
            &state,
            vec![
                SaveFileInput {
                    content: "new-first".to_owned(),
                    file_path: path_string(&first),
                },
                SaveFileInput {
                    content: "new-second".to_owned(),
                    file_path: path_string(&second),
                },
            ],
        ))
        .expect("save valid batch");
        assert_eq!(fs::read_to_string(&first).expect("read first"), "new-first");
        assert_eq!(
            fs::read_to_string(&second).expect("read second"),
            "new-second"
        );

        let error = block_on(save_file_batch(
            &state,
            vec![
                SaveFileInput {
                    content: "partial".to_owned(),
                    file_path: path_string(&first),
                },
                SaveFileInput {
                    content: "forbidden".to_owned(),
                    file_path: path_string(&outside_file),
                },
            ],
        ))
        .expect_err("invalid batch must fail");
        assert!(error.to_string().contains("outside the open project"));
        assert_eq!(fs::read_to_string(&first).expect("read first"), "new-first");
        assert_eq!(
            fs::read_to_string(&outside_file).expect("read outside"),
            "old-outside"
        );
    }

    #[test]
    fn create_and_copy_preserve_electron_parent_and_overwrite_policies() {
        let project = TestDirectory::new("create-copy");
        let state = AppState::default();
        state
            .set_project_root(project.path().to_path_buf())
            .expect("set project root");
        let existing = project.child("existing.tex");
        fs::write(&existing, "old").expect("write existing fixture");

        block_on(create_file(&state, &path_string(&existing))).expect("truncate existing file");
        assert_eq!(fs::read_to_string(&existing).expect("read existing"), "");

        let missing_parent_file = project.child("missing/child.tex");
        assert!(block_on(create_file(&state, &path_string(&missing_parent_file))).is_err());
        assert!(!project.child("missing").exists());

        let nested_directory = project.child("nested/chapters");
        block_on(create_directory(&state, &path_string(&nested_directory)))
            .expect("recursively create directory");
        assert!(nested_directory.is_dir());

        let source = project.child("source.tex");
        let destination = project.child("destination.tex");
        fs::write(&source, "source").expect("write source");
        fs::write(&destination, "destination").expect("write destination");
        block_on(super::copy_file(
            &state,
            &path_string(&source),
            &path_string(&destination),
        ))
        .expect("copy over destination");
        assert_eq!(
            fs::read_to_string(&destination).expect("read destination"),
            "source"
        );
    }

    #[test]
    fn binary_and_base64_reads_match_renderer_payloads() {
        let project = TestDirectory::new("binary");
        let state = AppState::default();
        state
            .set_project_root(project.path().to_path_buf())
            .expect("set project root");
        let pdf = project.child("preview.PDF");
        let image = project.child("pixel.png");
        fs::write(&pdf, b"%PDF-1.7").expect("write PDF");
        fs::write(&image, b"Man").expect("write image");

        let binary = block_on(read_file_binary(&state, &path_string(&pdf))).expect("read binary");
        assert_eq!(binary.data, b"%PDF-1.7");
        assert_eq!(binary.mime_type, "application/pdf");

        let base64 = block_on(read_file_base64(&state, &path_string(&image))).expect("read base64");
        assert_eq!(base64.data, "data:image/png;base64,TWFu");
        assert_eq!(base64.mime_type, "image/png");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_paths_cannot_escape_the_project() {
        use std::os::unix::fs::symlink;

        let project = TestDirectory::new("symlink-project");
        let outside = TestDirectory::new("symlink-outside");
        let secret = outside.child("secret.pdf");
        fs::write(&secret, b"secret").expect("write outside fixture");
        symlink(outside.path(), project.child("escape")).expect("create escape symlink");
        let state = AppState::default();
        state
            .set_project_root(project.path().to_path_buf())
            .expect("set project root");

        let escaped_read = project.child("escape/secret.pdf");
        assert!(block_on(read_file_binary(&state, &path_string(&escaped_read))).is_err());
        let escaped_create = project.child("escape/new.tex");
        assert!(block_on(create_file(&state, &path_string(&escaped_create))).is_err());
        let escaped_directory = project.child("escape/new/directory");
        assert!(block_on(create_directory(&state, &path_string(&escaped_directory))).is_err());
        assert!(!outside.child("new.tex").exists());
        assert!(!outside.child("new").exists());
    }

    #[cfg(not(windows))]
    #[test]
    fn project_boundary_uses_path_components() {
        assert!(path_is_within(
            Path::new("/tmp/paper"),
            Path::new("/tmp/paper/chapters/one.tex")
        ));
        assert!(!path_is_within(
            Path::new("/tmp/paper"),
            Path::new("/tmp/paper-copy/main.tex")
        ));
    }
}
