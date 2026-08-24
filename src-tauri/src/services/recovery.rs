use std::{
    cmp::Reverse,
    io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::{fs, io::AsyncWriteExt, sync::Mutex};

use crate::{
    error::{AppError, AppResult},
    models::{RecoveryDiskState, RecoveryItem, RecoverySnapshot},
    services::filesystem,
    state::AppState,
};

const RECOVERY_DIRECTORY: &str = "recovery";
const RECORD_VERSION: u8 = 1;
const RECORD_SUFFIX: &str = ".json";
const MAX_SNAPSHOT_BYTES: usize = 4 * 1024 * 1024;
const MAX_RECORD_BYTES: u64 = MAX_SNAPSHOT_BYTES as u64 + 64 * 1024;
const MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RECORDS: usize = 32;
const MAX_FILE_PATH_BYTES: usize = 32 * 1024;
const RETENTION_MILLIS: u64 = 30 * 24 * 60 * 60 * 1_000;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct RecoveryState {
    operation_lock: Mutex<()>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredRecoverySnapshot {
    version: u8,
    project_root: String,
    file_path: String,
    captured_at_epoch_ms: u64,
    content: String,
}

struct StoredRecord {
    id: String,
    path: PathBuf,
    serialized_size: u64,
    snapshot: StoredRecoverySnapshot,
}

pub fn recovery_root(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_local_data_dir()
        .map(|directory| directory.join(RECOVERY_DIRECTORY))
        .map_err(|error| AppError::RuntimePath(error.to_string()))
}

pub async fn save_snapshot(
    project_state: &AppState,
    recovery_state: &RecoveryState,
    root: &Path,
    file_path: &str,
    content: String,
) -> AppResult<()> {
    validate_content(&content)?;
    let canonical_file = filesystem::validate_save_file_target(project_state, file_path).await?;
    let canonical_file_path = filesystem::path_to_string(&canonical_file)?;
    let canonical_project_root = filesystem::path_to_string(&project_state.project_root()?)?;
    let id = record_id(&canonical_file_path);

    let _guard = recovery_state.operation_lock.lock().await;
    // Compare while holding the recovery lock. This prevents an autosnapshot
    // already in flight from recreating a stale record after a successful save
    // command clears it.
    let (_, disk_content) = disk_state_and_content(project_state, &canonical_file_path).await;
    if disk_content.as_deref() == Some(content.as_str()) {
        remove_record_if_exists(root, &id).await?;
        return Ok(());
    }

    ensure_private_root(root).await?;
    prune_store(root, now_millis()?).await?;

    let record_path = record_path(root, &id)?;
    if let Ok(existing) = read_record(&record_path, &id).await {
        if existing.snapshot.project_root == canonical_project_root
            && existing.snapshot.file_path == canonical_file_path
            && existing.snapshot.content == content
        {
            return Ok(());
        }
    }

    let record = StoredRecoverySnapshot {
        version: RECORD_VERSION,
        project_root: canonical_project_root,
        file_path: canonical_file_path,
        captured_at_epoch_ms: now_millis()?,
        content,
    };
    write_record(root, &record_path, &record).await?;
    prune_store(root, now_millis()?).await
}

pub async fn list(
    project_state: &AppState,
    recovery_state: &RecoveryState,
    root: &Path,
) -> AppResult<Vec<RecoveryItem>> {
    let active_root = project_state.project_root()?;
    let _guard = recovery_state.operation_lock.lock().await;
    if !validate_existing_root(root).await? {
        return Ok(Vec::new());
    }
    prune_store(root, now_millis()?).await?;

    let mut items = Vec::new();
    for record in collect_records(root).await? {
        if !filesystem::paths_equal(Path::new(&record.snapshot.project_root), &active_root) {
            continue;
        }
        let Ok(canonical_file) =
            filesystem::validate_save_file_target(project_state, &record.snapshot.file_path).await
        else {
            continue;
        };
        let Ok(canonical_file_path) = filesystem::path_to_string(&canonical_file) else {
            continue;
        };
        if record_id(&canonical_file_path) != record.id {
            continue;
        }

        let (disk_state, disk_content) =
            disk_state_and_content(project_state, &canonical_file_path).await;
        if disk_content.as_deref() == Some(record.snapshot.content.as_str()) {
            remove_path_if_exists(&record.path).await?;
            continue;
        }
        items.push(RecoveryItem {
            id: record.id,
            file_path: canonical_file_path,
            captured_at_epoch_ms: record.snapshot.captured_at_epoch_ms,
            size: record.snapshot.content.len() as u64,
            disk_state,
        });
    }
    items.sort_unstable_by_key(|item| Reverse(item.captured_at_epoch_ms));
    Ok(items)
}

pub async fn load(
    project_state: &AppState,
    recovery_state: &RecoveryState,
    root: &Path,
    id: &str,
) -> AppResult<RecoverySnapshot> {
    validate_record_id(id)?;
    let active_root = project_state.project_root()?;
    let _guard = recovery_state.operation_lock.lock().await;
    if !validate_existing_root(root).await? {
        return Err(AppError::Recovery(
            "recovery snapshot was not found".to_owned(),
        ));
    }
    let record = read_record(&record_path(root, id)?, id).await?;
    if !filesystem::paths_equal(Path::new(&record.snapshot.project_root), &active_root) {
        return Err(AppError::OutsideProject(record.snapshot.file_path));
    }
    let canonical_file =
        filesystem::validate_save_file_target(project_state, &record.snapshot.file_path).await?;
    let canonical_file_path = filesystem::path_to_string(&canonical_file)?;
    if record_id(&canonical_file_path) != id {
        return Err(AppError::Recovery(
            "recovery snapshot identity is invalid".to_owned(),
        ));
    }
    let (mut disk_state, disk_content) =
        disk_state_and_content(project_state, &canonical_file_path).await;
    if disk_content.as_deref() == Some(record.snapshot.content.as_str()) {
        disk_state = RecoveryDiskState::Unchanged;
    }
    let item = RecoveryItem {
        id: id.to_owned(),
        file_path: canonical_file_path,
        captured_at_epoch_ms: record.snapshot.captured_at_epoch_ms,
        size: record.snapshot.content.len() as u64,
        disk_state,
    };
    Ok(RecoverySnapshot {
        item,
        content: record.snapshot.content,
        disk_content,
    })
}

pub async fn discard(
    project_state: &AppState,
    recovery_state: &RecoveryState,
    root: &Path,
    id: &str,
) -> AppResult<()> {
    validate_record_id(id)?;
    let active_root = project_state.project_root()?;
    let _guard = recovery_state.operation_lock.lock().await;
    if !validate_existing_root(root).await? {
        return Ok(());
    }
    let path = record_path(root, id)?;
    let record = match read_record(&path, id).await {
        Ok(record) => record,
        Err(AppError::Io { source, .. }) if source.kind() == io::ErrorKind::NotFound => {
            return Ok(())
        }
        Err(error) => return Err(error),
    };
    if !filesystem::paths_equal(Path::new(&record.snapshot.project_root), &active_root) {
        return Err(AppError::OutsideProject(record.snapshot.file_path));
    }
    remove_path_if_exists(&path).await
}

pub async fn clear_file(
    project_state: &AppState,
    recovery_state: &RecoveryState,
    root: &Path,
    file_path: &str,
) -> AppResult<()> {
    let canonical_file = filesystem::validate_save_file_target(project_state, file_path).await?;
    let canonical_file_path = filesystem::path_to_string(&canonical_file)?;
    let id = record_id(&canonical_file_path);
    let _guard = recovery_state.operation_lock.lock().await;
    remove_record_if_exists(root, &id).await
}

fn validate_content(content: &str) -> AppResult<()> {
    if content.len() > MAX_SNAPSHOT_BYTES {
        return Err(AppError::Recovery(
            "recovery snapshot exceeds 4 MiB".to_owned(),
        ));
    }
    Ok(())
}

fn record_id(file_path: &str) -> String {
    let normalized = if cfg!(windows) {
        file_path.replace('\\', "/").to_lowercase()
    } else {
        file_path.to_owned()
    };
    format!("{:x}", Sha256::digest(normalized.as_bytes()))
}

fn validate_record_id(id: &str) -> AppResult<()> {
    if id.len() == 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Ok(());
    }
    Err(AppError::Recovery(
        "recovery snapshot identifier is invalid".to_owned(),
    ))
}

fn record_path(root: &Path, id: &str) -> AppResult<PathBuf> {
    validate_record_id(id)?;
    Ok(root.join(format!("{id}{RECORD_SUFFIX}")))
}

async fn disk_state_and_content(
    project_state: &AppState,
    file_path: &str,
) -> (RecoveryDiskState, Option<String>) {
    match filesystem::read_file(project_state, file_path).await {
        Ok(file) => (RecoveryDiskState::Modified, Some(file.content)),
        Err(AppError::Io { source, .. }) if source.kind() == io::ErrorKind::NotFound => {
            (RecoveryDiskState::Missing, None)
        }
        Err(_) => (RecoveryDiskState::Unavailable, None),
    }
}

async fn ensure_private_root(root: &Path) -> AppResult<()> {
    match fs::symlink_metadata(root).await {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(AppError::Recovery(
                "recovery store is not a private directory".to_owned(),
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir_all(root).await.map_err(|source| {
                AppError::io(
                    "create recovery directory",
                    root.to_string_lossy().into_owned(),
                    source,
                )
            })?;
        }
        Err(source) => {
            return Err(AppError::io(
                "inspect recovery directory",
                root.to_string_lossy().into_owned(),
                source,
            ));
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, std::fs::Permissions::from_mode(0o700))
            .await
            .map_err(|source| {
                AppError::io(
                    "protect recovery directory",
                    root.to_string_lossy().into_owned(),
                    source,
                )
            })?;
    }
    Ok(())
}

async fn validate_existing_root(root: &Path) -> AppResult<bool> {
    match fs::symlink_metadata(root).await {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => Err(
            AppError::Recovery("recovery store is not a private directory".to_owned()),
        ),
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(AppError::io(
            "inspect recovery directory",
            root.to_string_lossy().into_owned(),
            source,
        )),
    }
}

async fn write_record(
    root: &Path,
    destination: &Path,
    record: &StoredRecoverySnapshot,
) -> AppResult<()> {
    let bytes = serde_json::to_vec(record)
        .map_err(|error| AppError::Recovery(format!("cannot encode recovery snapshot: {error}")))?;
    if bytes.len() as u64 > MAX_RECORD_BYTES {
        return Err(AppError::Recovery(
            "encoded recovery snapshot exceeds the storage limit".to_owned(),
        ));
    }
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary = root.join(format!(".recovery-{}-{sequence}.tmp", std::process::id()));
    let result = async {
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).await.map_err(|source| {
            AppError::io(
                "create recovery snapshot",
                temporary.to_string_lossy().into_owned(),
                source,
            )
        })?;
        file.write_all(&bytes).await.map_err(|source| {
            AppError::io(
                "write recovery snapshot",
                temporary.to_string_lossy().into_owned(),
                source,
            )
        })?;
        file.sync_all().await.map_err(|source| {
            AppError::io(
                "sync recovery snapshot",
                temporary.to_string_lossy().into_owned(),
                source,
            )
        })?;
        drop(file);
        install_record(&temporary, destination).await
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&temporary).await;
    }
    result
}

