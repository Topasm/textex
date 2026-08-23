use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::{Duration, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    sync::Mutex,
    time::sleep,
};

use crate::{
    error::{AppError, AppResult},
    models::{
        DirectoryChangeEvent, DirectoryChangeType, DirectoryEntryType, ProjectIndexDelta,
        ProjectIndexEntry, ProjectIndexSnapshot,
    },
    state::AppState,
};

use super::filesystem;

const MAX_INDEX_ENTRIES: usize = 200_000;
const INDEX_CACHE_SCHEMA_VERSION: u32 = 1;
const INDEX_CACHE_DIRECTORY: &str = "project-index";
const MAX_INDEX_CACHE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CACHED_RELATIVE_PATH_BYTES: usize = 32 * 1024;
const CACHE_WRITE_DEBOUNCE: Duration = Duration::from_millis(250);
const CACHE_TEMP_FILE_ATTEMPTS: usize = 16;
static CACHE_TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const EXCLUDED_DIRECTORIES: &[&str] = &[
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    ".tectonic",
];

#[derive(Clone, Default)]
pub struct ProjectIndexState {
    inner: Arc<ProjectIndexInner>,
}

#[derive(Default)]
struct ProjectIndexInner {
    active: RwLock<Option<ProjectIndex>>,
    build_lock: Mutex<()>,
    cache_write_lock: Mutex<()>,
    cache_revision: AtomicU64,
    cache_worker_running: AtomicBool,
    next_activation_id: AtomicU64,
    notification: RwLock<IndexNotification>,
}

struct ProjectIndex {
    root: PathBuf,
    project_epoch: u64,
    generation: u64,
    entries: HashMap<String, ProjectIndexEntry>,
    activation_id: u64,
    authoritative: bool,
    refreshing: bool,
    cache_path: Option<PathBuf>,
}

#[derive(Default)]
struct IndexNotification {
    root: Option<PathBuf>,
    channel: Option<Channel<DirectoryChangeEvent>>,
    pending: Option<(PathBuf, DirectoryChangeEvent)>,
}

