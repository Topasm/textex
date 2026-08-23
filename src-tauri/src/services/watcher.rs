use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::Duration,
};

use notify::{event::ModifyKind, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{async_runtime::JoinHandle, ipc::Channel};
use tokio::{sync::mpsc, time::sleep};

use crate::{
    error::{AppError, AppResult},
    models::{DirectoryChangeEvent, DirectoryChangeType},
    services::{filesystem, project_index::ProjectIndexState},
    state::AppState,
};

const WATCH_BATCH_WINDOW: Duration = Duration::from_millis(100);
const WATCH_EVENT_QUEUE_CAPACITY: usize = 1_024;
const WATCH_BATCH_PATH_CAPACITY: usize = 4_096;
const EXCLUDED_DIRECTORIES: &[&str] = &[
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    ".tectonic",
];

#[derive(Default)]
pub struct DirectoryWatcherState {
    active: Mutex<Option<ActiveDirectoryWatcher>>,
}

struct ActiveDirectoryWatcher {
    _watcher: RecommendedWatcher,
    worker: JoinHandle<()>,
}

impl DirectoryWatcherState {
    pub fn clear(&self) -> AppResult<bool> {
        Ok(self.lock()?.take().is_some())
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, Option<ActiveDirectoryWatcher>>> {
        self.active.lock().map_err(|_| AppError::StatePoisoned)
    }
}

impl Drop for ActiveDirectoryWatcher {
    fn drop(&mut self) {
        self.worker.abort();
    }
}

pub async fn watch_directory(
    project_state: &AppState,
    watcher_state: &DirectoryWatcherState,
    index_state: &ProjectIndexState,
    dir_path: &str,
    on_event: Channel<DirectoryChangeEvent>,
) -> AppResult<()> {
    let root = filesystem::resolve_project_directory(project_state, dir_path).await?;
    let (_, project_epoch, epoch_tracker) = project_state.project_root_epoch()?;
    ensure_project_activation(project_state, &root, project_epoch)?;
    let worker_root = root.clone();
    let (sender, receiver) = mpsc::channel(WATCH_EVENT_QUEUE_CAPACITY);
    let overflowed = Arc::new(AtomicBool::new(false));
    let worker = tauri::async_runtime::spawn(forward_events(
        receiver,
        worker_root,
        project_epoch,
        epoch_tracker,
        index_state.clone(),
        on_event.clone(),
        Arc::clone(&overflowed),
    ));
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
        if let Err(mpsc::error::TrySendError::Full(_)) = sender.try_send(event) {
            overflowed.store(true, Ordering::Release);
        }
    })
    .map_err(|error| AppError::Watcher(error.to_string()))?;

    if let Err(error) = watcher.watch(&root, RecursiveMode::Recursive) {
        worker.abort();
        return Err(AppError::Watcher(error.to_string()));
    }

    // Installing the watcher is the commit point. Keep the watcher-state lock
    // across the final project epoch check and index-channel registration so
    // a concurrent close either invalidates this installation or removes it
    // immediately after the lock is released.
    let mut active = watcher_state.lock()?;
    ensure_project_activation(project_state, &root, project_epoch)?;
    *active = Some(ActiveDirectoryWatcher {
        _watcher: watcher,
        worker,
    });
    if let Err(error) = index_state.set_event_channel(&root, on_event) {
        *active = None;
        return Err(error);
    }
    if let Err(error) = ensure_project_activation(project_state, &root, project_epoch) {
        *active = None;
        let _ = index_state.clear_event_channel();
        return Err(error);
    }
    Ok(())
}

fn ensure_project_activation(
    project_state: &AppState,
    root: &Path,
    project_epoch: u64,
) -> AppResult<()> {
    let matches = project_state
        .project_root_epoch()
        .is_ok_and(|(active_root, active_epoch, _)| {
            active_epoch == project_epoch && filesystem::paths_equal(root, &active_root)
        });
    if matches {
        Ok(())
    } else {
        Err(AppError::Watcher(
            "active project changed while the watcher was starting".to_owned(),
        ))
    }
}

async fn forward_events(
    mut receiver: mpsc::Receiver<notify::Result<Event>>,
    root: PathBuf,
    project_epoch: u64,
    epoch_tracker: Arc<AtomicU64>,
    index_state: ProjectIndexState,
    on_event: Channel<DirectoryChangeEvent>,
    overflowed: Arc<AtomicBool>,
) {
    while let Some(first) = receiver.recv().await {
        if epoch_tracker.load(Ordering::Acquire) != project_epoch {
            return;
        }
        let mut pending = HashMap::new();
        let mut batch_overflowed =
            overflowed.swap(false, Ordering::AcqRel) || collect_event(&root, first, &mut pending);
        let batch_window = sleep(WATCH_BATCH_WINDOW);
        tokio::pin!(batch_window);

        loop {
            tokio::select! {
                event = receiver.recv() => {
                    let Some(event) = event else {
                        break;
                    };
                    if !batch_overflowed {
                        batch_overflowed = collect_event(&root, event, &mut pending);
                    }
                    batch_overflowed |= overflowed.swap(false, Ordering::AcqRel);
                }
                _ = &mut batch_window => break,
            }
        }

        batch_overflowed |= overflowed.swap(false, Ordering::AcqRel);
        if batch_overflowed {
            if let Err(error) = index_state
                .invalidate_after_pending_build(&root, project_epoch, &epoch_tracker)
                .await
            {
                eprintln!("TextEx project-index overflow invalidation failed: {error}");
            }
            if epoch_tracker.load(Ordering::Acquire) != project_epoch {
                return;
            }
            let _ = on_event.send(index_invalidation_event());
            continue;
        }

        for mut event in pending.into_values() {
            if epoch_tracker.load(Ordering::Acquire) != project_epoch {
                return;
            }
            match index_state
                .apply_change(&root, project_epoch, &epoch_tracker, &event)
                .await
            {
                Ok(delta) => event.index_delta = delta,
                Err(error) => {
                    eprintln!("TextEx project-index delta failed; scheduling resync: {error}");
                    let _ = index_state.invalidate(&root, project_epoch);
                    event.index_invalidated = true;
                }
            }
            if epoch_tracker.load(Ordering::Acquire) != project_epoch {
                return;
            }
            // A closed renderer channel must not keep or crash the watcher.
            let _ = on_event.send(event);
        }
    }
}

