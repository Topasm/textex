use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::{fs, sync::Mutex};

use crate::{
    error::{AppError, AppResult},
    models::{RecentProject, RecentProjectUpdates, UserSettings},
    state::AppState,
};

use super::filesystem;

const SETTINGS_FILE_NAME: &str = "settings.json";
const MAX_RECENT_PROJECTS: usize = 10;
const MAX_RENDERER_SESSION_ENTRY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Default)]
pub struct SettingsState {
    operation_lock: Mutex<()>,
}

pub fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SETTINGS_FILE_NAME))
        .map_err(|error| AppError::RuntimePath(error.to_string()))
}

pub fn legacy_settings_paths(settings_path: &Path) -> Vec<PathBuf> {
    let Some(config_root) = settings_path.parent().and_then(Path::parent) else {
        return Vec::new();
    };

    ["TextEx", "textex", "com.textex.app"]
        .into_iter()
        .map(|directory| config_root.join(directory).join(SETTINGS_FILE_NAME))
        .filter(|candidate| candidate != settings_path)
        .collect()
}

pub async fn load_settings_with_legacy_import(
    state: &SettingsState,
    path: &Path,
    legacy_paths: &[PathBuf],
) -> AppResult<UserSettings> {
    let _guard = state.operation_lock.lock().await;
    if fs::try_exists(path).await.map_err(|source| {
        AppError::io(
            "inspect settings",
            path.to_string_lossy().into_owned(),
            source,
        )
    })? {
        return load_settings(path).await;
    }

    for legacy_path in legacy_paths {
        let Ok(bytes) = fs::read(legacy_path).await else {
            continue;
        };
        let Ok(mut settings) = serde_json::from_slice::<UserSettings>(&bytes) else {
            continue;
        };
        if validate_renderer_session(&settings).is_err() {
            settings.renderer_session = None;
        }

        write_settings(path, &settings).await?;
        return Ok(settings);
    }

    Ok(UserSettings::default())
}

pub async fn load_settings(path: &Path) -> AppResult<UserSettings> {
    match fs::read(path).await {
        // Match the existing application behavior: a truncated or legacy
        // settings file must not prevent the editor from starting.
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(UserSettings::default()),
        Err(source) => Err(AppError::io(
            "read settings",
            path.to_string_lossy().into_owned(),
            source,
        )),
    }
}

pub async fn save_settings(
    state: &SettingsState,
    path: &Path,
    partial: Value,
) -> AppResult<UserSettings> {
    let _guard = state.operation_lock.lock().await;
    let mut current = serde_json::to_value(load_settings_or_default(path).await?)
        .map_err(|error| AppError::Settings(error.to_string()))?;
    let partial = partial
        .as_object()
        .ok_or_else(|| AppError::Settings("settings update must be an object".to_owned()))?;
    let current = current
        .as_object_mut()
        .ok_or_else(|| AppError::Settings("default settings must be an object".to_owned()))?;

    for (key, value) in partial {
        // Recent projects are a native authorization list. They can only be
        // changed through the dedicated validated commands below.
        if key != "recentProjects" && key != "minimap" {
            current.insert(key.clone(), value.clone());
        }
    }

    let next: UserSettings = serde_json::from_value(Value::Object(current.clone()))
        .map_err(|error| AppError::Settings(format!("invalid settings update: {error}")))?;
    validate_renderer_session(&next)?;
    write_settings(path, &next).await?;
    Ok(next)
}

