use std::{
    collections::{HashMap, VecDeque},
    ffi::{OsStr, OsString},
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Output, Stdio},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, RwLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::Url;
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
    sync::Mutex,
    time::timeout,
};

use crate::{
    error::{AppError, AppResult},
    models::{
        ResearchChatAccess, ResearchProfile, ResearchResource, ResearchResourceKind,
        ResearchSourceFile, ResearchSourceGitAction, ResearchSourceGitResult, ResearchSourceIndex,
        ResearchSourceSearchResult,
    },
    services::{filesystem, research_profile},
    state::AppState,
};

const MAX_FILES: usize = 2_000;
const MAX_VISITED_ENTRIES: usize = 100_000;
const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 20 * 1024 * 1024;
const MAX_CACHED_INDEXES: usize = 4;
const MAX_RESOURCE_ID_BYTES: usize = 128;
const MAX_QUERY_BYTES: usize = 256;
const MAX_SEARCH_RESULTS: usize = 50;
const DEFAULT_SEARCH_RESULTS: usize = 20;
const MAX_SNIPPET_CHARS: usize = 1_200;
const MAX_GIT_OUTPUT_BYTES: usize = 1024 * 1024;
const GIT_CLONE_TIMEOUT: Duration = Duration::from_secs(180);
const GIT_FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const GIT_REAP_TIMEOUT: Duration = Duration::from_secs(5);
const GIT_OUTPUT_CHUNK_BYTES: usize = 8 * 1024;
const GIT_ISOLATION_ATTEMPTS: usize = 16;

const GIT_ISOLATION_CONFIG: &[&str] = &[
    "credential.helper=",
    "credential.interactive=false",
    "core.askPass=",
    "core.sshCommand=ssh",
    "core.fsmonitor=false",
    "gc.auto=0",
    "maintenance.auto=false",
];

static NEXT_GIT_ISOLATION_ID: AtomicUsize = AtomicUsize::new(0);

const EXCLUDED_DIRECTORIES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".textex",
    ".idea",
    ".vscode",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "vendor",
];

struct GitCommandIsolation {
    root: PathBuf,
    hooks: PathBuf,
    global_config: PathBuf,
}

impl GitCommandIsolation {
    fn create() -> io::Result<Self> {
        let temporary_root = std::env::temp_dir();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let mut last_error = None;

        for _ in 0..GIT_ISOLATION_ATTEMPTS {
            let sequence = NEXT_GIT_ISOLATION_ID.fetch_add(1, Ordering::Relaxed);
            let root = temporary_root.join(format!(
                "textex-research-git-{}-{timestamp}-{sequence}",
                std::process::id()
            ));
            match create_private_directory(&root) {
                Ok(()) => {
                    let hooks = root.join("hooks");
                    let global_config = root.join("global.gitconfig");
                    if let Err(error) = fs::create_dir(&hooks).and_then(|()| {
                        fs::OpenOptions::new()
                            .write(true)
                            .create_new(true)
                            .open(&global_config)
                            .map(drop)
                    }) {
                        let _ = fs::remove_dir(&hooks);
                        let _ = fs::remove_dir(&root);
                        return Err(error);
                    }
                    return Ok(Self {
                        root,
                        hooks,
                        global_config,
                    });
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    last_error = Some(error);
                }
                Err(error) => return Err(error),
            }
        }

        Err(last_error.unwrap_or_else(|| {
            io::Error::new(
                io::ErrorKind::AlreadyExists,
                "could not allocate an isolated Git configuration directory",
            )
        }))
    }
}

impl Drop for GitCommandIsolation {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.global_config);
        let _ = fs::remove_dir(&self.hooks);
        let _ = fs::remove_dir(&self.root);
    }
}

#[cfg(unix)]
fn create_private_directory(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;

    let mut builder = fs::DirBuilder::new();
    builder.mode(0o700).create(path)
}

#[cfg(not(unix))]
fn create_private_directory(path: &Path) -> io::Result<()> {
    fs::create_dir(path)
}

#[derive(Clone, Default)]
pub struct ResearchSourceState {
    indexes: Arc<RwLock<HashMap<String, CachedSourceIndex>>>,
    git_lock: Arc<Mutex<()>>,
}

struct CachedSourceIndex {
    project_root: PathBuf,
    project_epoch: u64,
    source_root: PathBuf,
    contents: Arc<Vec<IndexedSourceContent>>,
}

struct IndexedSourceContent {
    path: String,
    content: String,
}

struct BuiltSourceIndex {
    index: ResearchSourceIndex,
    contents: Vec<IndexedSourceContent>,
}

impl ResearchSourceState {
    pub async fn index(
        &self,
        project_state: &AppState,
        resource_id: &str,
        local_path: &str,
    ) -> AppResult<ResearchSourceIndex> {
        validate_resource_id(resource_id)?;
        let project_guard = project_state.lock_project_operation().await;
        let (project_root, project_epoch, _) = project_state.project_root_epoch()?;
        let profile = research_profile::load_unlocked(project_state).await?;
        let root =
            configured_source_root(&project_root, &profile, resource_id, Some(local_path)).await?;
        drop(project_guard);

        let resource_id = resource_id.to_owned();
        let build_resource_id = resource_id.clone();
        let build_root = root.clone();
        let built = tauri::async_runtime::spawn_blocking(move || {
            build_source_index(build_resource_id, build_root)
        })
        .await
        .map_err(|error| AppError::Worker(error.to_string()))??;

        let _project_guard = project_state.lock_project_operation().await;
        let (active_root, active_epoch, _) = project_state.project_root_epoch()?;
        if active_epoch != project_epoch || !filesystem::paths_equal(&active_root, &project_root) {
            return Err(AppError::ResearchSource(
                "the active project changed while source indexing was in progress".to_owned(),
            ));
        }
        let profile = research_profile::load_unlocked(project_state).await?;
        let active_source_root =
            configured_source_root(&active_root, &profile, &resource_id, Some(local_path)).await?;
        if !filesystem::paths_equal(&active_source_root, &root) {
            return Err(AppError::ResearchSource(
                "the configured research source changed while indexing was in progress".to_owned(),
            ));
        }

        let response = built.index.clone();
        let mut indexes = self.indexes.write().map_err(|_| AppError::StatePoisoned)?;
        indexes.retain(|_, cached| {
            cached.project_epoch == project_epoch
                && filesystem::paths_equal(&cached.project_root, &project_root)
        });
        if !indexes.contains_key(&resource_id) && indexes.len() >= MAX_CACHED_INDEXES {
            if let Some(evicted) = indexes.keys().next().cloned() {
                indexes.remove(&evicted);
            }
        }
        indexes.insert(
            resource_id,
            CachedSourceIndex {
                project_root,
                project_epoch,
                source_root: root,
                contents: Arc::new(built.contents),
            },
        );
        Ok(response)
    }