struct CurrentIndexSnapshot {
    snapshot: ProjectIndexSnapshot,
    authoritative: bool,
    refreshing: bool,
    activation_id: u64,
    has_cache_path: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProjectIndexCache {
    schema_version: u32,
    root_identity: String,
    entries: Vec<CachedProjectIndexEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CachedProjectIndexEntry {
    relative_path: String,
    entry_type: CachedEntryType,
    size: Option<u64>,
    modified_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum CachedEntryType {
    Directory,
    File,
}

impl ProjectIndexState {
    pub async fn snapshot(&self, project_state: &AppState) -> AppResult<ProjectIndexSnapshot> {
        let (root, project_epoch, epoch_tracker) = project_state.project_root_epoch()?;
        if let Some(current) = self.current_snapshot(&root, project_epoch)? {
            if current.authoritative {
                ensure_project_epoch(project_epoch, &epoch_tracker)?;
                return Ok(current.snapshot);
            }
        }

        let build_guard = self.inner.build_lock.lock().await;
        if let Some(current) = self.current_snapshot(&root, project_epoch)? {
            if current.authoritative {
                ensure_project_epoch(project_epoch, &epoch_tracker)?;
                return Ok(current.snapshot);
            }

            let scanned = scan_tree(&root, &root).await?;
            ensure_project_epoch(project_epoch, &epoch_tracker)?;
            let (snapshot, reconciliation) =
                self.install_authoritative_scan(&root, current.activation_id, scanned)?;
            if let Some(event) = reconciliation {
                self.publish_reconciliation(&root, event)?;
            }
            drop(build_guard);
            self.schedule_cache_persist();
            return Ok(snapshot);
        }

        let scanned = scan_tree(&root, &root).await?;
        ensure_project_epoch(project_epoch, &epoch_tracker)?;
        let index = self.new_index(root, project_epoch, scanned, true, None);
        let snapshot = snapshot_from_index(&index)?;
        *self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)? = Some(index);
        Ok(snapshot)
    }

    /// Returns a cache-hydrated snapshot immediately when one is available.
    /// The cache is never treated as authoritative: a serialized scan is
    /// scheduled under the same build lock used by watcher updates.
    pub async fn snapshot_with_cache(
        &self,
        project_state: &AppState,
        app_cache_root: Option<&Path>,
    ) -> AppResult<ProjectIndexSnapshot> {
        let (root, project_epoch, epoch_tracker) = project_state.project_root_epoch()?;
        if let Some(current) = self.current_snapshot(&root, project_epoch)? {
            if current.has_cache_path || app_cache_root.is_none() {
                ensure_project_epoch(project_epoch, &epoch_tracker)?;
                if !current.authoritative && !current.refreshing {
                    self.schedule_authoritative_refresh(
                        root,
                        current.activation_id,
                        project_epoch,
                        epoch_tracker,
                    )?;
                }
                return Ok(current.snapshot);
            }
        }

        let build_guard = self.inner.build_lock.lock().await;
        if let Some(mut current) = self.current_snapshot(&root, project_epoch)? {
            ensure_project_epoch(project_epoch, &epoch_tracker)?;
            if !current.has_cache_path {
                if let Some(cache_root) = app_cache_root {
                    if let Some(cache_path) = prepare_cache_path(cache_root, &root).await {
                        let mut active = self
                            .inner
                            .active
                            .write()
                            .map_err(|_| AppError::StatePoisoned)?;
                        if let Some(index) = active.as_mut().filter(|index| {
                            index.activation_id == current.activation_id
                                && filesystem::paths_equal(&index.root, &root)
                        }) {
                            index.cache_path = Some(cache_path);
                            current.has_cache_path = true;
                        }
                    }
                }
            }
            ensure_project_epoch(project_epoch, &epoch_tracker)?;
            drop(build_guard);
            if current.has_cache_path {
                self.schedule_cache_persist();
            }
            if !current.authoritative && !current.refreshing {
                self.schedule_authoritative_refresh(
                    root,
                    current.activation_id,
                    project_epoch,
                    epoch_tracker,
                )?;
            }
            return Ok(current.snapshot);
        }

        let cache_path = match app_cache_root {
            Some(cache_root) => prepare_cache_path(cache_root, &root).await,
            None => None,
        };
        if let Some(path) = cache_path.as_deref() {
            if let Some(entries) = load_cached_entries(path, &root).await {
                ensure_project_epoch(project_epoch, &epoch_tracker)?;
                let mut index =
                    self.new_index(root.clone(), project_epoch, entries, false, cache_path);
                index.refreshing = true;
                let activation_id = index.activation_id;
                let snapshot = snapshot_from_index(&index)?;
                *self
                    .inner
                    .active
                    .write()
                    .map_err(|_| AppError::StatePoisoned)? = Some(index);
                drop(build_guard);
                self.spawn_authoritative_refresh(root, activation_id, project_epoch, epoch_tracker);
                return Ok(snapshot);
            }
        }

        let scanned = scan_tree(&root, &root).await?;
        ensure_project_epoch(project_epoch, &epoch_tracker)?;
        let index = self.new_index(root, project_epoch, scanned, true, cache_path);
        let snapshot = snapshot_from_index(&index)?;
        *self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)? = Some(index);
        drop(build_guard);
        let _ = self.persist_active_cache().await;
        Ok(snapshot)
    }

    pub async fn apply_change(
        &self,
        root: &Path,
        project_epoch: u64,
        epoch_tracker: &AtomicU64,
        event: &DirectoryChangeEvent,
    ) -> AppResult<Option<ProjectIndexDelta>> {
        // A watcher event arriving during the initial scan waits here. Once
        // the snapshot is installed, the event is applied instead of being
        // lost between scan and publication.
        let _guard = self.inner.build_lock.lock().await;
        if epoch_tracker.load(Ordering::Acquire) != project_epoch
            || !self.is_active_for(root, project_epoch)?
        {
            return Ok(None);
        }

        let Some(relative) = safe_relative_path(&event.filename) else {
            return Ok(None);
        };
        if !should_index(&relative) {
            return Ok(None);
        }

        let absolute = root.join(&relative);
        let upserted = match fs::symlink_metadata(&absolute).await {
            Ok(metadata) if metadata.file_type().is_symlink() => Vec::new(),
            Ok(metadata)
                if metadata.is_dir() && event.event_type == DirectoryChangeType::Rename =>
            {
                scan_tree(root, &absolute).await?
            }
            Ok(metadata) if metadata.is_dir() => {
                vec![entry_from_metadata(root, &absolute, &metadata)?]
            }
            Ok(metadata) if metadata.is_file() => {
                vec![entry_from_metadata(root, &absolute, &metadata)?]
            }
            Ok(_) => Vec::new(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(source) => {
                return Err(AppError::io(
                    "update project index",
                    absolute.to_string_lossy().into_owned(),
                    source,
                ));
            }
        };

        let relative_string = relative_path_string(&relative)?;
        let relative_key = entry_key(&relative_string);
        if epoch_tracker.load(Ordering::Acquire) != project_epoch {
            return Ok(None);
        }
        let mut active = self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)?;
        let Some(index) = active.as_mut() else {
            return Ok(None);
        };
        if index.project_epoch != project_epoch || !filesystem::paths_equal(&index.root, root) {
            return Ok(None);
        }

        let descendant_prefix = format!("{relative_key}/");
        let upserted_keys = upserted
            .iter()
            .map(|entry| entry_key(&entry.relative_path))
            .collect::<HashSet<_>>();
        let removed_keys = if event.event_type == DirectoryChangeType::Rename {
            index
                .entries
                .keys()
                .filter(|key| *key == &relative_key || key.starts_with(&descendant_prefix))
                .cloned()
                .collect::<HashSet<_>>()
        } else if index.entries.contains_key(&relative_key) {
            HashSet::from([relative_key.clone()])
        } else {
            HashSet::new()
        };
        let added_key_count = upserted_keys
            .iter()
            .filter(|key| removed_keys.contains(*key) || !index.entries.contains_key(*key))
            .count();
        let projected_entry_count = index
            .entries
            .len()
            .saturating_sub(removed_keys.len())
            .saturating_add(added_key_count);
        if projected_entry_count > MAX_INDEX_ENTRIES {
            return Err(AppError::ProjectIndex(format!(
                "project index exceeds the {MAX_INDEX_ENTRIES} entry limit"
            )));
        }
        let mut removed_paths = Vec::new();
        for key in removed_keys {
            if let Some(entry) = index.entries.remove(&key) {
                if !upserted_keys.contains(&key) {
                    removed_paths.push(entry.relative_path);
                }
            }
        }

        for entry in &upserted {
            index
                .entries
                .insert(entry_key(&entry.relative_path), entry.clone());
        }
        if removed_paths.is_empty() && upserted.is_empty() {
            return Ok(None);
        }

        removed_paths.sort_by_key(|path| entry_key(path));
        index.generation = index.generation.saturating_add(1);
        let delta = ProjectIndexDelta {
            generation: index.generation,
            upserted,
            removed_paths,
        };
        drop(active);
        self.schedule_cache_persist();
        Ok(Some(delta))
    }

    pub fn invalidate(&self, root: &Path, project_epoch: u64) -> AppResult<()> {
        let mut active = self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)?;
        if active.as_ref().is_some_and(|index| {
            index.project_epoch == project_epoch && filesystem::paths_equal(&index.root, root)
        }) {
            *active = None;
            self.inner.cache_revision.fetch_add(1, Ordering::Release);
        }
        Ok(())
    }

    /// Invalidates only after any initial or reconciliation scan has reached
    /// its publication point. Watcher overflow uses this path so a scan that
    /// started before the overflow cannot install a stale snapshot after the
    /// invalidation event has already been sent to the renderer.
    pub async fn invalidate_after_pending_build(
        &self,
        root: &Path,
        project_epoch: u64,
        epoch_tracker: &AtomicU64,
    ) -> AppResult<()> {
        let _guard = self.inner.build_lock.lock().await;
        if epoch_tracker.load(Ordering::Acquire) != project_epoch {
            return Ok(());
        }
        self.invalidate(root, project_epoch)
    }