async fn install_record(temporary: &Path, destination: &Path) -> AppResult<()> {
    match fs::rename(temporary, destination).await {
        Ok(()) => Ok(()),
        #[cfg(windows)]
        Err(_) if fs::try_exists(destination).await.unwrap_or(false) => {
            fs::remove_file(destination).await.map_err(|source| {
                AppError::io(
                    "replace recovery snapshot",
                    destination.to_string_lossy().into_owned(),
                    source,
                )
            })?;
            fs::rename(temporary, destination).await.map_err(|source| {
                AppError::io(
                    "install recovery snapshot",
                    destination.to_string_lossy().into_owned(),
                    source,
                )
            })
        }
        Err(source) => Err(AppError::io(
            "install recovery snapshot",
            destination.to_string_lossy().into_owned(),
            source,
        )),
    }
}

async fn collect_records(root: &Path) -> AppResult<Vec<StoredRecord>> {
    let mut reader = fs::read_dir(root).await.map_err(|source| {
        AppError::io(
            "list recovery snapshots",
            root.to_string_lossy().into_owned(),
            source,
        )
    })?;
    let mut records = Vec::new();
    while let Some(entry) = reader.next_entry().await.map_err(|source| {
        AppError::io(
            "read recovery snapshot entry",
            root.to_string_lossy().into_owned(),
            source,
        )
    })? {
        let path = entry.path();
        let file_type = match entry.file_type().await {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if !file_type.is_file() || file_type.is_symlink() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            let _ = remove_path_if_exists(&path).await;
            continue;
        };
        let Some(id) = name.strip_suffix(RECORD_SUFFIX) else {
            let _ = remove_path_if_exists(&path).await;
            continue;
        };
        if validate_record_id(id).is_err() {
            let _ = remove_path_if_exists(&path).await;
            continue;
        }
        match read_record(&path, id).await {
            Ok(record) => records.push(record),
            Err(_) => {
                let _ = remove_path_if_exists(&path).await;
            }
        }
    }
    Ok(records)
}