    pub async fn search(
        &self,
        project_state: &AppState,
        resource_id: &str,
        query: &str,
        limit: Option<usize>,
    ) -> AppResult<Vec<ResearchSourceSearchResult>> {
        validate_resource_id(resource_id)?;
        let query = query.trim();
        if query.is_empty() || query.len() > MAX_QUERY_BYTES || query.contains('\0') {
            return Err(AppError::ResearchSource(
                "source search query must be non-empty, NUL-free, and at most 256 bytes".to_owned(),
            ));
        }
        let limit = limit
            .unwrap_or(DEFAULT_SEARCH_RESULTS)
            .clamp(1, MAX_SEARCH_RESULTS);
        let project_guard = project_state.lock_project_operation().await;
        let (project_root, project_epoch, _) = project_state.project_root_epoch()?;
        let profile = research_profile::load_unlocked(project_state).await?;
        let source_root =
            configured_source_root(&project_root, &profile, resource_id, None).await?;
        let contents = {
            let indexes = self.indexes.read().map_err(|_| AppError::StatePoisoned)?;
            let cached = indexes.get(resource_id).ok_or_else(|| {
                AppError::ResearchSource(format!(
                    "source resource '{resource_id}' has not been indexed"
                ))
            })?;
            if cached.project_epoch != project_epoch
                || !filesystem::paths_equal(&cached.project_root, &project_root)
                || !filesystem::paths_equal(&cached.source_root, &source_root)
            {
                return Err(AppError::ResearchSource(
                    "the source index belongs to a different project activation or profile"
                        .to_owned(),
                ));
            }
            Arc::clone(&cached.contents)
        };
        drop(project_guard);

        let resource_id_owned = resource_id.to_owned();
        let query_owned = query.to_owned();
        let results = tauri::async_runtime::spawn_blocking(move || {
            search_contents(&resource_id_owned, &contents, &query_owned, limit)
        })
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?;

        let _project_guard = project_state.lock_project_operation().await;
        let (active_root, active_epoch, _) = project_state.project_root_epoch()?;
        if active_epoch != project_epoch || !filesystem::paths_equal(&active_root, &project_root) {
            return Err(AppError::ResearchSource(
                "the active project changed while source search was in progress".to_owned(),
            ));
        }
        let profile = research_profile::load_unlocked(project_state).await?;
        let active_source_root =
            configured_source_root(&active_root, &profile, resource_id, None).await?;
        if !filesystem::paths_equal(&active_source_root, &source_root) {
            return Err(AppError::ResearchSource(
                "the configured research source changed while searching was in progress".to_owned(),
            ));
        }
        Ok(results)
    }

    pub async fn clone_repository(
        &self,
        project_state: &AppState,
        resource_id: &str,
    ) -> AppResult<ResearchSourceGitResult> {
        validate_resource_id(resource_id)?;
        let _git_guard = self.git_lock.lock().await;
        let _project_guard = project_state.lock_project_operation().await;
        let profile = research_profile::load_unlocked(project_state).await?;
        let resource = configured_git_resource(&profile, resource_id)?;
        let remote = configured_remote(resource)?;
        let local_path = resource.local_path.as_deref().ok_or_else(|| {
            AppError::ResearchSource(format!(
                "git resource '{resource_id}' does not define a local path"
            ))
        })?;
        let destination = new_clone_destination(project_state, local_path).await?;
        let parent = destination.parent().ok_or_else(|| {
            AppError::InvalidPath(format!(
                "clone destination has no parent: {}",
                destination.to_string_lossy()
            ))
        })?;
        tokio::fs::create_dir_all(parent).await.map_err(|source| {
            AppError::io(
                "create clone parent directory",
                parent.to_string_lossy().into_owned(),
                source,
            )
        })?;
        // Re-resolve after creating ancestors so a raced symlink cannot redirect
        // the destination outside the active project.
        let destination = new_clone_destination(project_state, local_path).await?;
        let parent = destination.parent().ok_or_else(|| {
            AppError::InvalidPath(format!(
                "clone destination has no parent: {}",
                destination.to_string_lossy()
            ))
        })?;
        let destination_name = destination.file_name().ok_or_else(|| {
            AppError::InvalidPath(format!(
                "clone destination has no final component: {}",
                destination.to_string_lossy()
            ))
        })?;

        let mut args = vec![
            OsString::from("-c"),
            OsString::from("submodule.recurse=false"),
            OsString::from("-c"),
            OsString::from("protocol.allow=never"),
            OsString::from("-c"),
            OsString::from("protocol.https.allow=always"),
            OsString::from("-c"),
            OsString::from("protocol.ssh.allow=always"),
            OsString::from("-c"),
            OsString::from("protocol.file.allow=never"),
            OsString::from("-c"),
            OsString::from("protocol.ext.allow=never"),
            OsString::from("-c"),
            OsString::from("http.followRedirects=false"),
            OsString::from("clone"),
        ];
        if let Some(branch) = resource.branch.as_deref() {
            validate_branch(branch)?;
            args.extend([
                OsString::from("--branch"),
                OsString::from(branch),
                OsString::from("--single-branch"),
            ]);
        }
        args.extend([
            OsString::from("--"),
            OsString::from(remote),
            destination_name.to_os_string(),
        ]);
        let output = run_research_git(parent, args, "clone research source").await?;
        let canonical_destination = dunce::canonicalize(&destination).map_err(|source| {
            AppError::io(
                "resolve cloned research source",
                destination.to_string_lossy().into_owned(),
                source,
            )
        })?;
        ensure_existing_git_directory(project_state, &canonical_destination).await?;
        self.invalidate(resource_id)?;

        Ok(ResearchSourceGitResult {
            success: true,
            resource_id: resource_id.to_owned(),
            local_path: path_string(&canonical_destination)?,
            action: ResearchSourceGitAction::Cloned,
            output: git_output_text(&output),
        })
    }

    pub async fn fetch_repository(
        &self,
        project_state: &AppState,
        resource_id: &str,
    ) -> AppResult<ResearchSourceGitResult> {
        validate_resource_id(resource_id)?;
        let _git_guard = self.git_lock.lock().await;
        let _project_guard = project_state.lock_project_operation().await;
        let profile = research_profile::load_unlocked(project_state).await?;
        let resource = configured_git_resource(&profile, resource_id)?;
        let remote = configured_remote(resource)?;
        let local_path = resource.local_path.as_deref().ok_or_else(|| {
            AppError::ResearchSource(format!(
                "git resource '{resource_id}' does not define a local path"
            ))
        })?;
        let repository = existing_fetch_repository(project_state, local_path).await?;
        let args = vec![
            OsString::from("-c"),
            OsString::from("submodule.recurse=false"),
            OsString::from("-c"),
            OsString::from("protocol.allow=never"),
            OsString::from("-c"),
            OsString::from("protocol.https.allow=always"),
            OsString::from("-c"),
            OsString::from("protocol.ssh.allow=always"),
            OsString::from("-c"),
            OsString::from("protocol.file.allow=never"),
            OsString::from("-c"),
            OsString::from("protocol.ext.allow=never"),
            OsString::from("-c"),
            OsString::from("http.followRedirects=false"),
            OsString::from("fetch"),
            OsString::from("--prune"),
            OsString::from("--"),
            OsString::from(remote),
        ];
        let output = run_research_git(&repository, args, "fetch research source").await?;
        self.invalidate(resource_id)?;

        Ok(ResearchSourceGitResult {
            success: true,
            resource_id: resource_id.to_owned(),
            local_path: path_string(&repository)?,
            action: ResearchSourceGitAction::Fetched,
            output: git_output_text(&output),
        })
    }

    fn invalidate(&self, resource_id: &str) -> AppResult<()> {
        self.indexes
            .write()
            .map_err(|_| AppError::StatePoisoned)?
            .remove(resource_id);
        Ok(())
    }
}

fn configured_git_resource<'a>(
    profile: &'a ResearchProfile,
    resource_id: &str,
) -> AppResult<&'a ResearchResource> {
    let resource = profile
        .resources
        .iter()
        .find(|resource| resource.id == resource_id)
        .ok_or_else(|| {
            AppError::ResearchSource(format!(
                "research profile does not contain resource '{resource_id}'"
            ))
        })?;
    if resource.kind != ResearchResourceKind::Git {
        return Err(AppError::ResearchSource(format!(
            "research resource '{resource_id}' is not a git resource"
        )));
    }
    if resource.chat_access != ResearchChatAccess::IndexedRead {
        return Err(AppError::ResearchSource(format!(
            "research resource '{resource_id}' does not allow indexed source access"
        )));
    }
    Ok(resource)
}