    pub fn set_event_channel(
        &self,
        root: &Path,
        channel: Channel<DirectoryChangeEvent>,
    ) -> AppResult<()> {
        let pending = {
            let mut notification = self
                .inner
                .notification
                .write()
                .map_err(|_| AppError::StatePoisoned)?;
            notification.root = Some(root.to_path_buf());
            notification.channel = Some(channel.clone());
            notification
                .pending
                .take()
                .filter(|(pending_root, _)| filesystem::paths_equal(pending_root, root))
                .map(|(_, event)| event)
        };
        if let Some(event) = pending {
            let _ = channel.send(event);
        }
        Ok(())
    }

    pub fn clear_event_channel(&self) -> AppResult<()> {
        let mut notification = self
            .inner
            .notification
            .write()
            .map_err(|_| AppError::StatePoisoned)?;
        notification.root = None;
        notification.channel = None;
        notification.pending = None;
        Ok(())
    }

    fn current_snapshot(
        &self,
        root: &Path,
        project_epoch: u64,
    ) -> AppResult<Option<CurrentIndexSnapshot>> {
        let active = self
            .inner
            .active
            .read()
            .map_err(|_| AppError::StatePoisoned)?;
        active
            .as_ref()
            .filter(|index| {
                index.project_epoch == project_epoch && filesystem::paths_equal(&index.root, root)
            })
            .map(|index| {
                Ok(CurrentIndexSnapshot {
                    snapshot: snapshot_from_index(index)?,
                    authoritative: index.authoritative,
                    refreshing: index.refreshing,
                    activation_id: index.activation_id,
                    has_cache_path: index.cache_path.is_some(),
                })
            })
            .transpose()
    }

    fn is_active_for(&self, root: &Path, project_epoch: u64) -> AppResult<bool> {
        Ok(self
            .inner
            .active
            .read()
            .map_err(|_| AppError::StatePoisoned)?
            .as_ref()
            .is_some_and(|index| {
                index.project_epoch == project_epoch && filesystem::paths_equal(&index.root, root)
            }))
    }

    fn new_index(
        &self,
        root: PathBuf,
        project_epoch: u64,
        entries: Vec<ProjectIndexEntry>,
        authoritative: bool,
        cache_path: Option<PathBuf>,
    ) -> ProjectIndex {
        ProjectIndex {
            root,
            project_epoch,
            generation: 1,
            entries: entries
                .into_iter()
                .map(|entry| (entry_key(&entry.relative_path), entry))
                .collect(),
            activation_id: self
                .inner
                .next_activation_id
                .fetch_add(1, Ordering::Relaxed)
                .saturating_add(1),
            authoritative,
            refreshing: false,
            cache_path,
        }
    }

    fn schedule_authoritative_refresh(
        &self,
        root: PathBuf,
        activation_id: u64,
        project_epoch: u64,
        epoch_tracker: Arc<AtomicU64>,
    ) -> AppResult<()> {
        let should_spawn = {
            let mut active = self
                .inner
                .active
                .write()
                .map_err(|_| AppError::StatePoisoned)?;
            let Some(index) = active.as_mut().filter(|index| {
                index.activation_id == activation_id && filesystem::paths_equal(&index.root, &root)
            }) else {
                return Ok(());
            };
            if index.authoritative || index.refreshing {
                false
            } else {
                index.refreshing = true;
                true
            }
        };
        if should_spawn {
            self.spawn_authoritative_refresh(root, activation_id, project_epoch, epoch_tracker);
        }
        Ok(())
    }