pub async fn add_recent_project(
    settings_state: &SettingsState,
    project_state: &AppState,
    path: &Path,
    project_path: &str,
) -> AppResult<UserSettings> {
    let _guard = settings_state.operation_lock.lock().await;
    let canonical = filesystem::canonical_project_directory(project_path).await?;
    let active_root = project_state.project_root()?;
    if !filesystem::paths_equal(&canonical, &active_root) {
        return Err(AppError::RecentProjectUnauthorized(project_path.to_owned()));
    }

    let canonical_string = filesystem::path_to_string(&canonical)?;
    let mut settings = load_settings_or_default(path).await?;
    let previous = settings
        .recent_projects
        .iter()
        .find(|project| same_stored_path(&project.path, &canonical))
        .cloned();
    settings
        .recent_projects
        .retain(|project| !same_stored_path(&project.path, &canonical));
    settings.recent_projects.insert(
        0,
        RecentProject {
            name: project_name(&canonical)?,
            path: canonical_string,
            last_opened: now_rfc3339()?,
            title: previous.as_ref().and_then(|project| project.title.clone()),
            tag: previous.as_ref().and_then(|project| project.tag.clone()),
            pinned: previous.and_then(|project| project.pinned),
        },
    );
    settings.recent_projects.truncate(MAX_RECENT_PROJECTS);
    write_settings(path, &settings).await?;
    Ok(settings)
}

pub async fn remove_recent_project(
    settings_state: &SettingsState,
    path: &Path,
    project_path: &str,
) -> AppResult<UserSettings> {
    let _guard = settings_state.operation_lock.lock().await;
    let mut settings = load_settings_or_default(path).await?;
    settings
        .recent_projects
        .retain(|project| !stored_paths_equal(&project.path, project_path));
    write_settings(path, &settings).await?;
    Ok(settings)
}

pub async fn update_recent_project(
    settings_state: &SettingsState,
    project_state: &AppState,
    path: &Path,
    project_path: &str,
    updates: RecentProjectUpdates,
) -> AppResult<UserSettings> {
    let _guard = settings_state.operation_lock.lock().await;
    let mut settings = load_settings_or_default(path).await?;
    let source_index = settings
        .recent_projects
        .iter()
        .position(|project| stored_paths_equal(&project.path, project_path))
        .ok_or_else(|| AppError::Settings("Recent project not found".to_owned()))?;

    if let Some(next_path) = updates.path {
        let canonical = filesystem::canonical_project_directory(&next_path).await?;
        let is_active = project_state
            .project_root()
            .is_ok_and(|active_root| filesystem::paths_equal(&canonical, &active_root));
        let already_trusted = settings
            .recent_projects
            .iter()
            .any(|project| same_stored_path(&project.path, &canonical));
        let selected_by_user = if already_trusted || is_active {
            false
        } else {
            project_state.consume_project_selection(&canonical)?
        };
        if !already_trusted && !is_active && !selected_by_user {
            return Err(AppError::RecentProjectUnauthorized(next_path));
        }

        let canonical_string = filesystem::path_to_string(&canonical)?;
        let duplicate_index = settings
            .recent_projects
            .iter()
            .enumerate()
            .find(|(index, project)| {
                *index != source_index && same_stored_path(&project.path, &canonical)
            })
            .map(|(index, _)| index);
        let duplicate = duplicate_index.map(|index| settings.recent_projects[index].clone());
        let source = settings.recent_projects[source_index].clone();
        let insert_index = duplicate_index
            .map(|index| index.min(source_index))
            .unwrap_or(source_index);
        let mut replacement = RecentProject {
            path: canonical_string,
            name: project_name(&canonical)?,
            last_opened: duplicate
                .as_ref()
                .map(|target| more_recent(&source.last_opened, &target.last_opened))
                .unwrap_or(source.last_opened),
            title: duplicate
                .as_ref()
                .and_then(|target| target.title.clone())
                .or(source.title),
            tag: updates
                .tag
                .or(source.tag)
                .or_else(|| duplicate.as_ref().and_then(|target| target.tag.clone())),
            pinned: updates.pinned.or(Some(
                source.pinned.unwrap_or(false)
                    || duplicate
                        .as_ref()
                        .and_then(|target| target.pinned)
                        .unwrap_or(false),
            )),
        };
        if replacement.pinned == Some(false) {
            replacement.pinned = None;
        }

        settings.recent_projects = settings
            .recent_projects
            .into_iter()
            .enumerate()
            .filter_map(|(index, project)| {
                (index != source_index && Some(index) != duplicate_index).then_some(project)
            })
            .collect();
        settings.recent_projects.insert(insert_index, replacement);
    } else {
        let project = &mut settings.recent_projects[source_index];
        if let Some(tag) = updates.tag {
            project.tag = (!tag.is_empty()).then_some(tag);
        }
        if let Some(pinned) = updates.pinned {
            project.pinned = pinned.then_some(true);
        }
    }

    write_settings(path, &settings).await?;
    Ok(settings)
}