async fn read_record(path: &Path, id: &str) -> AppResult<StoredRecord> {
    let metadata = fs::symlink_metadata(path).await.map_err(|source| {
        AppError::io(
            "inspect recovery snapshot",
            path.to_string_lossy().into_owned(),
            source,
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_RECORD_BYTES
    {
        return Err(AppError::Recovery(
            "recovery snapshot has an invalid size or type".to_owned(),
        ));
    }
    let bytes = fs::read(path).await.map_err(|source| {
        AppError::io(
            "read recovery snapshot",
            path.to_string_lossy().into_owned(),
            source,
        )
    })?;
    let snapshot: StoredRecoverySnapshot = serde_json::from_slice(&bytes)
        .map_err(|_| AppError::Recovery("recovery snapshot is invalid".to_owned()))?;
    if snapshot.version != RECORD_VERSION
        || snapshot.content.len() > MAX_SNAPSHOT_BYTES
        || snapshot.file_path.len() > MAX_FILE_PATH_BYTES
        || snapshot.project_root.len() > MAX_FILE_PATH_BYTES
        || record_id(&snapshot.file_path) != id
    {
        return Err(AppError::Recovery(
            "recovery snapshot failed validation".to_owned(),
        ));
    }
    Ok(StoredRecord {
        id: id.to_owned(),
        path: path.to_path_buf(),
        serialized_size: metadata.len(),
        snapshot,
    })
}

async fn prune_store(root: &Path, now: u64) -> AppResult<()> {
    let mut records = collect_records(root).await?;
    records.sort_unstable_by_key(|record| Reverse(record.snapshot.captured_at_epoch_ms));
    let mut kept = 0_usize;
    let mut kept_bytes = 0_u64;
    for record in records {
        let expired = now.saturating_sub(record.snapshot.captured_at_epoch_ms) > RETENTION_MILLIS;
        let exceeds_count = kept >= MAX_RECORDS;
        let exceeds_bytes = kept_bytes.saturating_add(record.serialized_size) > MAX_TOTAL_BYTES;
        if expired || exceeds_count || exceeds_bytes {
            remove_path_if_exists(&record.path).await?;
            continue;
        }
        kept += 1;
        kept_bytes = kept_bytes.saturating_add(record.serialized_size);
    }
    Ok(())
}

async fn remove_record_if_exists(root: &Path, id: &str) -> AppResult<()> {
    if !validate_existing_root(root).await? {
        return Ok(());
    }
    remove_path_if_exists(&record_path(root, id)?).await
}

async fn remove_path_if_exists(path: &Path) -> AppResult<()> {
    match fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(AppError::io(
            "remove recovery snapshot",
            path.to_string_lossy().into_owned(),
            source,
        )),
    }
}

fn now_millis() -> AppResult<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Recovery(error.to_string()))?
        .as_millis();
    u64::try_from(millis)
        .map_err(|_| AppError::Recovery("system timestamp exceeds u64 milliseconds".to_owned()))
}