    fn spawn_authoritative_refresh(
        &self,
        root: PathBuf,
        activation_id: u64,
        project_epoch: u64,
        epoch_tracker: Arc<AtomicU64>,
    ) {
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            state
                .refresh_cached_index(root, activation_id, project_epoch, epoch_tracker)
                .await;
        });
    }

    async fn refresh_cached_index(
        &self,
        root: PathBuf,
        activation_id: u64,
        project_epoch: u64,
        epoch_tracker: Arc<AtomicU64>,
    ) {
        let build_guard = self.inner.build_lock.lock().await;
        if epoch_tracker.load(Ordering::Acquire) != project_epoch
            || !self.is_matching_activation(&root, activation_id)
        {
            self.finish_refresh(&root, activation_id);
            return;
        }

        let scanned = match scan_tree(&root, &root).await {
            Ok(scanned) => scanned,
            Err(error) => {
                eprintln!("TextEx cached project-index refresh failed: {error}");
                drop(build_guard);
                self.fail_cached_refresh(&root, activation_id, project_epoch)
                    .await;
                return;
            }
        };
        if epoch_tracker.load(Ordering::Acquire) != project_epoch {
            self.finish_refresh(&root, activation_id);
            return;
        }

        let reconciliation = match self.install_authoritative_scan(&root, activation_id, scanned) {
            Ok((_snapshot, reconciliation)) => reconciliation,
            Err(error) => {
                eprintln!("TextEx cached project-index install failed: {error}");
                drop(build_guard);
                self.fail_cached_refresh(&root, activation_id, project_epoch)
                    .await;
                return;
            }
        };
        if let Some(event) = reconciliation {
            let _ = self.publish_reconciliation(&root, event);
        }
        drop(build_guard);
        self.schedule_cache_persist();
    }

    async fn fail_cached_refresh(&self, root: &Path, activation_id: u64, project_epoch: u64) {
        let cache_path = {
            let Ok(mut active) = self.inner.active.write() else {
                return;
            };
            if !active.as_ref().is_some_and(|index| {
                index.activation_id == activation_id
                    && index.project_epoch == project_epoch
                    && filesystem::paths_equal(&index.root, root)
            }) {
                return;
            }
            active.take().and_then(|index| index.cache_path)
        };
        if let Some(cache_path) = cache_path {
            let _ = fs::remove_file(cache_path).await;
        }
        self.inner.cache_revision.fetch_add(1, Ordering::Release);
        let _ = self.publish_reconciliation(
            root,
            DirectoryChangeEvent {
                event_type: DirectoryChangeType::Rename,
                filename: String::new(),
                index_delta: None,
                index_invalidated: true,
            },
        );
    }

    fn install_authoritative_scan(
        &self,
        root: &Path,
        activation_id: u64,
        scanned: Vec<ProjectIndexEntry>,
    ) -> AppResult<(ProjectIndexSnapshot, Option<DirectoryChangeEvent>)> {
        let scanned = scanned
            .into_iter()
            .map(|entry| (entry_key(&entry.relative_path), entry))
            .collect::<HashMap<_, _>>();
        let mut active = self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)?;
        let index = active
            .as_mut()
            .filter(|index| {
                index.activation_id == activation_id && filesystem::paths_equal(&index.root, root)
            })
            .ok_or_else(|| {
                AppError::ProjectIndex("project index activation changed during refresh".to_owned())
            })?;

        let reconciliation = reconciliation_delta(index, &scanned);
        index.entries = scanned;
        index.authoritative = true;
        index.refreshing = false;
        let event = reconciliation.map(|mut delta| {
            index.generation = index.generation.saturating_add(1);
            delta.generation = index.generation;
            let filename = delta
                .removed_paths
                .first()
                .cloned()
                .or_else(|| {
                    delta
                        .upserted
                        .first()
                        .map(|entry| entry.relative_path.clone())
                })
                .unwrap_or_default();
            DirectoryChangeEvent {
                event_type: DirectoryChangeType::Rename,
                filename,
                index_delta: Some(delta),
                index_invalidated: false,
            }
        });
        Ok((snapshot_from_index(index)?, event))
    }

    fn is_matching_activation(&self, root: &Path, activation_id: u64) -> bool {
        self.inner
            .active
            .read()
            .ok()
            .and_then(|active| {
                active.as_ref().map(|index| {
                    index.activation_id == activation_id
                        && filesystem::paths_equal(&index.root, root)
                })
            })
            .unwrap_or(false)
    }

    fn finish_refresh(&self, root: &Path, activation_id: u64) {
        if let Ok(mut active) = self.inner.active.write() {
            if let Some(index) = active.as_mut().filter(|index| {
                index.activation_id == activation_id && filesystem::paths_equal(&index.root, root)
            }) {
                index.refreshing = false;
            }
        }
    }

    fn publish_reconciliation(&self, root: &Path, event: DirectoryChangeEvent) -> AppResult<()> {
        let mut notification = self
            .inner
            .notification
            .write()
            .map_err(|_| AppError::StatePoisoned)?;
        if notification
            .root
            .as_deref()
            .is_some_and(|watch_root| filesystem::paths_equal(watch_root, root))
        {
            if let Some(channel) = notification.channel.as_ref() {
                let _ = channel.send(event);
                return Ok(());
            }
        }
        notification.pending = Some((root.to_path_buf(), event));
        Ok(())
    }

    fn schedule_cache_persist(&self) {
        self.inner.cache_revision.fetch_add(1, Ordering::Release);
        if self
            .inner
            .cache_worker_running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            state.cache_persist_worker().await;
        });
    }

    async fn cache_persist_worker(&self) {
        loop {
            let observed = self.inner.cache_revision.load(Ordering::Acquire);
            sleep(CACHE_WRITE_DEBOUNCE).await;
            if self.inner.cache_revision.load(Ordering::Acquire) != observed {
                continue;
            }
            let _ = self.persist_active_cache().await;
            if self.inner.cache_revision.load(Ordering::Acquire) != observed {
                continue;
            }

            self.inner
                .cache_worker_running
                .store(false, Ordering::Release);
            if self.inner.cache_revision.load(Ordering::Acquire) == observed {
                return;
            }
            if self
                .inner
                .cache_worker_running
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
            {
                return;
            }
        }
    }

    async fn persist_active_cache(&self) -> AppResult<()> {
        let _cache_guard = self.inner.cache_write_lock.lock().await;
        let Some((path, cache)) = self.active_cache_record()? else {
            return Ok(());
        };
        write_cache_atomically(&path, &cache).await
    }

    fn active_cache_record(&self) -> AppResult<Option<(PathBuf, ProjectIndexCache)>> {
        let active = self
            .inner
            .active
            .read()
            .map_err(|_| AppError::StatePoisoned)?;
        let Some(index) = active.as_ref() else {
            return Ok(None);
        };
        let Some(cache_path) = index.cache_path.clone() else {
            return Ok(None);
        };
        Ok(Some((cache_path, cache_from_index(index)?)))
    }
}

fn ensure_project_epoch(expected: u64, tracker: &AtomicU64) -> AppResult<()> {
    if tracker.load(Ordering::Acquire) == expected {
        Ok(())
    } else {
        Err(AppError::ProjectIndex(
            "active project changed while the index was being built".to_owned(),
        ))
    }
}

fn reconciliation_delta(
    current: &ProjectIndex,
    scanned: &HashMap<String, ProjectIndexEntry>,
) -> Option<ProjectIndexDelta> {
    let mut upserted = scanned
        .iter()
        .filter(|(key, entry)| current.entries.get(*key) != Some(*entry))
        .map(|(_, entry)| entry.clone())
        .collect::<Vec<_>>();
    let mut removed_paths = current
        .entries
        .iter()
        .filter(|(key, _)| !scanned.contains_key(*key))
        .map(|(_, entry)| entry.relative_path.clone())
        .collect::<Vec<_>>();
    if upserted.is_empty() && removed_paths.is_empty() {
        return None;
    }
    upserted.sort_by_key(|entry| entry_key(&entry.relative_path));
    removed_paths.sort_by_key(|path| entry_key(path));
    Some(ProjectIndexDelta {
        generation: 0,
        upserted,
        removed_paths,
    })
}