async fn configured_source_root(
    project_root: &Path,
    profile: &ResearchProfile,
    resource_id: &str,
    requested_local_path: Option<&str>,
) -> AppResult<PathBuf> {
    let resource = configured_git_resource(profile, resource_id)?;
    let local_path = resource.local_path.as_deref().ok_or_else(|| {
        AppError::ResearchSource(format!(
            "git resource '{resource_id}' does not define a local path"
        ))
    })?;
    if requested_local_path.is_some_and(|requested| requested != local_path) {
        return Err(AppError::ResearchSource(format!(
            "source path does not match research profile resource '{resource_id}'"
        )));
    }
    resolve_source_root(project_root, local_path).await
}

fn configured_remote(resource: &ResearchResource) -> AppResult<&str> {
    if let Some(ssh_url) = resource.ssh_url.as_deref() {
        validate_standard_ssh_remote(ssh_url)?;
        return Ok(ssh_url);
    }
    let url = resource.url.as_deref().ok_or_else(|| {
        AppError::ResearchSource(format!(
            "git resource '{}' does not define an SSH or HTTPS URL",
            resource.id
        ))
    })?;
    validate_https_remote(url)?;
    Ok(url)
}

fn validate_https_remote(value: &str) -> AppResult<()> {
    reject_remote_controls(value)?;
    let url = Url::parse(value)
        .map_err(|_| AppError::ResearchSource("invalid git HTTPS URL".to_owned()))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path().is_empty()
        || url.path() == "/"
    {
        return Err(AppError::ResearchSource(
            "git URL must be credential-free HTTPS without a query or fragment".to_owned(),
        ));
    }
    Ok(())
}

fn validate_standard_ssh_remote(value: &str) -> AppResult<()> {
    reject_remote_controls(value)?;
    let Some(remainder) = value.strip_prefix("git@") else {
        return Err(AppError::ResearchSource(
            "SSH git URL must use the standard git@host:path form".to_owned(),
        ));
    };
    let Some((host, path)) = remainder.split_once(':') else {
        return Err(AppError::ResearchSource(
            "SSH git URL must use the standard git@host:path form".to_owned(),
        ));
    };
    let valid_host = !host.is_empty()
        && !host.starts_with('.')
        && !host.ends_with('.')
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'));
    let valid_path = !path.is_empty()
        && !path.starts_with('/')
        && !path.starts_with('-')
        && path
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'.' | b'_' | b'-'))
        && path
            .split('/')
            .all(|component| !component.is_empty() && component != "." && component != "..");
    if !valid_host || !valid_path || remainder.matches('@').count() > 0 {
        return Err(AppError::ResearchSource(
            "SSH git URL must use the standard credential-free git@host:path form".to_owned(),
        ));
    }
    Ok(())
}

fn reject_remote_controls(value: &str) -> AppResult<()> {
    if value.is_empty()
        || value.len() > 16 * 1024
        || value.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\0'
        })
    {
        return Err(AppError::ResearchSource(
            "git remote contains invalid control or whitespace characters".to_owned(),
        ));
    }
    Ok(())
}

fn validate_branch(branch: &str) -> AppResult<()> {
    let valid = !branch.is_empty()
        && branch.len() <= 1_024
        && !branch.starts_with('-')
        && !branch.starts_with('/')
        && !branch.ends_with('/')
        && !branch.ends_with('.')
        && !branch.contains("..")
        && !branch.contains("@{")
        && !branch.contains("//")
        && branch
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'.' | b'_' | b'-'));
    if !valid {
        return Err(AppError::ResearchSource(
            "git branch contains unsafe characters".to_owned(),
        ));
    }
    Ok(())
}

async fn new_clone_destination(state: &AppState, local_path: &str) -> AppResult<PathBuf> {
    let requested = configured_local_path(state, local_path)?;
    match tokio::fs::symlink_metadata(&requested).await {
        Ok(_) => {
            return Err(AppError::ResearchSource(format!(
                "clone destination already exists: {}",
                requested.to_string_lossy()
            )))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(source) => {
            return Err(AppError::io(
                "inspect clone destination",
                requested.to_string_lossy().into_owned(),
                source,
            ))
        }
    }
    let destination = filesystem::validate_project_directory_target(state, requested).await?;
    ensure_unprotected_source_path(state, &destination)?;
    Ok(destination)
}

async fn existing_fetch_repository(state: &AppState, local_path: &str) -> AppResult<PathBuf> {
    let requested = configured_local_path(state, local_path)?;
    let metadata = tokio::fs::symlink_metadata(&requested)
        .await
        .map_err(|source| {
            AppError::io(
                "inspect research source repository",
                requested.to_string_lossy().into_owned(),
                source,
            )
        })?;
    if metadata.file_type().is_symlink() {
        return Err(AppError::InvalidPath(format!(
            "research source repository cannot be a symbolic link: {}",
            requested.to_string_lossy()
        )));
    }
    let canonical = filesystem::validate_project_directory_target(state, requested).await?;
    ensure_unprotected_source_path(state, &canonical)?;
    ensure_existing_git_directory(state, &canonical).await?;
    Ok(canonical)
}

fn ensure_unprotected_source_path(state: &AppState, path: &Path) -> AppResult<()> {
    let project_root = state.project_root()?;
    let relative = path
        .strip_prefix(&project_root)
        .map_err(|_| AppError::OutsideProject(path.to_string_lossy().into_owned()))?;
    if relative.as_os_str().is_empty()
        || relative.components().any(|component| {
            let name = component.as_os_str().to_string_lossy();
            name.eq_ignore_ascii_case(".git") || name.eq_ignore_ascii_case(".textex")
        })
    {
        return Err(AppError::InvalidPath(format!(
            "research source local path cannot be the project root or a protected metadata path: {}",
            path.to_string_lossy()
        )));
    }
    Ok(())
}

fn configured_local_path(state: &AppState, local_path: &str) -> AppResult<PathBuf> {
    if local_path.is_empty()
        || local_path.len() > 16 * 1024
        || local_path.trim() != local_path
        || local_path.chars().any(char::is_control)
    {
        return Err(AppError::InvalidPath(
            "research source local path is invalid".to_owned(),
        ));
    }
    let path = PathBuf::from(local_path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(state.project_root()?.join(path))
    }
}

async fn ensure_existing_git_directory(state: &AppState, repository: &Path) -> AppResult<()> {
    let repository =
        filesystem::validate_project_directory_target(state, repository.to_path_buf()).await?;
    let metadata = tokio::fs::symlink_metadata(&repository)
        .await
        .map_err(|source| {
            AppError::io(
                "inspect research source repository",
                repository.to_string_lossy().into_owned(),
                source,
            )
        })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::NotADirectory(
            repository.to_string_lossy().into_owned(),
        ));
    }
    let git_directory = repository.join(".git");
    let git_metadata = tokio::fs::symlink_metadata(&git_directory)
        .await
        .map_err(|source| {
            AppError::io(
                "inspect research source git directory",
                git_directory.to_string_lossy().into_owned(),
                source,
            )
        })?;
    if git_metadata.file_type().is_symlink() || !git_metadata.is_dir() {
        return Err(AppError::ResearchSource(format!(
            "research source is not a non-symlink git repository: {}",
            repository.to_string_lossy()
        )));
    }
    Ok(())
}