fn collect_event(
    root: &Path,
    event: notify::Result<Event>,
    pending: &mut HashMap<String, DirectoryChangeEvent>,
) -> bool {
    let Ok(event) = event else {
        // A backend error can mean the OS queue lost events. Force an
        // authoritative rescan instead of preserving a potentially stale
        // project index.
        return true;
    };
    if event.need_rescan() {
        return true;
    }
    let Some(event_type) = renderer_event_type(&event.kind) else {
        return false;
    };

    for path in event.paths {
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        if relative.as_os_str().is_empty() || should_ignore(relative) {
            continue;
        }
        let Some(filename) = relative.to_str().map(str::to_owned) else {
            continue;
        };
        if pending.len() >= WATCH_BATCH_PATH_CAPACITY && !pending.contains_key(&filename) {
            return true;
        }
        pending.insert(
            filename.clone(),
            DirectoryChangeEvent {
                event_type,
                filename,
                index_delta: None,
                index_invalidated: false,
            },
        );
    }
    false
}

fn index_invalidation_event() -> DirectoryChangeEvent {
    DirectoryChangeEvent {
        event_type: DirectoryChangeType::Rename,
        filename: String::new(),
        index_delta: None,
        index_invalidated: true,
    }
}

fn renderer_event_type(kind: &EventKind) -> Option<DirectoryChangeType> {
    match kind {
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) => {
            Some(DirectoryChangeType::Rename)
        }
        EventKind::Modify(_) | EventKind::Any | EventKind::Other => {
            Some(DirectoryChangeType::Change)
        }
        EventKind::Access(_) => None,
    }
}

fn should_ignore(path: &Path) -> bool {
    path.components().any(|component| {
        let Component::Normal(name) = component else {
            return false;
        };
        EXCLUDED_DIRECTORIES
            .iter()
            .any(|excluded| name == *excluded)
    })
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::Path};

    use notify::{
        event::{AccessKind, CreateKind, DataChange, ModifyKind, RemoveKind},
        Error, EventKind,
    };

    use crate::models::DirectoryChangeType;

    use crate::state::AppState;

    use super::{
        collect_event, ensure_project_activation, index_invalidation_event, renderer_event_type,
        should_ignore,
    };

    #[test]
    fn maps_native_events_to_the_existing_renderer_contract() {
        assert_eq!(
            renderer_event_type(&EventKind::Create(CreateKind::File)),
            Some(DirectoryChangeType::Rename)
        );
        assert_eq!(
            renderer_event_type(&EventKind::Remove(RemoveKind::File)),
            Some(DirectoryChangeType::Rename)
        );
        assert_eq!(
            renderer_event_type(&EventKind::Modify(ModifyKind::Data(DataChange::Content))),
            Some(DirectoryChangeType::Change)
        );
        assert_eq!(
            renderer_event_type(&EventKind::Access(AccessKind::Read)),
            None
        );
    }

    #[test]
    fn ignores_noisy_directories_by_path_component() {
        assert!(should_ignore(Path::new(".git/index")));
        assert!(should_ignore(Path::new("chapters/node_modules/cache")));
        assert!(!should_ignore(Path::new("chapters/node_modules-notes.tex")));
        assert!(!should_ignore(Path::new("main.tex")));
    }

    #[test]
    fn rejects_a_watcher_after_the_project_epoch_changes() {
        let state = AppState::default();
        let first_root = Path::new("/project-a").to_path_buf();
        state
            .set_project_root(first_root.clone())
            .expect("activate first project");
        let (_, first_epoch, _) = state.project_root_epoch().expect("first activation");
        assert!(ensure_project_activation(&state, &first_root, first_epoch).is_ok());

        state
            .set_project_root(Path::new("/project-b").to_path_buf())
            .expect("activate second project");
        assert!(ensure_project_activation(&state, &first_root, first_epoch).is_err());
    }

    #[test]
    fn watcher_overflow_requests_an_authoritative_index_reload() {
        let event = index_invalidation_event();
        assert_eq!(event.event_type, DirectoryChangeType::Rename);
        assert!(event.filename.is_empty());
        assert!(event.index_delta.is_none());
        assert!(event.index_invalidated);
    }

    #[test]
    fn watcher_backend_errors_request_an_authoritative_rescan() {
        assert!(collect_event(
            Path::new("/project"),
            Err(Error::generic("watch queue overflow")),
            &mut HashMap::new(),
        ));
    }
}