pub async fn authorize_project_activation(
    settings_state: &SettingsState,
    project_state: &AppState,
    path: &Path,
    project_path: &str,
) -> AppResult<PathBuf> {
    let canonical = filesystem::canonical_project_directory(project_path).await?;
    if project_state
        .project_root()
        .is_ok_and(|root| filesystem::paths_equal(&root, &canonical))
    {
        return Ok(canonical);
    }
    if project_state.consume_project_selection(&canonical)? {
        return Ok(canonical);
    }

    let _guard = settings_state.operation_lock.lock().await;
    let settings = load_settings_or_default(path).await?;
    if !settings
        .recent_projects
        .iter()
        .any(|project| same_stored_path(&project.path, &canonical))
    {
        return Err(AppError::RecentProjectUnauthorized(project_path.to_owned()));
    }
    Ok(canonical)
}

async fn load_settings_or_default(path: &Path) -> AppResult<UserSettings> {
    load_settings(path).await
}

async fn write_settings(path: &Path, settings: &UserSettings) -> AppResult<()> {
    let parent = path.parent().ok_or_else(|| {
        AppError::Settings(format!(
            "settings path has no parent: {}",
            path.to_string_lossy()
        ))
    })?;
    fs::create_dir_all(parent).await.map_err(|source| {
        AppError::io(
            "create settings directory",
            parent.to_string_lossy().into_owned(),
            source,
        )
    })?;
    let bytes = serde_json::to_vec_pretty(settings)
        .map_err(|error| AppError::Settings(error.to_string()))?;
    filesystem::write_files_transactionally(vec![(path.to_path_buf(), bytes)]).await
}

fn validate_renderer_session(settings: &UserSettings) -> AppResult<()> {
    let Some(session) = &settings.renderer_session else {
        return Ok(());
    };
    if session.version != 1 {
        return Err(AppError::Settings(
            "unsupported renderer session version".to_owned(),
        ));
    }

    for entry in [&session.editor, &session.project, &session.pdf]
        .into_iter()
        .flatten()
    {
        if entry.len() > MAX_RENDERER_SESSION_ENTRY_BYTES
            || !serde_json::from_str::<Value>(entry).is_ok_and(|value| value.is_object())
        {
            return Err(AppError::Settings(
                "invalid renderer session entry".to_owned(),
            ));
        }
    }
    Ok(())
}

fn project_name(path: &Path) -> AppResult<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))
}

fn now_rfc3339() -> AppResult<String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| AppError::Settings(error.to_string()))
}

fn same_stored_path(stored: &str, canonical: &Path) -> bool {
    filesystem::paths_equal(Path::new(stored), canonical)
}

fn stored_paths_equal(left: &str, right: &str) -> bool {
    filesystem::paths_equal(Path::new(left), Path::new(right))
}