async fn prepare_cache_path(app_cache_root: &Path, root: &Path) -> Option<PathBuf> {
    if !app_cache_root.is_absolute() || path_is_within(root, app_cache_root) {
        return None;
    }

    let mut existing_ancestor = app_cache_root;
    loop {
        match fs::symlink_metadata(existing_ancestor).await {
            Ok(_) => break,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                existing_ancestor = existing_ancestor.parent()?;
            }
            Err(_) => return None,
        }
    }
    let canonical_ancestor = tauri::async_runtime::spawn_blocking({
        let existing_ancestor = existing_ancestor.to_path_buf();
        move || dunce::canonicalize(existing_ancestor)
    })
    .await
    .ok()?
    .ok()?;
    let unresolved = app_cache_root.strip_prefix(existing_ancestor).ok()?;
    let prospective_cache_root = canonical_ancestor.join(unresolved);
    if path_is_within(root, &prospective_cache_root) {
        return None;
    }

    fs::create_dir_all(app_cache_root).await.ok()?;
    let canonical_cache_root = tauri::async_runtime::spawn_blocking({
        let app_cache_root = app_cache_root.to_path_buf();
        move || dunce::canonicalize(app_cache_root)
    })
    .await
    .ok()?
    .ok()?;
    if path_is_within(root, &canonical_cache_root) {
        return None;
    }

    let directory = canonical_cache_root.join(INDEX_CACHE_DIRECTORY);
    fs::create_dir_all(&directory).await.ok()?;
    let metadata = fs::symlink_metadata(&directory).await.ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return None;
    }
    let canonical_directory = tauri::async_runtime::spawn_blocking({
        let directory = directory.clone();
        move || dunce::canonicalize(directory)
    })
    .await
    .ok()?
    .ok()?;
    if path_is_within(root, &canonical_directory) {
        return None;
    }

    let identity = root_identity(root).ok()?;
    let hash = format!(
        "{:x}",
        Sha256::digest(format!("{INDEX_CACHE_SCHEMA_VERSION}\0{identity}").as_bytes())
    );
    Some(canonical_directory.join(format!("{hash}.json")))
}

async fn load_cached_entries(path: &Path, root: &Path) -> Option<Vec<ProjectIndexEntry>> {
    let metadata = fs::symlink_metadata(path).await.ok()?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_INDEX_CACHE_BYTES
    {
        return None;
    }

    let file = fs::File::open(path).await.ok()?;
    let mut bytes = Vec::with_capacity(metadata.len().min(MAX_INDEX_CACHE_BYTES) as usize);
    file.take(MAX_INDEX_CACHE_BYTES.saturating_add(1))
        .read_to_end(&mut bytes)
        .await
        .ok()?;
    if bytes.len() as u64 > MAX_INDEX_CACHE_BYTES {
        return None;
    }
    let cache = serde_json::from_slice::<ProjectIndexCache>(&bytes).ok()?;
    entries_from_cache(cache, root)
}

fn entries_from_cache(cache: ProjectIndexCache, root: &Path) -> Option<Vec<ProjectIndexEntry>> {
    if cache.schema_version != INDEX_CACHE_SCHEMA_VERSION
        || cache.root_identity != root_identity(root).ok()?
        || cache.entries.len() > MAX_INDEX_ENTRIES
    {
        return None;
    }

    let mut seen = HashSet::with_capacity(cache.entries.len());
    let mut entries = Vec::with_capacity(cache.entries.len());
    for cached in cache.entries {
        if cached.relative_path.len() > MAX_CACHED_RELATIVE_PATH_BYTES {
            return None;
        }
        let relative = safe_relative_path(&cached.relative_path)?;
        if !should_index(&relative) {
            return None;
        }
        let relative_path = relative_path_string(&relative).ok()?;
        if relative_path != cached.relative_path {
            return None;
        }
        let key = entry_key(&relative_path);
        if !seen.insert(key) {
            return None;
        }
        let name = relative
            .file_name()
            .and_then(|name| name.to_str())?
            .to_owned();
        let parent_relative_path = relative
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(relative_path_string)
            .transpose()
            .ok()?
            .unwrap_or_default();
        let (entry_type, size) = match cached.entry_type {
            CachedEntryType::Directory if cached.size.is_none() => {
                (DirectoryEntryType::Directory, None)
            }
            CachedEntryType::File => (DirectoryEntryType::File, cached.size),
            CachedEntryType::Directory => return None,
        };
        let absolute = root.join(&relative);
        entries.push(ProjectIndexEntry {
            path: filesystem::path_to_string(&absolute).ok()?,
            relative_path,
            parent_relative_path,
            name,
            entry_type,
            size,
            modified_ms: cached.modified_ms,
        });
    }
    Some(entries)
}

fn cache_from_index(index: &ProjectIndex) -> AppResult<ProjectIndexCache> {
    let mut entries = index
        .entries
        .values()
        .map(|entry| CachedProjectIndexEntry {
            relative_path: entry.relative_path.clone(),
            entry_type: if entry.entry_type == DirectoryEntryType::Directory {
                CachedEntryType::Directory
            } else {
                CachedEntryType::File
            },
            size: entry.size,
            modified_ms: entry.modified_ms,
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry_key(&entry.relative_path));
    Ok(ProjectIndexCache {
        schema_version: INDEX_CACHE_SCHEMA_VERSION,
        root_identity: root_identity(&index.root)?,
        entries,
    })
}

fn root_identity(root: &Path) -> AppResult<String> {
    let identity = filesystem::path_to_string(root)?;
    if cfg!(windows) {
        Ok(identity.to_ascii_lowercase())
    } else {
        Ok(identity)
    }
}

async fn write_cache_atomically(path: &Path, cache: &ProjectIndexCache) -> AppResult<()> {
    let bytes = serde_json::to_vec(cache)
        .map_err(|error| AppError::ProjectIndex(format!("serialize index cache: {error}")))?;
    if bytes.len() as u64 > MAX_INDEX_CACHE_BYTES {
        return Err(AppError::ProjectIndex(format!(
            "serialized project index cache exceeds {} MiB",
            MAX_INDEX_CACHE_BYTES / (1024 * 1024)
        )));
    }

    let (temporary, mut file) = reserve_cache_file(path).await?;
    let write_result = async {
        file.write_all(&bytes).await.map_err(|source| {
            AppError::io(
                "write project index cache",
                temporary.to_string_lossy().into_owned(),
                source,
            )
        })?;
        file.flush().await.map_err(|source| {
            AppError::io(
                "flush project index cache",
                temporary.to_string_lossy().into_owned(),
                source,
            )
        })?;
        file.sync_all().await.map_err(|source| {
            AppError::io(
                "sync project index cache",
                temporary.to_string_lossy().into_owned(),
                source,
            )
        })?;
        drop(file);
        replace_cache_file(temporary.clone(), path.to_path_buf()).await
    }
    .await;
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary).await;
    }
    write_result
}

