use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Component, Path, PathBuf},
    sync::{Arc, RwLock},
    time::UNIX_EPOCH,
};

use tokio::{fs, sync::Mutex};

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
}

struct ProjectIndex {
    root: PathBuf,
    generation: u64,
    entries: HashMap<String, ProjectIndexEntry>,
}

impl ProjectIndexState {
    pub async fn snapshot(&self, project_state: &AppState) -> AppResult<ProjectIndexSnapshot> {
        let root = project_state.project_root()?;
        if let Some(snapshot) = self.snapshot_if_current(&root)? {
            return Ok(snapshot);
        }

        let _guard = self.inner.build_lock.lock().await;
        if let Some(snapshot) = self.snapshot_if_current(&root)? {
            return Ok(snapshot);
        }

        let scanned = scan_tree(&root, &root).await?;
        let current_root = project_state.project_root()?;
        if !filesystem::paths_equal(&root, &current_root) {
            return Err(AppError::ProjectIndex(
                "active project changed while the index was being built".to_owned(),
            ));
        }
        let entries = scanned
            .into_iter()
            .map(|entry| (entry_key(&entry.relative_path), entry))
            .collect();
        let index = ProjectIndex {
            root: root.clone(),
            generation: 1,
            entries,
        };
        let snapshot = snapshot_from_index(&index)?;
        *self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)? = Some(index);
        Ok(snapshot)
    }

    pub async fn apply_change(
        &self,
        root: &Path,
        event: &DirectoryChangeEvent,
    ) -> AppResult<Option<ProjectIndexDelta>> {
        // A watcher event arriving during the initial scan waits here. Once
        // the snapshot is installed, the event is applied instead of being
        // lost between scan and publication.
        let _guard = self.inner.build_lock.lock().await;
        if !self.is_active_for(root)? {
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
        let mut active = self
            .inner
            .active
            .write()
            .map_err(|_| AppError::StatePoisoned)?;
        let Some(index) = active.as_mut() else {
            return Ok(None);
        };
        if !filesystem::paths_equal(&index.root, root) {
            return Ok(None);
        }

        let descendant_prefix = format!("{relative_key}/");
        let upserted_keys = upserted
            .iter()
            .map(|entry| entry_key(&entry.relative_path))
            .collect::<HashSet<_>>();
        let mut removed_paths = Vec::new();
        index.entries.retain(|key, entry| {
            let remove = key == &relative_key
                || (event.event_type == DirectoryChangeType::Rename
                    && key.starts_with(&descendant_prefix));
            if remove && !upserted_keys.contains(key) {
                removed_paths.push(entry.relative_path.clone());
            }
            !remove
        });

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
        Ok(Some(ProjectIndexDelta {
            generation: index.generation,
            upserted,
            removed_paths,
        }))
    }

    fn snapshot_if_current(&self, root: &Path) -> AppResult<Option<ProjectIndexSnapshot>> {
        let active = self
            .inner
            .active
            .read()
            .map_err(|_| AppError::StatePoisoned)?;
        active
            .as_ref()
            .filter(|index| filesystem::paths_equal(&index.root, root))
            .map(snapshot_from_index)
            .transpose()
    }

    fn is_active_for(&self, root: &Path) -> AppResult<bool> {
        Ok(self
            .inner
            .active
            .read()
            .map_err(|_| AppError::StatePoisoned)?
            .as_ref()
            .is_some_and(|index| filesystem::paths_equal(&index.root, root)))
    }
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

    use super::ProjectIndexState;

    fn event(event_type: DirectoryChangeType, filename: &str) -> DirectoryChangeEvent {
        DirectoryChangeEvent {
            event_type,
            filename: filename.to_owned(),
            index_delta: None,
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
        let index = ProjectIndexState::default();

        assert!(index
            .apply_change(&root, &event(DirectoryChangeType::Change, "main.tex"))
            .await
            .expect("inactive update")
            .is_none());
        index.snapshot(&app_state).await.expect("activate index");

        fs::create_dir(project.path().join("chapters")).expect("chapters directory");
        fs::write(project.path().join("chapters/intro.tex"), "intro").expect("intro file");
        let created = index
            .apply_change(&root, &event(DirectoryChangeType::Rename, "chapters"))
            .await
            .expect("create delta")
            .expect("active create delta");
        assert_eq!(created.generation, 2);
        assert_eq!(created.upserted.len(), 2);

        fs::write(project.path().join("main.tex"), "updated").expect("update main");
        let changed = index
            .apply_change(&root, &event(DirectoryChangeType::Change, "main.tex"))
            .await
            .expect("change delta")
            .expect("active change delta");
        assert_eq!(changed.generation, 3);
        assert_eq!(changed.upserted[0].size, Some(7));

        fs::remove_dir_all(project.path().join("chapters")).expect("remove chapters");
        let removed = index
            .apply_change(&root, &event(DirectoryChangeType::Rename, "chapters"))
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
}