fn more_recent(left: &str, right: &str) -> String {
    let left_time = OffsetDateTime::parse(left, &Rfc3339).ok();
    let right_time = OffsetDateTime::parse(right, &Rfc3339).ok();
    if left_time >= right_time {
        left.to_owned()
    } else {
        right.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;
    use tempfile::tempdir;

    use super::{
        add_recent_project, authorize_project_activation, load_settings,
        load_settings_with_legacy_import, save_settings, SettingsState,
    };
    use crate::state::AppState;

    #[test]
    fn saves_typed_settings_without_accepting_recent_project_injection() {
        tauri::async_runtime::block_on(async {
            let directory = tempdir().expect("temp directory");
            let settings_path = directory.path().join("config/settings.json");
            let state = SettingsState::default();

            let settings = save_settings(
                &state,
                &settings_path,
                json!({
                    "theme": "dark",
                    "fontSize": 18,
                    "recentProjects": [{
                        "path": "/untrusted",
                        "name": "untrusted",
                        "lastOpened": "2026-01-01T00:00:00Z"
                    }]
                }),
            )
            .await
            .expect("save settings");

            assert_eq!(serde_json::to_value(settings.theme).unwrap(), json!("dark"));
            assert_eq!(settings.font_size, 18);
            assert!(settings.recent_projects.is_empty());
            assert!(settings_path.is_file());
        });
    }

    #[test]
    fn imports_legacy_settings_only_when_the_tauri_file_is_absent() {
        tauri::async_runtime::block_on(async {
            let directory = tempdir().expect("temp directory");
            let settings_path = directory.path().join("tauri/settings.json");
            let legacy_path = directory.path().join("TextEx/settings.json");
            fs::create_dir_all(legacy_path.parent().unwrap()).expect("create legacy directory");
            fs::write(
                &legacy_path,
                serde_json::to_vec_pretty(&json!({
                    "theme": "dark",
                    "fontSize": 19,
                    "recentProjects": [{
                        "path": "/projects/paper",
                        "name": "paper",
                        "lastOpened": "2026-08-23T00:00:00Z"
                    }]
                }))
                .unwrap(),
            )
            .expect("write legacy settings");

            let state = SettingsState::default();
            let imported = load_settings_with_legacy_import(
                &state,
                &settings_path,
                std::slice::from_ref(&legacy_path),
            )
            .await
            .expect("import settings");
            assert_eq!(imported.font_size, 19);
            assert_eq!(imported.recent_projects.len(), 1);
            assert!(imported.bracket_pair_colorization);

            fs::write(
                &legacy_path,
                serde_json::to_vec_pretty(&json!({ "fontSize": 22 })).unwrap(),
            )
            .expect("replace legacy settings");
            let preserved = load_settings_with_legacy_import(
                &state,
                &settings_path,
                std::slice::from_ref(&legacy_path),
            )
            .await
            .expect("preserve settings");
            assert_eq!(preserved.font_size, 19);
        });
    }

    #[test]
    fn rejects_invalid_renderer_session_payloads() {
        tauri::async_runtime::block_on(async {
            let directory = tempdir().expect("temp directory");
            let settings_path = directory.path().join("config/settings.json");
            let state = SettingsState::default();

            let result = save_settings(
                &state,
                &settings_path,
                json!({
                    "rendererSession": {
                        "version": 2,
                        "editor": "{\"state\":{}}"
                    }
                }),
            )
            .await;

            assert!(result.is_err());
            assert!(!settings_path.exists());
        });
    }

    #[test]
    fn only_native_authorized_projects_can_be_restored() {
        tauri::async_runtime::block_on(async {
            let directory = tempdir().expect("temp directory");
            let project = directory.path().join("paper");
            let other = directory.path().join("other");
            fs::create_dir_all(&project).expect("create project");
            fs::create_dir_all(&other).expect("create other project");
            let settings_path = directory.path().join("config/settings.json");
            let settings_state = SettingsState::default();
            let first_app_state = AppState::default();
            first_app_state
                .set_project_root(dunce::canonicalize(&project).expect("canonical project"))
                .expect("set root");

            add_recent_project(
                &settings_state,
                &first_app_state,
                &settings_path,
                project.to_str().unwrap(),
            )
            .await
            .expect("add recent project");

            let restored_app_state = AppState::default();
            let restored = authorize_project_activation(
                &settings_state,
                &restored_app_state,
                &settings_path,
                project.to_str().unwrap(),
            )
            .await
            .expect("restore trusted project");
            assert_eq!(restored, dunce::canonicalize(&project).unwrap());

            assert!(authorize_project_activation(
                &settings_state,
                &AppState::default(),
                &settings_path,
                other.to_str().unwrap(),
            )
            .await
            .is_err());

            let loaded = load_settings(&settings_path).await.expect("load settings");
            assert_eq!(loaded.recent_projects.len(), 1);
        });
    }
}