async fn reserve_cache_file(path: &Path) -> AppResult<(PathBuf, fs::File)> {
    let parent = path.parent().ok_or_else(|| {
        AppError::ProjectIndex(format!(
            "cache path has no parent: {}",
            path.to_string_lossy()
        ))
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))?;
    for _ in 0..CACHE_TEMP_FILE_ATTEMPTS {
        let sequence = CACHE_TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.textex-cache-{}-{sequence}",
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
                    "create project index cache",
                    candidate.to_string_lossy().into_owned(),
                    source,
                ));
            }
        }
    }
    Err(AppError::io(
        "create project index cache",
        path.to_string_lossy().into_owned(),
        io::Error::new(
            io::ErrorKind::AlreadyExists,
            "could not reserve a unique cache file",
        ),
    ))
}

#[cfg(not(windows))]
async fn replace_cache_file(temporary: PathBuf, target: PathBuf) -> AppResult<()> {
    fs::rename(&temporary, &target).await.map_err(|source| {
        AppError::io(
            "replace project index cache",
            target.to_string_lossy().into_owned(),
            source,
        )
    })
}

#[cfg(windows)]
async fn replace_cache_file(temporary: PathBuf, target: PathBuf) -> AppResult<()> {
    let display = target.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || move_file_replace(&temporary, &target))
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?
        .map_err(|source| AppError::io("replace project index cache", display, source))
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

fn snapshot_from_index(index: &ProjectIndex) -> AppResult<ProjectIndexSnapshot> {
    let mut entries = index.entries.values().cloned().collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        entry_key(&left.relative_path).cmp(&entry_key(&right.relative_path))
    });
    Ok(ProjectIndexSnapshot {
        root: filesystem::path_to_string(&index.root)?,
        generation: index.generation,
        entries,
    })
}

async fn scan_tree(root: &Path, start: &Path) -> AppResult<Vec<ProjectIndexEntry>> {
    let start_metadata = fs::symlink_metadata(start).await.map_err(|source| {
        AppError::io(
            "scan project index",
            start.to_string_lossy().into_owned(),
            source,
        )
    })?;
    if start_metadata.file_type().is_symlink() {
        return Ok(Vec::new());
    }
    if start_metadata.is_file() {
        return Ok(vec![entry_from_metadata(root, start, &start_metadata)?]);
    }
    if !start_metadata.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let mut pending = VecDeque::from([start.to_path_buf()]);
    if start != root {
        entries.push(entry_from_metadata(root, start, &start_metadata)?);
    }

    while let Some(directory) = pending.pop_front() {
        let mut reader = match fs::read_dir(&directory).await {
            Ok(reader) => reader,
            Err(_source) if directory != start => continue,
            Err(source) => {
                return Err(AppError::io(
                    "scan project index",
                    directory.to_string_lossy().into_owned(),
                    source,
                ));
            }
        };

        while let Some(entry) = reader.next_entry().await.map_err(|source| {
            AppError::io(
                "scan project index",
                directory.to_string_lossy().into_owned(),
                source,
            )
        })? {
            let path = entry.path();
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            if !should_index(relative) {
                continue;
            }

            let metadata = match fs::symlink_metadata(&path).await {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if !metadata.is_file() && !metadata.is_dir() {
                continue;
            }

            entries.push(entry_from_metadata(root, &path, &metadata)?);
            if entries.len() > MAX_INDEX_ENTRIES {
                return Err(AppError::ProjectIndex(format!(
                    "project contains more than {MAX_INDEX_ENTRIES} indexable entries"
                )));
            }
            if metadata.is_dir() {
                pending.push_back(path);
            }
        }
    }

    Ok(entries)
}

fn entry_from_metadata(
    root: &Path,
    path: &Path,
    metadata: &std::fs::Metadata,
) -> AppResult<ProjectIndexEntry> {
    let relative = path.strip_prefix(root).map_err(|_| {
        AppError::ProjectIndex(format!(
            "indexed path escaped the project root: {}",
            path.to_string_lossy()
        ))
    })?;
    let relative_path = relative_path_string(relative)?;
    let parent_relative_path = relative
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(relative_path_string)
        .transpose()?
        .unwrap_or_default();
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| u64::try_from(duration.as_millis()).ok());

    Ok(ProjectIndexEntry {
        path: filesystem::path_to_string(path)?,
        relative_path,
        parent_relative_path,
        name,
        entry_type: if metadata.is_dir() {
            DirectoryEntryType::Directory
        } else {
            DirectoryEntryType::File
        },
        size: metadata.is_file().then_some(metadata.len()),
        modified_ms,
    })
}

fn safe_relative_path(filename: &str) -> Option<PathBuf> {
    let path = Path::new(filename);
    if path.as_os_str().is_empty() || path.is_absolute() {
        return None;
    }
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
        .then(|| path.to_path_buf())
}

fn should_index(relative: &Path) -> bool {
    relative.components().all(|component| {
        let Component::Normal(name) = component else {
            return false;
        };
        let Some(name) = name.to_str() else {
            return false;
        };
        !name.starts_with('.') && !EXCLUDED_DIRECTORIES.contains(&name)
    })
}

fn relative_path_string(path: &Path) -> AppResult<String> {
    path.components()
        .map(|component| match component {
            Component::Normal(value) => value
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned())),
            _ => Err(AppError::ProjectIndex(format!(
                "invalid relative index path: {}",
                path.to_string_lossy()
            ))),
        })
        .collect::<AppResult<Vec<_>>>()
        .map(|components| components.join("/"))
}

