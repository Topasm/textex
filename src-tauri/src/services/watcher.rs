use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::Duration,
};

use notify::{event::ModifyKind, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{async_runtime::JoinHandle, ipc::Channel};
use tokio::{sync::mpsc, time::sleep};

use crate::{
    error::{AppError, AppResult},
    models::DirectoryChangeEvent,
    services::filesystem,
    state::AppState,
};

const WATCH_BATCH_WINDOW: Duration = Duration::from_millis(100);
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
    fn replace(&self, watcher: ActiveDirectoryWatcher) -> AppResult<()> {
        *self.lock()? = Some(watcher);
        Ok(())
    }

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
    dir_path: &str,
    on_event: Channel<DirectoryChangeEvent>,
) -> AppResult<()> {
    let root = filesystem::resolve_project_directory(project_state, dir_path).await?;
    let worker_root = root.clone();
    let (sender, receiver) = mpsc::unbounded_channel();
    let worker = tauri::async_runtime::spawn(forward_events(receiver, worker_root, on_event));
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
        let _ = sender.send(event);
    })
    .map_err(|error| AppError::Watcher(error.to_string()))?;

    if let Err(error) = watcher.watch(&root, RecursiveMode::Recursive) {
        worker.abort();
        return Err(AppError::Watcher(error.to_string()));
    }

    watcher_state.replace(ActiveDirectoryWatcher {
        _watcher: watcher,
        worker,
    })
}

async fn forward_events(
    mut receiver: mpsc::UnboundedReceiver<notify::Result<Event>>,
    root: PathBuf,
    on_event: Channel<DirectoryChangeEvent>,
) {
    while let Some(first) = receiver.recv().await {
        let mut pending = HashMap::new();
        collect_event(&root, first, &mut pending);
        let batch_window = sleep(WATCH_BATCH_WINDOW);
        tokio::pin!(batch_window);

        loop {
            tokio::select! {
                event = receiver.recv() => {
                    let Some(event) = event else {
                        break;
                    };
                    collect_event(&root, event, &mut pending);
                }
                _ = &mut batch_window => break,
            }
        }

        for event in pending.into_values() {
            // A closed renderer channel must not keep or crash the watcher.
            let _ = on_event.send(event);
        }
    }
}

fn collect_event(
    root: &Path,
    event: notify::Result<Event>,
    pending: &mut HashMap<String, DirectoryChangeEvent>,
) {
    let Ok(event) = event else {
        return;
    };
    let Some(event_type) = renderer_event_type(&event.kind) else {
        return;
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
        pending.insert(
            filename.clone(),
            DirectoryChangeEvent {
                event_type: event_type.to_owned(),
                filename,
            },
        );
    }
}

fn renderer_event_type(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) => {
            Some("rename")
        }
        EventKind::Modify(_) | EventKind::Any | EventKind::Other => Some("change"),
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
    use std::path::Path;

    use notify::{
        event::{AccessKind, CreateKind, DataChange, ModifyKind, RemoveKind},
        EventKind,
    };

    use super::{renderer_event_type, should_ignore};

    #[test]
    fn maps_native_events_to_the_existing_renderer_contract() {
        assert_eq!(
            renderer_event_type(&EventKind::Create(CreateKind::File)),
            Some("rename")
        );
        assert_eq!(
            renderer_event_type(&EventKind::Remove(RemoveKind::File)),
            Some("rename")
        );
        assert_eq!(
            renderer_event_type(&EventKind::Modify(ModifyKind::Data(DataChange::Content))),
            Some("change")
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
}
