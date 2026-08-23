use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::HistoryItem,
    services::filesystem,
    state::AppState,
};

const MAX_SNAPSHOTS: usize = 50;
const MAX_HISTORY_CONTENT_BYTES: usize = 50 * 1024 * 1024;
const TIMESTAMP_ALLOCATION_ATTEMPTS: u64 = 1_000;

#[derive(Default)]
pub struct HistoryState {
    operation_lock: Mutex<()>,
}

pub async fn save_snapshot(
    state: &AppState,
    history_state: &HistoryState,
    file_path: &str,
    content: String,
) -> AppResult<()> {
    if content.len() > MAX_HISTORY_CONTENT_BYTES {
        return Err(AppError::History(
            "history snapshot exceeds 50 MiB".to_owned(),
        ));
    }
    let _guard = history_state.operation_lock.lock().await;
    let file = filesystem::validate_existing_project_file(state, file_path).await?;
    let history_dir = validated_history_dir(state, &file).await?;
    tokio::fs::create_dir_all(&history_dir)
        .await
        .map_err(|source| {
            AppError::io("create history directory", display(&history_dir), source)
        })?;
    run_blocking(move || write_snapshot(&history_dir, content.as_bytes())).await
}

pub async fn list(
    state: &AppState,
    history_state: &HistoryState,
    file_path: &str,
) -> AppResult<Vec<HistoryItem>> {
    let _guard = history_state.operation_lock.lock().await;
    let file = filesystem::validate_existing_project_file(state, file_path).await?;
    let history_dir = history_dir(&file)?;
    match tokio::fs::symlink_metadata(&history_dir).await {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(AppError::io(
                "inspect history directory",
                display(&history_dir),
                source,
            ))
        }
    }
    let history_dir = filesystem::validate_project_directory_target(state, history_dir).await?;
    run_blocking(move || list_snapshots(&history_dir)).await
}

pub async fn load(
    state: &AppState,
    history_state: &HistoryState,
    file_path: &str,
    snapshot_path: &str,
) -> AppResult<String> {
    let _guard = history_state.operation_lock.lock().await;
    let file = filesystem::validate_existing_project_file(state, file_path).await?;
    let expected_dir = history_dir(&file)?;
    let requested = PathBuf::from(snapshot_path);
    if !requested.is_absolute() || snapshot_timestamp(&requested).is_none() {
        return Err(AppError::InvalidPath(snapshot_path.to_owned()));
    }
    let canonical_dir = filesystem::validate_project_directory_target(state, expected_dir).await?;
    let snapshot_display = snapshot_path.to_owned();
    let canonical_snapshot = run_blocking(move || {
        dunce::canonicalize(requested)
            .map_err(|source| AppError::io("resolve history snapshot", snapshot_display, source))
    })
    .await?;
    if canonical_snapshot.parent() != Some(canonical_dir.as_path()) {
        return Err(AppError::OutsideProject(display(&canonical_snapshot)));
    }
    run_blocking(move || read_snapshot(&canonical_snapshot)).await
}

async fn run_blocking<T>(task: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?
}

async fn validated_history_dir(state: &AppState, file: &Path) -> AppResult<PathBuf> {
    filesystem::validate_project_directory_target(state, history_dir(file)?).await
}

fn history_dir(file: &Path) -> AppResult<PathBuf> {
    let parent = file
        .parent()
        .ok_or_else(|| AppError::InvalidPath(display(file)))?;
    let name = file
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(display(file)))?;
    Ok(parent.join(".textex").join("history").join(name))
}