#[cfg(test)]
mod tests {
    use std::fs as std_fs;

    use tempfile::tempdir;

    use super::*;

    fn state_for(project: &Path) -> AppState {
        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(project).expect("canonical project"))
            .expect("set project root");
        state
    }

    #[test]
    fn persists_only_content_that_differs_from_disk() {
        tauri::async_runtime::block_on(async {
            let project = tempdir().expect("project directory");
            let store = tempdir().expect("recovery directory");
            let recovery_root = store.path().join("recovery");
            let source = project.path().join("main.tex");
            std_fs::write(&source, "disk").expect("write source");
            let project_state = state_for(project.path());
            let recovery_state = RecoveryState::default();
            let file_path = source.to_string_lossy().into_owned();

            save_snapshot(
                &project_state,
                &recovery_state,
                &recovery_root,
                &file_path,
                "draft".to_owned(),
            )
            .await
            .expect("save recovery snapshot");
            let items = list(&project_state, &recovery_state, &recovery_root)
                .await
                .expect("list recovery snapshots");
            assert_eq!(items.len(), 1);
            assert_eq!(items[0].disk_state, RecoveryDiskState::Modified);
            let loaded = load(
                &project_state,
                &recovery_state,
                &recovery_root,
                &items[0].id,
            )
            .await
            .expect("load recovery snapshot");
            assert_eq!(loaded.content, "draft");
            assert_eq!(loaded.disk_content.as_deref(), Some("disk"));

            save_snapshot(
                &project_state,
                &recovery_state,
                &recovery_root,
                &file_path,
                "disk".to_owned(),
            )
            .await
            .expect("save disk-identical content");
            assert!(list(&project_state, &recovery_state, &recovery_root)
                .await
                .expect("list after cleanup")
                .is_empty());
        });
    }

    #[test]
    fn rejects_outside_project_snapshot_paths() {
        tauri::async_runtime::block_on(async {
            let project = tempdir().expect("project directory");
            let outside = tempdir().expect("outside directory");
            let store = tempdir().expect("recovery directory");
            let source = outside.path().join("outside.tex");
            std_fs::write(&source, "outside").expect("write outside source");
            let project_state = state_for(project.path());
            let recovery_state = RecoveryState::default();

            let result = save_snapshot(
                &project_state,
                &recovery_state,
                &store.path().join("recovery"),
                &source.to_string_lossy(),
                "draft".to_owned(),
            )
            .await;
            assert!(matches!(result, Err(AppError::OutsideProject(_))));
            assert!(!store.path().join("recovery").exists());
        });
    }

    #[test]
    fn pruning_bounds_record_count_and_removes_expired_entries() {
        tauri::async_runtime::block_on(async {
            let store = tempdir().expect("recovery directory");
            let root = store.path().join("recovery");
            ensure_private_root(&root)
                .await
                .expect("create recovery root");
            let now = now_millis().expect("current time");
            for index in 0..(MAX_RECORDS + 2) {
                let file_path = format!("/project/{index}.tex");
                let id = record_id(&file_path);
                let record = StoredRecoverySnapshot {
                    version: RECORD_VERSION,
                    project_root: "/project".to_owned(),
                    file_path,
                    captured_at_epoch_ms: now - index as u64,
                    content: "draft".to_owned(),
                };
                write_record(&root, &record_path(&root, &id).unwrap(), &record)
                    .await
                    .expect("write bounded record");
            }
            let expired_path = "/project/expired.tex";
            let expired_id = record_id(expired_path);
            let expired = StoredRecoverySnapshot {
                version: RECORD_VERSION,
                project_root: "/project".to_owned(),
                file_path: expired_path.to_owned(),
                captured_at_epoch_ms: now.saturating_sub(RETENTION_MILLIS + 1),
                content: "expired".to_owned(),
            };
            write_record(&root, &record_path(&root, &expired_id).unwrap(), &expired)
                .await
                .expect("write expired record");

            prune_store(&root, now).await.expect("prune recovery store");
            assert_eq!(collect_records(&root).await.unwrap().len(), MAX_RECORDS);
            assert!(!record_path(&root, &expired_id).unwrap().exists());
        });
    }

    #[cfg(unix)]
    #[test]
    fn recovery_store_uses_private_unix_permissions() {
        use std::os::unix::fs::PermissionsExt;

        tauri::async_runtime::block_on(async {
            let project = tempdir().expect("project directory");
            let store = tempdir().expect("recovery directory");
            let root = store.path().join("recovery");
            let source = project.path().join("main.tex");
            std_fs::write(&source, "disk").expect("write source");
            let project_state = state_for(project.path());
            let recovery_state = RecoveryState::default();
            save_snapshot(
                &project_state,
                &recovery_state,
                &root,
                &source.to_string_lossy(),
                "draft".to_owned(),
            )
            .await
            .expect("save recovery snapshot");

            assert_eq!(
                std_fs::metadata(&root).unwrap().permissions().mode() & 0o777,
                0o700
            );
            let item = list(&project_state, &recovery_state, &root)
                .await
                .unwrap()
                .remove(0);
            assert_eq!(
                std_fs::metadata(record_path(&root, &item.id).unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        });
    }
}