async fn run_research_git<I, S>(
    working_directory: &Path,
    args: I,
    operation: &'static str,
) -> AppResult<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let display_root = working_directory.to_string_lossy().into_owned();
    let isolation = GitCommandIsolation::create().map_err(|source| {
        AppError::git_io(
            "prepare isolated research Git environment",
            display_root.clone(),
            source,
        )
    })?;
    let mut hooks_config = OsString::from("core.hooksPath=");
    hooks_config.push(isolation.hooks.as_os_str());
    let mut command = Command::new("git");
    command.arg("-c").arg(hooks_config);
    for config in GIT_ISOLATION_CONFIG {
        command.arg("-c").arg(config);
    }
    command
        .args(args)
        .current_dir(working_directory)
        .env("LC_ALL", "C")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", &isolation.global_config)
        .env("GIT_CONFIG_COUNT", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_SSH_COMMAND", "ssh")
        .env("SSH_ASKPASS_REQUIRE", "never")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .env_remove("GIT_ASKPASS")
        .env_remove("GIT_COMMON_DIR")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_EXEC_PATH")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_PROXY_COMMAND")
        .env_remove("GIT_SSH")
        .env_remove("GIT_SSH_VARIANT")
        .env_remove("GIT_TEMPLATE_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("SSH_ASKPASS")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    isolate_git_process_group(&mut command);
    let mut child = command
        .spawn()
        .map_err(|source| AppError::git_io(operation, display_root.clone(), source))?;
    let process_id = child.id();
    let Some(stdout) = child.stdout.take() else {
        terminate_git_process_tree(&mut child, process_id).await;
        return Err(AppError::git_io(
            operation,
            display_root,
            io::Error::new(io::ErrorKind::BrokenPipe, "Git stdout pipe was not created"),
        ));
    };
    let Some(stderr) = child.stderr.take() else {
        terminate_git_process_tree(&mut child, process_id).await;
        return Err(AppError::git_io(
            operation,
            display_root,
            io::Error::new(io::ErrorKind::BrokenPipe, "Git stderr pipe was not created"),
        ));
    };

    let total_output = Arc::new(AtomicUsize::new(0));
    let transaction = async {
        let wait_for_child = async {
            child
                .wait()
                .await
                .map_err(|source| AppError::git_io(operation, display_root.clone(), source))
        };
        let (status, stdout, stderr) = tokio::try_join!(
            wait_for_child,
            read_research_git_pipe(stdout, Arc::clone(&total_output), operation, &display_root,),
            read_research_git_pipe(stderr, Arc::clone(&total_output), operation, &display_root,),
        )?;
        Ok::<_, AppError>(Output {
            status,
            stdout,
            stderr,
        })
    };
    let operation_timeout = if operation == "clone research source" {
        GIT_CLONE_TIMEOUT
    } else {
        GIT_FETCH_TIMEOUT
    };
    let output = match timeout(operation_timeout, transaction).await {
        Ok(Ok(output)) => output,
        Ok(Err(error)) => {
            terminate_git_process_tree(&mut child, process_id).await;
            return Err(error);
        }
        Err(_) => {
            terminate_git_process_tree(&mut child, process_id).await;
            return Err(AppError::git_io(
                operation,
                display_root,
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    format!(
                        "Git operation timed out after {} seconds",
                        operation_timeout.as_secs()
                    ),
                ),
            ));
        }
    };
    if !output.status.success() {
        return Err(AppError::GitFailed {
            operation,
            status: output
                .status
                .code()
                .map_or_else(|| "signal".to_owned(), |code| code.to_string()),
            message: sanitize_git_output(&String::from_utf8_lossy(&output.stderr)),
        });
    }
    Ok(output)
}

async fn read_research_git_pipe<R>(
    mut reader: R,
    total_output: Arc<AtomicUsize>,
    operation: &'static str,
    display_root: &str,
) -> AppResult<Vec<u8>>
where
    R: AsyncRead + Unpin,
{
    let mut output = Vec::new();
    let mut buffer = vec![0_u8; GIT_OUTPUT_CHUNK_BYTES];
    loop {
        let length = reader
            .read(&mut buffer)
            .await
            .map_err(|source| AppError::git_io(operation, display_root, source))?;
        if length == 0 {
            return Ok(output);
        }
        let previous = total_output.fetch_add(length, Ordering::AcqRel);
        if previous.saturating_add(length) > MAX_GIT_OUTPUT_BYTES {
            return Err(AppError::GitOutputTooLarge {
                operation,
                limit_mb: MAX_GIT_OUTPUT_BYTES / (1024 * 1024),
            });
        }
        output.extend_from_slice(&buffer[..length]);
    }
}

#[cfg(unix)]
fn isolate_git_process_group(command: &mut Command) {
    command.process_group(0);
}

#[cfg(not(unix))]
fn isolate_git_process_group(_command: &mut Command) {}

async fn terminate_git_process_tree(child: &mut Child, process_id: Option<u32>) {
    #[cfg(unix)]
    if let Some(process_id) = process_id {
        if let Ok(process_group_id) = libc::pid_t::try_from(process_id) {
            // SAFETY: this PID belongs to the child placed in its own process
            // group before spawn; the negative value addresses that group.
            let result = unsafe { libc::kill(-process_group_id, libc::SIGKILL) };
            if result != 0 && io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
                let _ = child.start_kill();
            }
        }
    }

    #[cfg(windows)]
    if let Some(process_id) = process_id {
        let process_id = process_id.to_string();
        let _ = timeout(
            GIT_REAP_TIMEOUT,
            Command::new("taskkill.exe")
                .args(["/PID", &process_id, "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status(),
        )
        .await;
    }

    if child.try_wait().ok().flatten().is_none() {
        let _ = child.start_kill();
    }
    let _ = timeout(GIT_REAP_TIMEOUT, child.wait()).await;
}

fn git_output_text(output: &Output) -> String {
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    if !output.stderr.is_empty() {
        if !combined.is_empty() && !combined.ends_with('\n') {
            combined.push('\n');
        }
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    sanitize_git_output(&combined)
}

fn sanitize_git_output(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect::<String>()
        .trim()
        .to_owned()
}

fn path_string(path: &Path) -> AppResult<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))
}

async fn resolve_source_root(project_root: &Path, local_path: &str) -> AppResult<PathBuf> {
    let local_path = local_path.trim();
    if local_path.is_empty() || local_path.contains('\0') {
        return Err(AppError::InvalidPath(local_path.to_owned()));
    }
    let project_root = project_root.to_path_buf();
    let requested = PathBuf::from(local_path);
    let requested = if requested.is_absolute() {
        requested
    } else {
        project_root.join(requested)
    };
    tauri::async_runtime::spawn_blocking(move || {
        let canonical_project = dunce::canonicalize(&project_root).map_err(|source| {
            AppError::io(
                "resolve active project root",
                project_root.to_string_lossy().into_owned(),
                source,
            )
        })?;
        let canonical = dunce::canonicalize(&requested).map_err(|source| {
            AppError::io(
                "resolve research source",
                requested.to_string_lossy().into_owned(),
                source,
            )
        })?;
        if !path_is_within(&canonical_project, &canonical) {
            return Err(AppError::OutsideProject(
                canonical.to_string_lossy().into_owned(),
            ));
        }
        if let Some(excluded) = excluded_source_root_component(&canonical_project, &canonical) {
            return Err(AppError::InvalidPath(format!(
                "research source root cannot be inside excluded directory '{excluded}': {}",
                canonical.to_string_lossy()
            )));
        }
        let metadata = fs::metadata(&canonical).map_err(|source| {
            AppError::io(
                "inspect research source",
                canonical.to_string_lossy().into_owned(),
                source,
            )
        })?;
        if !metadata.is_dir() {
            return Err(AppError::NotADirectory(
                canonical.to_string_lossy().into_owned(),
            ));
        }
        Ok(canonical)
    })
    .await
    .map_err(|error| AppError::Worker(error.to_string()))?
}