fn write_snapshot(history_dir: &Path, content: &[u8]) -> AppResult<()> {
    let base_timestamp = now_millis()?;
    let (timestamp, final_path) = (0..TIMESTAMP_ALLOCATION_ATTEMPTS)
        .map(|offset| base_timestamp.saturating_add(offset))
        .map(|timestamp| (timestamp, history_dir.join(format!("{timestamp}.gz"))))
        .find(|(_, path)| !path.exists())
        .ok_or_else(|| AppError::History("could not allocate history timestamp".to_owned()))?;
    let temporary = history_dir.join(format!(".{timestamp}.{}.tmp", std::process::id()));
    let result = (|| -> AppResult<()> {
        let file = File::create(&temporary).map_err(|source| {
            AppError::io("create history snapshot", display(&temporary), source)
        })?;
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(content).map_err(|source| {
            AppError::io("compress history snapshot", display(&temporary), source)
        })?;
        let file = encoder.finish().map_err(|source| {
            AppError::io("finish history snapshot", display(&temporary), source)
        })?;
        file.sync_all()
            .map_err(|source| AppError::io("sync history snapshot", display(&temporary), source))?;
        std::fs::rename(&temporary, &final_path).map_err(|source| {
            AppError::io("publish history snapshot", display(&final_path), source)
        })?;
        prune_snapshots(history_dir)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

fn list_snapshots(history_dir: &Path) -> AppResult<Vec<HistoryItem>> {
    let mut snapshots = collect_snapshots(history_dir)?;
    snapshots.sort_unstable_by(|left, right| right.timestamp.cmp(&left.timestamp));
    Ok(snapshots
        .into_iter()
        .map(|snapshot| HistoryItem {
            timestamp: snapshot.timestamp,
            size: snapshot.size,
            path: display(&snapshot.path),
        })
        .collect())
}

struct Snapshot {
    timestamp: u64,
    size: u64,
    path: PathBuf,
}

fn collect_snapshots(history_dir: &Path) -> AppResult<Vec<Snapshot>> {
    let mut snapshots = Vec::new();
    for entry in std::fs::read_dir(history_dir)
        .map_err(|source| AppError::io("list history", display(history_dir), source))?
    {
        let entry = entry
            .map_err(|source| AppError::io("read history entry", display(history_dir), source))?;
        let path = entry.path();
        let Some(timestamp) = snapshot_timestamp(&path) else {
            continue;
        };
        let file_type = entry.file_type().map_err(|source| {
            AppError::io("inspect history snapshot type", display(&path), source)
        })?;
        if !file_type.is_file() {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|source| AppError::io("inspect history snapshot", display(&path), source))?;
        snapshots.push(Snapshot {
            timestamp,
            size: metadata.len(),
            path,
        });
    }
    Ok(snapshots)
}

fn read_snapshot(path: &Path) -> AppResult<String> {
    let file = File::open(path)
        .map_err(|source| AppError::io("open history snapshot", display(path), source))?;
    let mut decoder = GzDecoder::new(file).take(MAX_HISTORY_CONTENT_BYTES as u64 + 1);
    let mut bytes = Vec::new();
    decoder
        .read_to_end(&mut bytes)
        .map_err(|source| AppError::io("decompress history snapshot", display(path), source))?;
    if bytes.len() > MAX_HISTORY_CONTENT_BYTES {
        return Err(AppError::History(
            "decompressed history snapshot exceeds 50 MiB".to_owned(),
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| AppError::History("history snapshot is not valid UTF-8".to_owned()))
}

fn prune_snapshots(history_dir: &Path) -> AppResult<()> {
    let mut snapshots = collect_snapshots(history_dir)?;
    snapshots.sort_unstable_by_key(|snapshot| snapshot.timestamp);
    let prune_count = snapshots.len().saturating_sub(MAX_SNAPSHOTS);
    for snapshot in snapshots.into_iter().take(prune_count) {
        std::fs::remove_file(&snapshot.path).map_err(|source| {
            AppError::io("prune history snapshot", display(&snapshot.path), source)
        })?;
    }
    Ok(())
}

fn snapshot_timestamp(path: &Path) -> Option<u64> {
    let name = path.file_name()?.to_str()?;
    let timestamp = name.strip_suffix(".gz")?;
    (!timestamp.is_empty() && timestamp.bytes().all(|byte| byte.is_ascii_digit()))
        .then(|| timestamp.parse().ok())
        .flatten()
}

fn now_millis() -> AppResult<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::History(error.to_string()))?
        .as_millis();
    u64::try_from(millis)
        .map_err(|_| AppError::History("system timestamp exceeds u64 milliseconds".to_owned()))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn saves_lists_and_loads_project_scoped_snapshots() {
        let project = tempfile::tempdir().unwrap();
        let file = project.path().join("paper.tex");
        std::fs::write(&file, "current").unwrap();
        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();
        let history_state = HistoryState::default();
        let file_path = file.to_str().unwrap();

        save_snapshot(&state, &history_state, file_path, "first".to_owned())
            .await
            .unwrap();
        let snapshots = list(&state, &history_state, file_path).await.unwrap();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(
            load(&state, &history_state, file_path, &snapshots[0].path)
                .await
                .unwrap(),
            "first"
        );

        let other = project.path().join("other.tex");
        std::fs::write(&other, "other").unwrap();
        assert!(load(
            &state,
            &history_state,
            other.to_str().unwrap(),
            &snapshots[0].path
        )
        .await
        .is_err());
    }

    #[test]
    fn accepts_only_numeric_gzip_snapshot_names() {
        assert_eq!(snapshot_timestamp(Path::new("123.gz")), Some(123));
        assert_eq!(snapshot_timestamp(Path::new("123.txt")), None);
        assert_eq!(snapshot_timestamp(Path::new("a123.gz")), None);
        assert_eq!(snapshot_timestamp(Path::new(".gz")), None);
    }

    #[test]
    fn pruning_keeps_the_newest_snapshot_files() {
        let history = tempfile::tempdir().unwrap();
        for timestamp in 0..(MAX_SNAPSHOTS + 2) {
            std::fs::write(history.path().join(format!("{timestamp}.gz")), []).unwrap();
        }
        std::fs::write(history.path().join("notes.txt"), []).unwrap();
        std::fs::create_dir(history.path().join("999.gz")).unwrap();

        prune_snapshots(history.path()).unwrap();

        let snapshots = collect_snapshots(history.path()).unwrap();
        assert_eq!(snapshots.len(), MAX_SNAPSHOTS);
        assert!(!history.path().join("0.gz").exists());
        assert!(!history.path().join("1.gz").exists());
        assert!(history.path().join("2.gz").exists());
        assert!(history.path().join("51.gz").exists());
        assert!(history.path().join("notes.txt").exists());
        assert!(history.path().join("999.gz").is_dir());
    }
}
