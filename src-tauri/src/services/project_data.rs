use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::CitationGroup,
    services::filesystem,
    state::AppState,
};

const MAX_JSON_BYTES: u64 = 4 * 1024 * 1024;
const MAX_SHORT_TEXT_BYTES: usize = 16 * 1024;
const MAX_CITATION_GROUPS: usize = 1_000;
const MAX_CITATION_KEYS: usize = 100_000;

#[derive(Default)]
pub struct ProjectDataState {
    operation_lock: Mutex<()>,
}

#[derive(Default, Deserialize, Serialize)]
struct CitationData {
    groups: Vec<CitationGroup>,
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

async fn metadata_path(state: &AppState, root: &Path, name: &str) -> AppResult<PathBuf> {
    let directory =
        filesystem::validate_project_directory_target(state, root.join(".textex")).await?;
    Ok(directory.join(name))
}

async fn metadata_write_path(state: &AppState, root: &Path, name: &str) -> AppResult<PathBuf> {
    let directory =
        filesystem::validate_project_directory_target(state, root.join(".textex")).await?;
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|source| {
            AppError::io(
                "create project metadata directory",
                display(&directory),
                source,
            )
        })?;
    let directory = filesystem::validate_project_directory_target(state, directory).await?;
    let path = directory.join(name);
    filesystem::validate_save_file_target(state, path_to_str(&path)?).await
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
    let bytes = read_bounded_file(&path, MAX_JSON_BYTES).await?;
    match serde_json::from_slice(&bytes) {
        Ok(value) => Ok(value),
        Err(_) => fallback(),
    }
}

async fn write_json<T: Serialize>(state: &AppState, path: PathBuf, value: &T) -> AppResult<()> {
    let path = filesystem::validate_save_file_target(state, path_to_str(&path)?).await?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::ProjectData(error.to_string()))?;
    if bytes.len() as u64 > MAX_JSON_BYTES {
        return Err(AppError::ProjectData(
            "project metadata exceeds 4 MiB".to_owned(),
        ));
    }
    filesystem::write_files_transactionally(vec![(path, bytes)]).await
}

async fn read_bounded_file(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    let metadata = tokio::fs::symlink_metadata(path)
        .await
        .map_err(|source| AppError::io("inspect citation data", display(path), source))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > limit {
        return Err(AppError::ProjectData(
            "citation data is not a bounded regular file".to_owned(),
        ));
    }
    tokio::fs::read(path)
        .await
        .map_err(|source| AppError::io("read citation data", display(path), source))
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
    async fn rejects_a_different_project_root() {
        let project = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let state = state_for(project.path());
        let service = ProjectDataState::default();
        let error =
            save_citation_groups(&state, &service, other.path().to_str().unwrap(), Vec::new())
                .await
                .unwrap_err();
        assert!(matches!(error, AppError::OutsideProject(_)));
    }
}