fn excluded_source_root_component(project_root: &Path, source_root: &Path) -> Option<String> {
    let project_component_count = project_root.components().count();
    source_root
        .components()
        .skip(project_component_count)
        .filter_map(|component| match component {
            std::path::Component::Normal(name) => Some(name.to_string_lossy()),
            _ => None,
        })
        .find(|name| is_excluded_directory(name))
        .map(|name| name.into_owned())
}

fn build_source_index(resource_id: String, root: PathBuf) -> AppResult<BuiltSourceIndex> {
    let mut directories = VecDeque::from([root.clone()]);
    let mut contents = Vec::new();
    let mut files = Vec::new();
    let mut total_bytes = 0_u64;
    let mut visited_entries = 0_usize;
    let mut truncated = false;

    'walk: while let Some(directory) = directories.pop_front() {
        let remaining_entries = MAX_VISITED_ENTRIES.saturating_sub(visited_entries);
        if remaining_entries == 0 {
            truncated = true;
            break;
        }
        let mut entries = Vec::with_capacity(remaining_entries.min(1_024));
        let mut directory_was_truncated = false;
        for entry in fs::read_dir(&directory).map_err(|source| {
            AppError::io(
                "read research source directory",
                directory.to_string_lossy().into_owned(),
                source,
            )
        })? {
            if entries.len() >= remaining_entries {
                directory_was_truncated = true;
                break;
            }
            entries.push(entry.map_err(|source| {
                AppError::io(
                    "read research source entry",
                    directory.to_string_lossy().into_owned(),
                    source,
                )
            })?);
        }
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            visited_entries += 1;
            if visited_entries > MAX_VISITED_ENTRIES {
                truncated = true;
                break 'walk;
            }
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();
            let metadata = match fs::symlink_metadata(entry.path()) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                if !is_excluded_directory(&name) {
                    if let Ok(canonical) = dunce::canonicalize(entry.path()) {
                        if path_is_within(&root, &canonical) {
                            directories.push_back(canonical);
                        }
                    }
                }
                continue;
            }
            if !metadata.is_file() || is_sensitive_file_name(&name) {
                continue;
            }
            let Some(language) = source_language(&name) else {
                continue;
            };
            if metadata.len() > MAX_FILE_BYTES {
                truncated = true;
                continue;
            }
            if files.len() >= MAX_FILES
                || total_bytes.saturating_add(metadata.len()) > MAX_TOTAL_BYTES
            {
                truncated = true;
                break 'walk;
            }

            let canonical = match dunce::canonicalize(entry.path()) {
                Ok(path) if path_is_within(&root, &path) => path,
                _ => continue,
            };
            let bytes = match read_source_file_bounded(&root, &canonical) {
                Ok(bytes) if bytes.len() as u64 <= MAX_FILE_BYTES => bytes,
                Ok(_) => {
                    truncated = true;
                    continue;
                }
                Err(_) => continue,
            };
            if total_bytes.saturating_add(bytes.len() as u64) > MAX_TOTAL_BYTES {
                truncated = true;
                break 'walk;
            }
            if bytes.contains(&0) {
                continue;
            }
            let Ok(content) = String::from_utf8(bytes) else {
                continue;
            };
            let relative = canonical
                .strip_prefix(&root)
                .map_err(|_| AppError::OutsideProject(canonical.to_string_lossy().into_owned()))?;
            let path = relative_path_string(relative)?;
            let bytes = content.len() as u64;
            total_bytes = total_bytes.saturating_add(bytes);
            files.push(ResearchSourceFile {
                path: path.clone(),
                bytes,
                language: language.to_owned(),
            });
            contents.push(IndexedSourceContent { path, content });
        }
        if directory_was_truncated {
            truncated = true;
            break 'walk;
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    contents.sort_by(|left, right| left.path.cmp(&right.path));
    let file_count = files.len();
    let root_path = root
        .to_str()
        .ok_or_else(|| AppError::NonUtf8Path(root.to_string_lossy().into_owned()))?
        .to_owned();
    let indexed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64;
    Ok(BuiltSourceIndex {
        index: ResearchSourceIndex {
            resource_id,
            root_path,
            branch: read_git_branch(&root),
            indexed_at,
            files,
            file_count,
            total_bytes,
            truncated,
        },
        contents,
    })
}

fn search_contents(
    resource_id: &str,
    contents: &[IndexedSourceContent],
    query: &str,
    limit: usize,
) -> Vec<ResearchSourceSearchResult> {
    let normalized_query = query.to_lowercase();
    let terms = normalized_query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>();
    let mut results = Vec::new();

    for file in contents {
        let path_lower = file.path.to_lowercase();
        let lines = file.content.lines().collect::<Vec<_>>();
        for (line_index, line) in lines.iter().enumerate() {
            let line_lower = line.to_lowercase();
            let matched_terms = terms
                .iter()
                .filter(|term| line_lower.contains(**term))
                .count();
            if !line_lower.contains(&normalized_query) && matched_terms == 0 {
                continue;
            }
            let phrase_score = if line_lower.contains(&normalized_query) {
                100.0
            } else {
                0.0
            };
            let path_score = terms
                .iter()
                .filter(|term| path_lower.contains(**term))
                .count() as f32
                * 4.0;
            let score = phrase_score + matched_terms as f32 * 10.0 + path_score;
            let context_start = line_index.saturating_sub(2);
            let context_end = (line_index + 3).min(lines.len());
            let snippet = bounded_chars(&lines[context_start..context_end].join("\n"));
            let candidate = ResearchSourceSearchResult {
                resource_id: resource_id.to_owned(),
                path: file.path.clone(),
                line: (line_index + 1).min(u32::MAX as usize) as u32,
                start_line: (context_start + 1).min(u32::MAX as usize) as u32,
                snippet,
                score,
            };
            push_bounded_search_result(&mut results, candidate, limit);
        }
    }

    results.sort_by(compare_search_results);
    results
}

fn push_bounded_search_result(
    results: &mut Vec<ResearchSourceSearchResult>,
    candidate: ResearchSourceSearchResult,
    limit: usize,
) {
    if results.len() < limit {
        results.push(candidate);
        return;
    }
    let Some((worst_index, worst)) = results
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| compare_search_results(left, right))
    else {
        return;
    };
    if compare_search_results(&candidate, worst).is_lt() {
        results[worst_index] = candidate;
    }
}

fn compare_search_results(
    left: &ResearchSourceSearchResult,
    right: &ResearchSourceSearchResult,
) -> std::cmp::Ordering {
    right
        .score
        .total_cmp(&left.score)
        .then_with(|| left.path.cmp(&right.path))
        .then_with(|| left.line.cmp(&right.line))
}

fn read_source_file_bounded(root: &Path, path: &Path) -> io::Result<Vec<u8>> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    configure_source_open_no_follow(&mut options);
    let mut file = options.open(path)?;
    let opened_metadata = file.metadata()?;
    if !opened_metadata.is_file() || opened_metadata.len() > MAX_FILE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "research source changed to a non-file or oversized file before it was opened",
        ));
    }
    validate_opened_source_file(root, path, &opened_metadata)?;
    let mut bytes = Vec::new();
    Read::take(&mut file, MAX_FILE_BYTES + 1).read_to_end(&mut bytes)?;
    let completed_metadata = file.metadata()?;
    if !same_file_identity(&opened_metadata, &completed_metadata) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "research source file identity changed while it was read",
        ));
    }
    validate_opened_source_file(root, path, &completed_metadata)?;
    Ok(bytes)
}