fn entry_key(relative_path: &str) -> String {
    if cfg!(windows) {
        relative_path.to_lowercase()
    } else {
        relative_path.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::{
        models::{DirectoryChangeEvent, DirectoryChangeType},
        state::AppState,
    };

    use super::{
        prepare_cache_path, ProjectIndexCache, ProjectIndexState, INDEX_CACHE_DIRECTORY,
        INDEX_CACHE_SCHEMA_VERSION, MAX_INDEX_CACHE_BYTES,
    };

    fn event(event_type: DirectoryChangeType, filename: &str) -> DirectoryChangeEvent {
        DirectoryChangeEvent {
            event_type,
            filename: filename.to_owned(),
            index_delta: None,
            index_invalidated: false,
        }
    }

    #[tokio::test]
    async fn builds_a_flat_metadata_snapshot_without_hidden_or_noisy_trees() {
        let project = tempdir().expect("project tempdir");
        fs::create_dir(project.path().join("chapters")).expect("chapters directory");
        fs::write(project.path().join("main.tex"), "main").expect("main file");
        fs::write(project.path().join("chapters/intro.tex"), "intro").expect("chapter file");
        fs::create_dir(project.path().join(".git")).expect("git directory");
        fs::write(project.path().join(".git/index"), "ignored").expect("git file");
        fs::create_dir(project.path().join("node_modules")).expect("node modules");
        fs::write(project.path().join("node_modules/cache"), "ignored").expect("cache file");

        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");
        let index = ProjectIndexState::default();
        let snapshot = index.snapshot(&app_state).await.expect("snapshot");

        assert_eq!(snapshot.generation, 1);
        assert_eq!(
            snapshot
                .entries
                .iter()
                .map(|entry| entry.relative_path.as_str())
                .collect::<Vec<_>>(),
            vec!["chapters", "chapters/intro.tex", "main.tex"]
        );
        let main = snapshot
            .entries
            .iter()
            .find(|entry| entry.relative_path == "main.tex")
            .expect("main entry");
        assert_eq!(main.size, Some(4));
        assert_eq!(main.parent_relative_path, "");
        assert!(main.modified_ms.is_some());
    }

    #[tokio::test]
    async fn applies_create_change_and_remove_events_after_lazy_activation() {
        let project = tempdir().expect("project tempdir");
        fs::write(project.path().join("main.tex"), "a").expect("main file");
        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");
        let (_, project_epoch, epoch_tracker) =
            app_state.project_root_epoch().expect("project epoch");
        let index = ProjectIndexState::default();

        assert!(index
            .apply_change(
                &root,
                project_epoch,
                &epoch_tracker,
                &event(DirectoryChangeType::Change, "main.tex"),
            )
            .await
            .expect("inactive update")
            .is_none());
        index.snapshot(&app_state).await.expect("activate index");

        fs::create_dir(project.path().join("chapters")).expect("chapters directory");
        fs::write(project.path().join("chapters/intro.tex"), "intro").expect("intro file");
        let created = index
            .apply_change(
                &root,
                project_epoch,
                &epoch_tracker,
                &event(DirectoryChangeType::Rename, "chapters"),
            )
            .await
            .expect("create delta")
            .expect("active create delta");
        assert_eq!(created.generation, 2);
        assert_eq!(created.upserted.len(), 2);

        fs::write(project.path().join("main.tex"), "updated").expect("update main");
        let changed = index
            .apply_change(
                &root,
                project_epoch,
                &epoch_tracker,
                &event(DirectoryChangeType::Change, "main.tex"),
            )
            .await
            .expect("change delta")
            .expect("active change delta");
        assert_eq!(changed.generation, 3);
        assert_eq!(changed.upserted[0].size, Some(7));

        fs::remove_dir_all(project.path().join("chapters")).expect("remove chapters");
        let removed = index
            .apply_change(
                &root,
                project_epoch,
                &epoch_tracker,
                &event(DirectoryChangeType::Rename, "chapters"),
            )
            .await
            .expect("remove delta")
            .expect("active remove delta");
        assert_eq!(removed.generation, 4);
        assert_eq!(
            removed.removed_paths,
            vec!["chapters", "chapters/intro.tex"]
        );

        let snapshot = index.snapshot(&app_state).await.expect("updated snapshot");
        assert_eq!(snapshot.generation, 4);
        assert_eq!(snapshot.entries.len(), 1);
        assert_eq!(snapshot.entries[0].relative_path, "main.tex");
    }

    #[tokio::test]
    async fn hydrates_cache_first_then_reconciles_with_an_authoritative_scan() {
        let project = tempdir().expect("project tempdir");
        let cache = tempdir().expect("cache tempdir");
        fs::write(project.path().join("main.tex"), "old").expect("main file");
        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");

        let first_index = ProjectIndexState::default();
        let first = first_index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("cold snapshot");
        assert_eq!(first.generation, 1);
        assert_eq!(first.entries[0].size, Some(3));
        let cache_path = prepare_cache_path(cache.path(), &root)
            .await
            .expect("cache path");
        assert!(cache_path.is_file());
        assert!(cache_path.starts_with(cache.path()));
        assert!(!cache_path.starts_with(project.path()));

        fs::write(project.path().join("main.tex"), "updated").expect("updated main file");
        fs::write(project.path().join("added.tex"), "new").expect("added file");
        let warm_index = ProjectIndexState::default();
        let warm = warm_index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("warm snapshot");
        assert_eq!(warm.generation, 1);
        assert_eq!(warm.entries.len(), 1);
        assert_eq!(warm.entries[0].size, Some(3));

        let reconciled = warm_index
            .snapshot(&app_state)
            .await
            .expect("authoritative snapshot");
        assert_eq!(reconciled.generation, 2);
        assert_eq!(
            reconciled
                .entries
                .iter()
                .map(|entry| (entry.relative_path.as_str(), entry.size))
                .collect::<Vec<_>>(),
            vec![("added.tex", Some(3)), ("main.tex", Some(7))]
        );
    }

    #[tokio::test]
    async fn malformed_wrong_version_and_oversized_caches_fall_back_to_scanning() {
        let project = tempdir().expect("project tempdir");
        let cache = tempdir().expect("cache tempdir");
        fs::write(project.path().join("main.tex"), "one").expect("main file");
        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");
        let index = ProjectIndexState::default();
        index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("initial snapshot");
        let cache_path = prepare_cache_path(cache.path(), &root)
            .await
            .expect("cache path");

        fs::write(&cache_path, b"{not-json").expect("malformed cache");
        fs::write(project.path().join("malformed.tex"), "m").expect("malformed fallback file");
        let malformed_index = ProjectIndexState::default();
        let malformed = malformed_index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("malformed fallback snapshot");
        assert!(malformed
            .entries
            .iter()
            .any(|entry| entry.relative_path == "malformed.tex"));

        let bytes = fs::read(&cache_path).expect("rewritten cache");
        let mut versioned: serde_json::Value =
            serde_json::from_slice(&bytes).expect("valid rewritten cache");
        versioned["schemaVersion"] = serde_json::json!(INDEX_CACHE_SCHEMA_VERSION + 1);
        fs::write(
            &cache_path,
            serde_json::to_vec(&versioned).expect("versioned cache bytes"),
        )
        .expect("wrong version cache");
        fs::write(project.path().join("version.tex"), "v").expect("version fallback file");
        let version_index = ProjectIndexState::default();
        let version = version_index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("version fallback snapshot");
        assert!(version
            .entries
            .iter()
            .any(|entry| entry.relative_path == "version.tex"));

        let oversized = fs::File::create(&cache_path).expect("oversized cache file");
        oversized
            .set_len(MAX_INDEX_CACHE_BYTES + 1)
            .expect("oversized cache length");
        fs::write(project.path().join("oversized.tex"), "o").expect("size fallback file");
        let oversized_index = ProjectIndexState::default();
        let oversized = oversized_index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("oversized fallback snapshot");
        assert!(oversized
            .entries
            .iter()
            .any(|entry| entry.relative_path == "oversized.tex"));
    }

    #[tokio::test]
    async fn wrong_root_and_unsafe_cached_paths_are_never_hydrated() {
        let project = tempdir().expect("project tempdir");
        let cache = tempdir().expect("cache tempdir");
        fs::write(project.path().join("main.tex"), "main").expect("main file");
        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");
        let cache_path = prepare_cache_path(cache.path(), &root)
            .await
            .expect("cache path");
        let malicious = ProjectIndexCache {
            schema_version: INDEX_CACHE_SCHEMA_VERSION,
            root_identity: "/some/other/project".to_owned(),
            entries: vec![super::CachedProjectIndexEntry {
                relative_path: "../outside.tex".to_owned(),
                entry_type: super::CachedEntryType::File,
                size: Some(1),
                modified_ms: None,
            }],
        };
        fs::write(
            &cache_path,
            serde_json::to_vec(&malicious).expect("malicious cache bytes"),
        )
        .expect("malicious cache");

        let index = ProjectIndexState::default();
        let snapshot = index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("safe fallback snapshot");
        assert_eq!(snapshot.entries.len(), 1);
        assert_eq!(snapshot.entries[0].relative_path, "main.tex");
        assert!(snapshot.entries[0].path.starts_with(root.to_str().unwrap()));

        let unsafe_path = ProjectIndexCache {
            schema_version: INDEX_CACHE_SCHEMA_VERSION,
            root_identity: super::root_identity(&root).expect("root identity"),
            entries: vec![super::CachedProjectIndexEntry {
                relative_path: "../outside.tex".to_owned(),
                entry_type: super::CachedEntryType::File,
                size: Some(1),
                modified_ms: None,
            }],
        };
        fs::write(
            &cache_path,
            serde_json::to_vec(&unsafe_path).expect("unsafe path cache bytes"),
        )
        .expect("unsafe path cache");
        fs::write(project.path().join("safe.tex"), "safe").expect("safe project file");
        let unsafe_path_index = ProjectIndexState::default();
        let unsafe_path_snapshot = unsafe_path_index
            .snapshot_with_cache(&app_state, Some(cache.path()))
            .await
            .expect("unsafe path fallback snapshot");
        assert!(unsafe_path_snapshot
            .entries
            .iter()
            .any(|entry| entry.relative_path == "safe.tex"));
        assert!(!unsafe_path_snapshot
            .entries
            .iter()
            .any(|entry| entry.relative_path == "../outside.tex"));
    }

    #[tokio::test]
    async fn refuses_a_cache_location_inside_the_project_without_creating_it() {
        let project = tempdir().expect("project tempdir");
        fs::write(project.path().join("main.tex"), "main").expect("main file");
        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");
        let unsafe_cache_root = project.path().join("app-cache");

        let index = ProjectIndexState::default();
        let snapshot = index
            .snapshot_with_cache(&app_state, Some(&unsafe_cache_root))
            .await
            .expect("snapshot without project-local cache");
        assert_eq!(snapshot.entries.len(), 1);
        assert!(!unsafe_cache_root.exists());
        assert!(!project.path().join(INDEX_CACHE_DIRECTORY).exists());
    }

    #[tokio::test]
    async fn reopening_the_same_root_invalidates_the_previous_in_memory_activation() {
        let project = tempdir().expect("project tempdir");
        fs::write(project.path().join("main.tex"), "old").expect("main file");
        let root = dunce::canonicalize(project.path()).expect("canonical project");
        let app_state = AppState::default();
        app_state
            .set_project_root(root.clone())
            .expect("set project root");
        let (_, old_epoch, epoch_tracker) =
            app_state.project_root_epoch().expect("old project epoch");
        let index = ProjectIndexState::default();
        let first = index.snapshot(&app_state).await.expect("first snapshot");
        assert_eq!(first.entries[0].size, Some(3));

        fs::write(project.path().join("main.tex"), "updated").expect("updated main file");
        app_state
            .set_project_root(root.clone())
            .expect("reactivate same root");
        let stale_watcher_delta = index
            .apply_change(
                &root,
                old_epoch,
                &epoch_tracker,
                &event(DirectoryChangeType::Change, "main.tex"),
            )
            .await
            .expect("stale watcher update");
        assert!(stale_watcher_delta.is_none());
        let reopened = index.snapshot(&app_state).await.expect("reopened snapshot");
        assert_eq!(reopened.generation, 1);
        assert_eq!(reopened.entries[0].size, Some(7));
    }
}