fn validate_opened_source_file(
    root: &Path,
    path: &Path,
    opened_metadata: &fs::Metadata,
) -> io::Result<()> {
    let canonical = dunce::canonicalize(path)?;
    if !path_is_within(root, &canonical) || !filesystem::paths_equal(path, &canonical) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "research source path changed or escaped its configured root",
        ));
    }
    let current_metadata = fs::symlink_metadata(path)?;
    if current_metadata.file_type().is_symlink()
        || !current_metadata.is_file()
        || !same_file_identity(opened_metadata, &current_metadata)
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "research source path no longer names the opened file",
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn configure_source_open_no_follow(options: &mut fs::OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
}

#[cfg(windows)]
fn configure_source_open_no_follow(options: &mut fs::OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_source_open_no_follow(_options: &mut fs::OpenOptions) {}

#[cfg(unix)]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;

    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(windows)]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    left.volume_serial_number() == right.volume_serial_number()
        && left.file_index() == right.file_index()
}

#[cfg(not(any(unix, windows)))]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    left.len() == right.len()
        && left.modified().ok() == right.modified().ok()
        && left.created().ok() == right.created().ok()
}

fn validate_resource_id(resource_id: &str) -> AppResult<()> {
    if resource_id.is_empty()
        || resource_id.len() > MAX_RESOURCE_ID_BYTES
        || !resource_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(AppError::ResearchSource(
            "resource id must contain only ASCII letters, digits, '.', '-', or '_' and be at most 96 bytes"
                .to_owned(),
        ));
    }
    Ok(())
}

fn is_excluded_directory(name: &str) -> bool {
    EXCLUDED_DIRECTORIES
        .iter()
        .any(|excluded| name.eq_ignore_ascii_case(excluded))
}

fn is_sensitive_file_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == ".env"
        || lower.starts_with(".env.")
        || lower == "secret"
        || lower == "secrets"
        || lower.starts_with("secret.")
        || lower.starts_with("secrets.")
        || lower.starts_with("id_rsa")
        || lower.starts_with("id_dsa")
        || lower.starts_with("id_ed25519")
        || lower.contains("credentials")
        || lower.contains("private-key")
        || lower.contains("private_key")
        || lower.contains(".secret")
        || matches!(
            Path::new(&lower)
                .extension()
                .and_then(|value| value.to_str()),
            Some("pem" | "key" | "p12" | "pfx" | "crt" | "cer" | "der")
        )
}

fn source_language(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".min.js") || lower.ends_with(".min.css") {
        return None;
    }
    match lower.as_str() {
        "dockerfile" => return Some("dockerfile"),
        "makefile" | "gnumakefile" => return Some("makefile"),
        "cmakelists.txt" => return Some("cmake"),
        "cargo.toml" | "pyproject.toml" => return Some("toml"),
        _ => {}
    }
    match Path::new(&lower).extension()?.to_str()? {
        "rs" => Some("rust"),
        "ts" | "tsx" => Some("typescript"),
        "js" | "jsx" | "mjs" | "cjs" => Some("javascript"),
        "py" | "pyi" => Some("python"),
        "c" | "h" => Some("c"),
        "cc" | "cpp" | "cxx" | "hpp" | "hxx" => Some("cpp"),
        "java" => Some("java"),
        "kt" | "kts" => Some("kotlin"),
        "go" => Some("go"),
        "swift" => Some("swift"),
        "rb" => Some("ruby"),
        "php" => Some("php"),
        "cs" => Some("csharp"),
        "scala" => Some("scala"),
        "sh" | "bash" | "zsh" | "fish" => Some("shell"),
        "ps1" => Some("powershell"),
        "sql" => Some("sql"),
        "tex" | "sty" | "cls" | "bib" => Some("latex"),
        "md" | "mdx" | "rst" => Some("markdown"),
        "html" | "htm" | "vue" | "svelte" => Some("html"),
        "css" | "scss" | "sass" | "less" => Some("css"),
        "json" | "jsonc" => Some("json"),
        "yaml" | "yml" => Some("yaml"),
        "toml" => Some("toml"),
        "xml" => Some("xml"),
        "proto" => Some("protobuf"),
        "graphql" | "gql" => Some("graphql"),
        "lua" => Some("lua"),
        "r" => Some("r"),
        "jl" => Some("julia"),
        _ => None,
    }
}

fn relative_path_string(path: &Path) -> AppResult<String> {
    let path = path
        .to_str()
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))?;
    Ok(path.replace('\\', "/"))
}

fn read_git_branch(root: &Path) -> Option<String> {
    let git_directory = root.join(".git");
    let git_metadata = fs::symlink_metadata(&git_directory).ok()?;
    if git_metadata.file_type().is_symlink() || !git_metadata.is_dir() {
        return None;
    }
    let head = git_directory.join("HEAD");
    let metadata = fs::symlink_metadata(&head).ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 4_096 {
        return None;
    }
    let canonical_head = dunce::canonicalize(head).ok()?;
    if !path_is_within(root, &canonical_head) {
        return None;
    }
    let value = fs::read_to_string(canonical_head).ok()?;
    value
        .trim()
        .strip_prefix("ref: refs/heads/")
        .map(str::to_owned)
}

fn bounded_chars(value: &str) -> String {
    let mut chars = value.chars();
    let bounded = chars.by_ref().take(MAX_SNIPPET_CHARS).collect::<String>();
    if chars.next().is_some() {
        format!("{bounded}\n…")
    } else {
        bounded
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

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    fn git_resource() -> ResearchResource {
        ResearchResource {
            id: "official-code".to_owned(),
            kind: ResearchResourceKind::Git,
            label: "Official code".to_owned(),
            url: Some("https://github.com/example/project.git".to_owned()),
            ssh_url: Some("git@github.com:example/project.git".to_owned()),
            local_path: Some("sources/project".to_owned()),
            branch: Some("main".to_owned()),
            chat_access: ResearchChatAccess::IndexedRead,
        }
    }

    fn active_state(root: &Path) -> AppState {
        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(root).expect("canonical project"))
            .expect("activate project");
        state
    }

    async fn configure_source(
        state: &AppState,
        resource_id: &str,
        local_path: &str,
        access: ResearchChatAccess,
    ) {
        let mut resource = git_resource();
        resource.id = resource_id.to_owned();
        resource.local_path = Some(local_path.to_owned());
        resource.chat_access = access;
        let mut profile = ResearchProfile::default();
        profile.resources.push(resource);
        research_profile::save(state, profile)
            .await
            .expect("save research profile");
    }

    #[tokio::test]
    async fn indexes_source_files_and_returns_exact_search_lines() {
        let project = tempdir().expect("project tempdir");
        let source = project.path().join("source");
        fs::create_dir_all(source.join("src")).expect("source directories");
        fs::create_dir_all(source.join(".git")).expect("git directory");
        fs::write(source.join(".git/HEAD"), "ref: refs/heads/research\n").expect("git head");
        fs::write(
            source.join("src/policy.rs"),
            "fn prepare() {}\nfn diffusion_policy() {\n    prepare();\n}\n",
        )
        .expect("source file");
        fs::write(source.join("README.md"), "# Diffusion Policy\n").expect("readme");

        let state = active_state(project.path());
        configure_source(
            &state,
            "official-code",
            "source",
            ResearchChatAccess::IndexedRead,
        )
        .await;
        let indexes = ResearchSourceState::default();
        let index = indexes
            .index(&state, "official-code", "source")
            .await
            .expect("index source");
        assert_eq!(index.branch.as_deref(), Some("research"));
        assert_eq!(index.file_count, 2);
        assert!(!index.truncated);

        let results = indexes
            .search(&state, "official-code", "diffusion_policy", Some(5))
            .await
            .expect("search source");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "src/policy.rs");
        assert_eq!(results[0].line, 2);
        assert_eq!(results[0].start_line, 1);
    }

    #[tokio::test]
    async fn excludes_secrets_binaries_dependencies_and_symlinks() {
        let project = tempdir().expect("project tempdir");
        let source = project.path().join("source");
        fs::create_dir_all(source.join("node_modules/pkg")).expect("dependency directory");
        fs::write(source.join("main.py"), "print('safe')\n").expect("safe source");
        fs::write(source.join(".env"), "TOKEN=do-not-index\n").expect("env file");
        fs::write(source.join("private_key.pem"), "do-not-index\n").expect("key file");
        fs::write(source.join("image.rs"), b"fn x() {}\0hidden").expect("binary source");
        fs::write(source.join("node_modules/pkg/index.js"), "do-not-index\n")
            .expect("dependency source");
        #[cfg(unix)]
        std::os::unix::fs::symlink(project.path(), source.join("escape")).expect("outside symlink");

        let state = active_state(project.path());
        configure_source(&state, "repo", "source", ResearchChatAccess::IndexedRead).await;
        let index = ResearchSourceState::default()
            .index(&state, "repo", "source")
            .await
            .expect("index source");
        assert_eq!(
            index
                .files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            vec!["main.py"]
        );
    }

    #[tokio::test]
    async fn rejects_source_roots_inside_excluded_directories() {
        let project = tempdir().expect("project tempdir");
        let source = project.path().join("node_modules/package");
        fs::create_dir_all(&source).expect("dependency source directory");
        fs::write(source.join("index.js"), "export const hidden = true;\n")
            .expect("dependency source");

        let state = active_state(project.path());
        configure_source(
            &state,
            "repo",
            "node_modules/package",
            ResearchChatAccess::IndexedRead,
        )
        .await;
        let error = ResearchSourceState::default()
            .index(&state, "repo", "node_modules/package")
            .await
            .expect_err("excluded source root must fail");
        assert!(matches!(error, AppError::InvalidPath(_)));
    }

    #[tokio::test]
    async fn rejects_source_roots_outside_the_active_project() {
        let project = tempdir().expect("project tempdir");
        let outside = tempdir().expect("outside tempdir");
        let state = active_state(project.path());
        let outside_path = outside.path().to_str().expect("utf8 path");
        configure_source(
            &state,
            "repo",
            outside_path,
            ResearchChatAccess::IndexedRead,
        )
        .await;
        let error = ResearchSourceState::default()
            .index(&state, "repo", outside_path)
            .await
            .expect_err("outside source must fail");
        assert!(matches!(error, AppError::OutsideProject(_)));
    }

    #[tokio::test]
    async fn stale_indexes_cannot_cross_project_activations() {
        let first = tempdir().expect("first project");
        let second = tempdir().expect("second project");
        fs::write(first.path().join("main.rs"), "fn first() {}\n").expect("first source");
        let state = active_state(first.path());
        configure_source(&state, "repo", ".", ResearchChatAccess::IndexedRead).await;
        let indexes = ResearchSourceState::default();
        indexes
            .index(&state, "repo", ".")
            .await
            .expect("index first project");
        state
            .set_project_root(dunce::canonicalize(second.path()).expect("canonical second"))
            .expect("activate second project");
        configure_source(&state, "repo", ".", ResearchChatAccess::IndexedRead).await;

        let error = indexes
            .search(&state, "repo", "first", None)
            .await
            .expect_err("stale search must fail");
        assert!(matches!(error, AppError::ResearchSource(_)));
    }

    #[test]
    fn accepts_only_credential_free_https_or_standard_git_ssh_remotes() {
        assert!(validate_https_remote("https://github.com/example/project.git").is_ok());
        assert!(validate_standard_ssh_remote("git@github.com:example/project.git").is_ok());

        assert!(validate_https_remote("http://github.com/example/project.git").is_err());
        assert!(validate_https_remote("https://token@github.com/example/project.git").is_err());
        assert!(validate_https_remote("https://github.com/example/project.git?token=x").is_err());
        assert!(validate_standard_ssh_remote("ssh://git@github.com/example/project.git").is_err());
        assert!(validate_standard_ssh_remote("user@github.com:example/project.git").is_err());
        assert!(validate_standard_ssh_remote("git@github.com:../private.git").is_err());
        assert!(
            validate_standard_ssh_remote("git@github.com:example/repo.git\n--upload-pack=x")
                .is_err()
        );
    }

    #[test]
    fn requires_git_kind_and_explicit_indexed_read_access() {
        let mut profile = ResearchProfile::default();
        profile.resources.push(git_resource());
        assert!(configured_git_resource(&profile, "official-code").is_ok());

        profile.resources[0].chat_access = ResearchChatAccess::Metadata;
        assert!(configured_git_resource(&profile, "official-code").is_err());
        profile.resources[0].chat_access = ResearchChatAccess::Snapshot;
        assert!(configured_git_resource(&profile, "official-code").is_err());
        profile.resources[0].chat_access = ResearchChatAccess::IndexedRead;
        profile.resources[0].kind = ResearchResourceKind::Website;
        assert!(configured_git_resource(&profile, "official-code").is_err());
    }

    #[test]
    fn git_isolation_resets_execution_capable_configuration() {
        assert!(GIT_ISOLATION_CONFIG.contains(&"credential.helper="));
        assert!(GIT_ISOLATION_CONFIG.contains(&"credential.interactive=false"));
        assert!(GIT_ISOLATION_CONFIG.contains(&"core.askPass="));
        assert!(GIT_ISOLATION_CONFIG.contains(&"core.sshCommand=ssh"));
        assert!(GIT_ISOLATION_CONFIG.contains(&"core.fsmonitor=false"));
        assert!(GIT_ISOLATION_CONFIG.contains(&"gc.auto=0"));
        assert!(GIT_ISOLATION_CONFIG.contains(&"maintenance.auto=false"));

        let isolation = GitCommandIsolation::create().expect("isolated Git environment");
        assert!(isolation.hooks.is_dir());
        assert!(isolation.global_config.is_file());
        assert_eq!(
            fs::read(&isolation.global_config).expect("empty config"),
            b""
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn research_git_does_not_run_repository_hooks() {
        let repository = tempdir().expect("repository tempdir");
        initialize_test_git_repository(repository.path());
        let hook = repository.path().join(".git/hooks/reference-transaction");
        write_executable_test_script(
            &hook,
            "#!/bin/sh\n: > \"$(dirname \"$0\")/research-hook-invoked\"\n",
        );

        run_research_git(
            repository.path(),
            ["branch", "isolated-hook-test"],
            "fetch research source",
        )
        .await
        .expect("isolated Git branch update");

        assert!(!repository
            .path()
            .join(".git/hooks/research-hook-invoked")
            .exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn research_git_ignores_repository_ssh_commands() {
        let repository = tempdir().expect("repository tempdir");
        initialize_test_git_repository(repository.path());
        let malicious_ssh = repository.path().join("malicious-ssh");
        let marker = repository.path().join("research-ssh-invoked");
        write_executable_test_script(
            &malicious_ssh,
            "#!/bin/sh\n: > \"$(dirname \"$0\")/research-ssh-invoked\"\nexit 1\n",
        );
        run_test_git(
            repository.path(),
            [
                OsStr::new("config"),
                OsStr::new("core.sshCommand"),
                malicious_ssh.as_os_str(),
            ],
        );

        let result = run_research_git(
            repository.path(),
            ["ls-remote", "--", "ssh://git@127.0.0.1:1/repository"],
            "fetch research source",
        )
        .await;
        assert!(result.is_err());
        assert!(!marker.exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn research_git_disables_repository_credential_helpers() {
        use std::{
            io::{Read as _, Write as _},
            net::TcpListener,
            thread,
            time::Instant,
        };

        let repository = tempdir().expect("repository tempdir");
        initialize_test_git_repository(repository.path());
        let helper = repository.path().join("malicious-credential-helper");
        let marker = repository.path().join("research-credential-invoked");
        write_executable_test_script(
            &helper,
            "#!/bin/sh\n: > \"$(dirname \"$0\")/research-credential-invoked\"\nprintf 'username=audit\\npassword=audit\\n'\n",
        );
        let helper_config = format!("!{}", helper.to_string_lossy());
        run_test_git(
            repository.path(),
            [
                OsStr::new("config"),
                OsStr::new("credential.helper"),
                OsStr::new(&helper_config),
            ],
        );

        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind credential test server");
        listener
            .set_nonblocking(true)
            .expect("nonblocking credential test server");
        let address = listener.local_addr().expect("credential server address");
        let server = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                        let mut request = [0_u8; 4_096];
                        let _ = stream.read(&mut request);
                        stream
                            .write_all(
                                b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"audit\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                            )
                            .expect("write credential challenge");
                        return true;
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        if Instant::now() >= deadline {
                            return false;
                        }
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("credential test server failed: {error}"),
                }
            }
        });
        let url = format!("http://{address}/repository.git");
        let args = vec![
            OsString::from("-c"),
            OsString::from("protocol.allow=never"),
            OsString::from("-c"),
            OsString::from("protocol.http.allow=always"),
            OsString::from("ls-remote"),
            OsString::from("--"),
            OsString::from(url),
        ];
        let result = run_research_git(repository.path(), args, "fetch research source").await;

        assert!(server.join().expect("credential test server thread"));
        assert!(result.is_err());
        assert!(!marker.exists());
    }

    #[tokio::test]
    async fn rejects_spoofed_paths_and_revoked_source_access() {
        let project = tempdir().expect("project tempdir");
        fs::create_dir_all(project.path().join("source")).expect("source directory");
        fs::write(project.path().join("source/main.rs"), "fn indexed() {}\n").expect("source file");
        let state = active_state(project.path());
        configure_source(&state, "repo", "source", ResearchChatAccess::IndexedRead).await;
        let indexes = ResearchSourceState::default();

        assert!(indexes.index(&state, "repo", ".").await.is_err());
        indexes
            .index(&state, "repo", "source")
            .await
            .expect("authorized index");
        configure_source(&state, "repo", "source", ResearchChatAccess::Metadata).await;
        assert!(indexes
            .search(&state, "repo", "indexed", None)
            .await
            .is_err());
    }

    #[test]
    fn search_keeps_only_the_requested_number_of_results() {
        let contents = vec![IndexedSourceContent {
            path: "many.rs".to_owned(),
            content: (0..10_000)
                .map(|line| format!("needle_{line}\n"))
                .collect::<String>(),
        }];
        let results = search_contents("repo", &contents, "needle", 5);
        assert_eq!(results.len(), 5);
        assert_eq!(results[0].line, 1);
    }

    #[test]
    fn opened_source_must_still_match_its_validated_path() {
        let source = tempdir().expect("source tempdir");
        let path = source.path().join("main.rs");
        let replaced = source.path().join("replaced.rs");
        fs::write(&path, "fn original() {}\n").expect("original source");
        let opened_metadata = fs::metadata(&path).expect("original metadata");
        fs::rename(&path, &replaced).expect("move original source");
        fs::write(&path, "fn replacement() {}\n").expect("replacement source");

        assert!(validate_opened_source_file(source.path(), &path, &opened_metadata).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn bounded_source_reader_rejects_symlink_targets() {
        let source = tempdir().expect("source tempdir");
        let outside = tempdir().expect("outside tempdir");
        let outside_file = outside.path().join("outside.rs");
        let linked_file = source.path().join("linked.rs");
        fs::write(&outside_file, "fn outside() {}\n").expect("outside source");
        std::os::unix::fs::symlink(&outside_file, &linked_file).expect("source symlink");

        assert!(read_source_file_bounded(source.path(), &linked_file).is_err());
    }

    #[test]
    fn git_result_matches_the_renderer_contract() {
        let result = ResearchSourceGitResult {
            success: true,
            resource_id: "official-code".to_owned(),
            local_path: "/project/sources/code".to_owned(),
            action: ResearchSourceGitAction::Cloned,
            output: "done".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(result).expect("serialize git result"),
            serde_json::json!({
                "success": true,
                "resourceId": "official-code",
                "localPath": "/project/sources/code",
                "action": "cloned",
                "output": "done"
            })
        );
    }

    #[tokio::test]
    async fn clone_destinations_must_be_new_and_inside_the_project() {
        let project = tempdir().expect("project tempdir");
        let outside = tempdir().expect("outside tempdir");
        let state = active_state(project.path());

        let destination = new_clone_destination(&state, "sources/project")
            .await
            .expect("new destination");
        assert!(destination.starts_with(project.path()));

        fs::create_dir_all(&destination).expect("existing destination");
        assert!(new_clone_destination(&state, "sources/project")
            .await
            .is_err());
        assert!(new_clone_destination(
            &state,
            outside.path().join("repo").to_str().expect("outside utf8")
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn fetch_requires_a_non_symlink_git_directory() {
        let project = tempdir().expect("project tempdir");
        let state = active_state(project.path());
        fs::create_dir_all(project.path().join("repo/.git")).expect("git directory");
        assert!(existing_fetch_repository(&state, "repo").await.is_ok());

        fs::create_dir_all(project.path().join("plain")).expect("plain directory");
        assert!(existing_fetch_repository(&state, "plain").await.is_err());

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(project.path().join("repo"), project.path().join("linked"))
                .expect("repository symlink");
            assert!(existing_fetch_repository(&state, "linked").await.is_err());
        }
    }

    #[cfg(unix)]
    fn initialize_test_git_repository(path: &Path) {
        run_test_git(path, [OsStr::new("init"), OsStr::new("--quiet")]);
        run_test_git(
            path,
            [
                OsStr::new("-c"),
                OsStr::new("core.hooksPath=/dev/null"),
                OsStr::new("-c"),
                OsStr::new("user.name=TextEx Audit"),
                OsStr::new("-c"),
                OsStr::new("user.email=audit@invalid"),
                OsStr::new("commit"),
                OsStr::new("--quiet"),
                OsStr::new("--allow-empty"),
                OsStr::new("-m"),
                OsStr::new("initial"),
            ],
        );
    }

    #[cfg(unix)]
    fn run_test_git<I, S>(path: &Path, args: I)
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let status = std::process::Command::new("git")
            .args(args)
            .current_dir(path)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_TERMINAL_PROMPT", "0")
            .status()
            .expect("run test Git");
        assert!(status.success(), "test Git command failed: {status}");
    }

    #[cfg(unix)]
    fn write_executable_test_script(path: &Path, contents: &str) {
        use std::os::unix::fs::PermissionsExt;

        fs::write(path, contents).expect("write executable test script");
        let mut permissions = fs::metadata(path)
            .expect("test script metadata")
            .permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(path, permissions).expect("make test script executable");
    }
}
