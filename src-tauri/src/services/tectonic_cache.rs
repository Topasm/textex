use std::{
    collections::HashSet,
    io,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Mutex, RwLock, RwLockReadGuard},
};

use crate::error::{AppError, AppResult};

const MANIFEST_NAME: &str = "manifest.json";
const SEED_FILES_DIRECTORY: &str = "files";
const INSTALLED_MARKER_NAME: &str = ".textex-seed.json";
const SUPPORTED_SCHEMA_VERSION: u8 = 1;
const TECTONIC_VERSION: &str = "0.17.0";
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_SEED_FILES: usize = 50_000;
const MAX_SEED_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SEED_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
const MAX_CACHE_FILES: u64 = 100_000;
const MAX_CACHE_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;
static STAGE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static CACHE_LIFECYCLE_LOCK: RwLock<()> = RwLock::const_new(());
static CACHE_PREPARE_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SeedManifest {
    schema_version: u8,
    seed_version: String,
    tectonic_version: String,
    total_bytes: u64,
    files: Vec<SeedFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SeedFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstalledSeed {
    schema_version: u8,
    seed_version: String,
    tectonic_version: String,
    manifest_sha256: String,
    total_bytes: u64,
}

pub struct PreparedCache {
    pub path: PathBuf,
    pub status: String,
    pub(crate) lease: Option<RwLockReadGuard<'static, ()>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TectonicCacheIntegrity {
    Missing,
    Empty,
    Verified,
    Unverified,
    Corrupt,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TectonicSeedStatus {
    pub path: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub ready: bool,
    pub integrity: TectonicCacheIntegrity,
    pub seed_version: Option<String>,
    pub detail: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TectonicActiveCacheStatus {
    pub path: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub ready: bool,
    pub integrity: TectonicCacheIntegrity,
    pub installed_seed_version: Option<String>,
    pub detail: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TectonicCacheStatus {
    pub seed: TectonicSeedStatus,
    pub cache: TectonicActiveCacheStatus,
    pub cache_usable: bool,
    pub network_fallback: bool,
}

pub async fn prepare(app: &AppHandle) -> AppResult<PreparedCache> {
    let (cache_dir, seed_dir) = cache_locations(app)?;
    prepare_guarded_at(&cache_dir, &seed_dir).await
}

pub async fn status(app: &AppHandle) -> AppResult<TectonicCacheStatus> {
    let _operation = CACHE_LIFECYCLE_LOCK.read().await;
    let (cache_dir, seed_dir) = cache_locations(app)?;
    Ok(status_at(&cache_dir, &seed_dir).await)
}

pub async fn reset(app: &AppHandle) -> AppResult<TectonicCacheStatus> {
    let (cache_dir, seed_dir) = cache_locations(app)?;
    reset_guarded_at(&cache_dir, &seed_dir).await
}

fn cache_locations(app: &AppHandle) -> AppResult<(PathBuf, PathBuf)> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?
        .join("tectonic");
    let seed_dir = app
        .path()
        .resource_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?
        .join("tectonic-cache");
    Ok((cache_dir, seed_dir))
}

async fn prepare_guarded_at(cache_dir: &Path, seed_dir: &Path) -> AppResult<PreparedCache> {
    let lifecycle = CACHE_LIFECYCLE_LOCK.read().await;
    let _preparation = CACHE_PREPARE_LOCK.lock().await;
    let mut prepared = prepare_at(cache_dir, seed_dir).await?;
    prepared.lease = Some(lifecycle);
    Ok(prepared)
}

async fn reset_guarded_at(cache_dir: &Path, seed_dir: &Path) -> AppResult<TectonicCacheStatus> {
    let _operation = CACHE_LIFECYCLE_LOCK.write().await;
    reset_at(cache_dir, seed_dir).await?;
    Ok(status_at(cache_dir, seed_dir).await)
}

async fn prepare_at(cache_dir: &Path, seed_dir: &Path) -> AppResult<PreparedCache> {
    let cache_parent = cache_dir.parent().ok_or_else(|| {
        AppError::RuntimePath(format!(
            "Tectonic cache has no parent: {}",
            cache_dir.to_string_lossy()
        ))
    })?;
    ensure_directory(cache_parent).await?;

    if let Some(status) = inspect_existing_cache(cache_dir, seed_dir).await? {
        return Ok(PreparedCache {
            path: cache_dir.to_path_buf(),
            status,
            lease: None,
        });
    }

    let seed = match load_seed(seed_dir).await {
        Ok(Some(seed)) => seed,
        Ok(None) => {
            ensure_directory(cache_dir).await?;
            return Ok(PreparedCache {
                path: cache_dir.to_path_buf(),
                status: "Tectonic offline seed is not staged; using the local cache with network fallback for missing support files.\n".to_owned(),
                lease: None,
            });
        }
        Err(error) => {
            ensure_directory(cache_dir).await?;
            return Ok(PreparedCache {
                path: cache_dir.to_path_buf(),
                status: format!(
                    "Tectonic offline seed was rejected ({error}); using network fallback for missing support files.\n"
                ),
                lease: None,
            });
        }
    };

    let sequence = STAGE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let stage = cache_parent.join(format!(
        ".tectonic-seed-stage-{}-{sequence}",
        std::process::id()
    ));
    fs::create_dir(&stage).await.map_err(|source| {
        AppError::compiler_io("create staged cache", stage.to_string_lossy(), source)
    })?;

    let install_result = install_seed_files(&seed, &stage).await;
    if let Err(error) = install_result {
        let _ = fs::remove_dir_all(&stage).await;
        ensure_directory(cache_dir).await?;
        return Ok(PreparedCache {
            path: cache_dir.to_path_buf(),
            status: format!(
                "Tectonic offline seed installation failed ({error}); using network fallback for missing support files.\n"
            ),
            lease: None,
        });
    }

    match fs::rename(&stage, cache_dir).await {
        Ok(()) => Ok(PreparedCache {
            path: cache_dir.to_path_buf(),
            status: format!(
                "Installed verified Tectonic offline seed {} ({} files, {} bytes).\n",
                seed.manifest.seed_version,
                seed.manifest.files.len(),
                seed.manifest.total_bytes
            ),
            lease: None,
        }),
        Err(source) => {
            let _ = fs::remove_dir_all(&stage).await;
            if fs::symlink_metadata(cache_dir).await.is_ok() {
                ensure_directory(cache_dir).await?;
                Ok(PreparedCache {
                    path: cache_dir.to_path_buf(),
                    status: "Another compiler initialized the Tectonic cache first; preserving that cache and retaining network fallback.\n".to_owned(),
                    lease: None,
                })
            } else {
                Err(AppError::compiler_io(
                    "activate staged cache",
                    cache_dir.to_string_lossy(),
                    source,
                ))
            }
        }
    }
}

struct LoadedSeed {
    root: PathBuf,
    manifest: SeedManifest,
    manifest_sha256: String,
}

async fn load_seed(seed_dir: &Path) -> AppResult<Option<LoadedSeed>> {
    let manifest_path = seed_dir.join(MANIFEST_NAME);
    let metadata = match fs::symlink_metadata(&manifest_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect offline seed manifest",
                manifest_path.to_string_lossy(),
                source,
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::InvalidPath(format!(
            "offline seed manifest is not a regular file: {}",
            manifest_path.to_string_lossy()
        )));
    }
    if metadata.len() > MAX_MANIFEST_BYTES {
        return Err(AppError::CompilerWorker(
            "offline seed manifest exceeds 1 MiB".to_owned(),
        ));
    }
    let bytes = read_limited(&manifest_path, MAX_MANIFEST_BYTES).await?;
    let manifest: SeedManifest = serde_json::from_slice(&bytes).map_err(|error| {
        AppError::CompilerWorker(format!("invalid offline seed manifest: {error}"))
    })?;
    validate_manifest(&manifest)?;
    if manifest.files.is_empty() {
        return Ok(None);
    }
    let root = seed_dir.join(SEED_FILES_DIRECTORY);
    let root_metadata = fs::symlink_metadata(&root).await.map_err(|source| {
        AppError::compiler_io("inspect offline seed files", root.to_string_lossy(), source)
    })?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "offline seed files root is not a regular directory: {}",
            root.to_string_lossy()
        )));
    }
    let root = fs::canonicalize(&root).await.map_err(|source| {
        AppError::compiler_io("resolve offline seed files", root.to_string_lossy(), source)
    })?;
    Ok(Some(LoadedSeed {
        root,
        manifest,
        manifest_sha256: hex_digest(&bytes),
    }))
}

fn validate_manifest(manifest: &SeedManifest) -> AppResult<()> {
    if manifest.schema_version != SUPPORTED_SCHEMA_VERSION {
        return Err(AppError::CompilerWorker(format!(
            "unsupported offline seed schema {}",
            manifest.schema_version
        )));
    }
    if manifest.seed_version.trim().is_empty() || manifest.seed_version.len() > 128 {
        return Err(AppError::CompilerWorker(
            "offline seed version is invalid".to_owned(),
        ));
    }
    if manifest.tectonic_version != TECTONIC_VERSION {
        return Err(AppError::CompilerWorker(format!(
            "offline seed targets Tectonic {}, expected {TECTONIC_VERSION}",
            manifest.tectonic_version
        )));
    }
    if manifest.files.len() > MAX_SEED_FILES || manifest.total_bytes > MAX_SEED_TOTAL_BYTES {
        return Err(AppError::CompilerWorker(
            "offline seed exceeds file-count or total-size limits".to_owned(),
        ));
    }
    let mut total = 0_u64;
    let mut paths = HashSet::with_capacity(manifest.files.len());
    for file in &manifest.files {
        validate_relative_path(&file.path)?;
        if !paths.insert(file.path.clone()) {
            return Err(AppError::CompilerWorker(format!(
                "duplicate offline seed path: {}",
                file.path
            )));
        }
        if file.size > MAX_SEED_FILE_BYTES || !valid_sha256(&file.sha256) {
            return Err(AppError::CompilerWorker(format!(
                "invalid offline seed metadata for {}",
                file.path
            )));
        }
        total = total.checked_add(file.size).ok_or_else(|| {
            AppError::CompilerWorker("offline seed total size overflow".to_owned())
        })?;
    }
    if total != manifest.total_bytes {
        return Err(AppError::CompilerWorker(format!(
            "offline seed totalBytes mismatch: manifest={}, files={total}",
            manifest.total_bytes
        )));
    }
    Ok(())
}

async fn install_seed_files(seed: &LoadedSeed, stage: &Path) -> AppResult<()> {
    for file in &seed.manifest.files {
        let source = seed.root.join(&file.path);
        let metadata = fs::symlink_metadata(&source)
            .await
            .map_err(|source_error| {
                AppError::compiler_io(
                    "inspect offline seed file",
                    source.to_string_lossy(),
                    source_error,
                )
            })?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() != file.size {
            return Err(AppError::CompilerWorker(format!(
                "offline seed file metadata mismatch: {}",
                file.path
            )));
        }
        let canonical = fs::canonicalize(&source).await.map_err(|source_error| {
            AppError::compiler_io(
                "resolve offline seed file",
                source.to_string_lossy(),
                source_error,
            )
        })?;
        if !canonical.starts_with(&seed.root) {
            return Err(AppError::InvalidPath(format!(
                "offline seed file escapes its resource root: {}",
                canonical.to_string_lossy()
            )));
        }
        let target = stage.join(&file.path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).await.map_err(|source_error| {
                AppError::compiler_io(
                    "create offline seed directory",
                    parent.to_string_lossy(),
                    source_error,
                )
            })?;
        }
        let digest = copy_and_hash(&canonical, &target, file.size).await?;
        if digest != file.sha256 {
            return Err(AppError::CompilerWorker(format!(
                "offline seed SHA-256 mismatch for {}",
                file.path
            )));
        }
    }
    let marker = InstalledSeed {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        seed_version: seed.manifest.seed_version.clone(),
        tectonic_version: seed.manifest.tectonic_version.clone(),
        manifest_sha256: seed.manifest_sha256.clone(),
        total_bytes: seed.manifest.total_bytes,
    };
    let marker_bytes = serde_json::to_vec_pretty(&marker)
        .map_err(|error| AppError::CompilerWorker(error.to_string()))?;
    fs::write(stage.join(INSTALLED_MARKER_NAME), marker_bytes)
        .await
        .map_err(|source| {
            AppError::compiler_io("write offline seed marker", stage.to_string_lossy(), source)
        })
}

async fn inspect_existing_cache(cache_dir: &Path, seed_dir: &Path) -> AppResult<Option<String>> {
    let metadata = match fs::symlink_metadata(cache_dir).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect cache directory",
                cache_dir.to_string_lossy(),
                source,
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Tectonic cache is not a regular directory: {}",
            cache_dir.to_string_lossy()
        )));
    }
    let mut entries = fs::read_dir(cache_dir).await.map_err(|source| {
        AppError::compiler_io(
            "inspect cache contents",
            cache_dir.to_string_lossy(),
            source,
        )
    })?;
    if entries
        .next_entry()
        .await
        .map_err(|source| {
            AppError::compiler_io(
                "inspect cache contents",
                cache_dir.to_string_lossy(),
                source,
            )
        })?
        .is_none()
    {
        return Ok(None);
    }
    let marker_path = cache_dir.join(INSTALLED_MARKER_NAME);
    let has_regular_marker = match fs::symlink_metadata(&marker_path).await {
        Ok(metadata) => !metadata.file_type().is_symlink() && metadata.is_file(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect offline seed marker",
                marker_path.to_string_lossy(),
                source,
            ));
        }
    };
    if has_regular_marker {
        if let Ok(marker_bytes) = read_limited(&marker_path, MAX_MANIFEST_BYTES).await {
            if let Ok(marker) = serde_json::from_slice::<InstalledSeed>(&marker_bytes) {
                if let Ok(Some(seed)) = load_seed(seed_dir).await {
                    if marker.schema_version == SUPPORTED_SCHEMA_VERSION
                        && marker.seed_version == seed.manifest.seed_version
                        && marker.tectonic_version == TECTONIC_VERSION
                        && marker.manifest_sha256 == seed.manifest_sha256
                        && marker.total_bytes == seed.manifest.total_bytes
                    {
                        return Ok(Some(format!(
                            "Using verified Tectonic offline seed {} with network fallback for uncached support files.\n",
                            marker.seed_version
                        )));
                    }
                }
            }
        }
    }
    Ok(Some(
        "Using the existing Tectonic cache; offline seed bootstrap was skipped to preserve downloaded support files.\n"
            .to_owned(),
    ))
}

async fn status_at(cache_dir: &Path, seed_dir: &Path) -> TectonicCacheStatus {
    let seed = inspect_seed_status(seed_dir).await;
    let cache = inspect_active_cache_status(cache_dir, seed_dir).await;
    TectonicCacheStatus {
        cache_usable: cache.ready,
        network_fallback: true,
        seed,
        cache,
    }
}

async fn inspect_seed_status(seed_dir: &Path) -> TectonicSeedStatus {
    let path = seed_dir.to_string_lossy().into_owned();
    match load_seed(seed_dir).await {
        Ok(Some(seed)) => match verify_manifest_files(&seed.root, &seed.manifest, true).await {
            Ok(()) => TectonicSeedStatus {
                path,
                file_count: seed.manifest.files.len() as u64,
                total_bytes: seed.manifest.total_bytes,
                ready: true,
                integrity: TectonicCacheIntegrity::Verified,
                seed_version: Some(seed.manifest.seed_version),
                detail:
                    "The packaged seed manifest and every support file passed SHA-256 verification."
                        .to_owned(),
            },
            Err(error) => TectonicSeedStatus {
                path,
                file_count: seed.manifest.files.len() as u64,
                total_bytes: seed.manifest.total_bytes,
                ready: false,
                integrity: TectonicCacheIntegrity::Corrupt,
                seed_version: Some(seed.manifest.seed_version),
                detail: format!("Packaged seed verification failed: {error}"),
            },
        },
        Ok(None) => inspect_empty_or_missing_seed(seed_dir, path).await,
        Err(error) => TectonicSeedStatus {
            path,
            file_count: 0,
            total_bytes: 0,
            ready: false,
            integrity: TectonicCacheIntegrity::Corrupt,
            seed_version: None,
            detail: format!("Packaged seed manifest was rejected: {error}"),
        },
    }
}

async fn inspect_empty_or_missing_seed(seed_dir: &Path, path: String) -> TectonicSeedStatus {
    let manifest_path = seed_dir.join(MANIFEST_NAME);
    match fs::symlink_metadata(&manifest_path).await {
        Err(error) if error.kind() == io::ErrorKind::NotFound => TectonicSeedStatus {
            path,
            file_count: 0,
            total_bytes: 0,
            ready: false,
            integrity: TectonicCacheIntegrity::Missing,
            seed_version: None,
            detail: "This build does not contain an offline support-file seed; missing files may be downloaded on first compile."
                .to_owned(),
        },
        Err(error) => TectonicSeedStatus {
            path,
            file_count: 0,
            total_bytes: 0,
            ready: false,
            integrity: TectonicCacheIntegrity::Corrupt,
            seed_version: None,
            detail: format!("Packaged seed manifest could not be inspected: {error}"),
        },
        Ok(_) => {
            let parsed = async {
                let bytes = read_limited(&manifest_path, MAX_MANIFEST_BYTES).await?;
                let manifest: SeedManifest = serde_json::from_slice(&bytes).map_err(|error| {
                    AppError::CompilerWorker(format!("invalid offline seed manifest: {error}"))
                })?;
                validate_manifest(&manifest)?;
                let files_root = seed_dir.join(SEED_FILES_DIRECTORY);
                match fs::symlink_metadata(&files_root).await {
                    Ok(metadata) => {
                        if metadata.file_type().is_symlink() || !metadata.is_dir() {
                            return Err(AppError::InvalidPath(format!(
                                "offline seed files root is not a regular directory: {}",
                                files_root.to_string_lossy()
                            )));
                        }
                        let (file_count, total_bytes) =
                            scan_regular_tree(&files_root, None).await?;
                        if file_count != 0 || total_bytes != 0 {
                            return Err(AppError::CompilerWorker(
                                "empty offline seed manifest has staged support files".to_owned(),
                            ));
                        }
                    }
                    Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                    Err(source) => {
                        return Err(AppError::compiler_io(
                            "inspect empty offline seed files",
                            files_root.to_string_lossy(),
                            source,
                        ));
                    }
                }
                Ok::<_, AppError>(manifest)
            }
            .await;
            match parsed {
                Ok(manifest) => TectonicSeedStatus {
                    path,
                    file_count: 0,
                    total_bytes: 0,
                    ready: false,
                    integrity: TectonicCacheIntegrity::Empty,
                    seed_version: Some(manifest.seed_version),
                    detail: "This build intentionally ships an empty seed; missing support files may be downloaded on first compile."
                        .to_owned(),
                },
                Err(error) => TectonicSeedStatus {
                    path,
                    file_count: 0,
                    total_bytes: 0,
                    ready: false,
                    integrity: TectonicCacheIntegrity::Corrupt,
                    seed_version: None,
                    detail: format!("Packaged seed verification failed: {error}"),
                },
            }
        }
    }
}

async fn inspect_active_cache_status(
    cache_dir: &Path,
    seed_dir: &Path,
) -> TectonicActiveCacheStatus {
    let path = cache_dir.to_string_lossy().into_owned();
    let metadata = match fs::symlink_metadata(cache_dir).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return TectonicActiveCacheStatus {
                path,
                file_count: 0,
                total_bytes: 0,
                ready: false,
                integrity: TectonicCacheIntegrity::Missing,
                installed_seed_version: None,
                detail: "The writable cache has not been initialized yet.".to_owned(),
            };
        }
        Err(error) => {
            return corrupt_cache_status(path, 0, 0, None, error.to_string());
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return corrupt_cache_status(
            path,
            0,
            0,
            None,
            "the cache path is not a regular directory".to_owned(),
        );
    }
    let (file_count, total_bytes) =
        match scan_regular_tree(cache_dir, Some(INSTALLED_MARKER_NAME)).await {
            Ok(counts) => counts,
            Err(error) => return corrupt_cache_status(path, 0, 0, None, error.to_string()),
        };
    if file_count == 0 {
        return TectonicActiveCacheStatus {
            path,
            file_count,
            total_bytes,
            ready: false,
            integrity: TectonicCacheIntegrity::Empty,
            installed_seed_version: None,
            detail: "The writable cache is initialized but contains no support files yet."
                .to_owned(),
        };
    }

    let marker_path = cache_dir.join(INSTALLED_MARKER_NAME);
    let marker_metadata = match fs::symlink_metadata(&marker_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return TectonicActiveCacheStatus {
                path,
                file_count,
                total_bytes,
                ready: true,
                integrity: TectonicCacheIntegrity::Unverified,
                installed_seed_version: None,
                detail: "Downloaded cache files are present, but there is no TextEx seed marker to verify them against."
                    .to_owned(),
            };
        }
        Err(error) => {
            return corrupt_cache_status(path, file_count, total_bytes, None, error.to_string());
        }
    };
    if marker_metadata.file_type().is_symlink() || !marker_metadata.is_file() {
        return corrupt_cache_status(
            path,
            file_count,
            total_bytes,
            None,
            "the installed seed marker is not a regular file".to_owned(),
        );
    }
    let marker = match read_limited(&marker_path, MAX_MANIFEST_BYTES)
        .await
        .and_then(|bytes| {
            serde_json::from_slice::<InstalledSeed>(&bytes).map_err(|error| {
                AppError::CompilerWorker(format!("invalid installed seed marker: {error}"))
            })
        }) {
        Ok(marker) => marker,
        Err(error) => {
            return corrupt_cache_status(path, file_count, total_bytes, None, error.to_string());
        }
    };
    let installed_seed_version = Some(marker.seed_version.clone());
    if marker.schema_version != SUPPORTED_SCHEMA_VERSION
        || marker.tectonic_version != TECTONIC_VERSION
    {
        return corrupt_cache_status(
            path,
            file_count,
            total_bytes,
            installed_seed_version,
            "the installed seed marker is incompatible with this build".to_owned(),
        );
    }

    let seed = match load_seed(seed_dir).await {
        Ok(Some(seed)) => seed,
        Ok(None) => {
            return TectonicActiveCacheStatus {
                path,
                file_count,
                total_bytes,
                ready: true,
                integrity: TectonicCacheIntegrity::Unverified,
                installed_seed_version,
                detail: "Cache files are present, but this build has no packaged seed files for comparison."
                    .to_owned(),
            };
        }
        Err(error) => {
            return TectonicActiveCacheStatus {
                path,
                file_count,
                total_bytes,
                ready: true,
                integrity: TectonicCacheIntegrity::Unverified,
                installed_seed_version,
                detail: format!(
                    "Cache files are present, but the packaged seed could not be loaded for comparison: {error}"
                ),
            };
        }
    };
    if marker.seed_version != seed.manifest.seed_version
        || marker.manifest_sha256 != seed.manifest_sha256
        || marker.total_bytes != seed.manifest.total_bytes
    {
        return TectonicActiveCacheStatus {
            path,
            file_count,
            total_bytes,
            ready: true,
            integrity: TectonicCacheIntegrity::Unverified,
            installed_seed_version,
            detail: "The cache was installed from a different seed version and cannot be verified by this build."
                .to_owned(),
        };
    }
    match verify_manifest_files(cache_dir, &seed.manifest, false).await {
        Ok(()) => TectonicActiveCacheStatus {
            path,
            file_count,
            total_bytes,
            ready: true,
            integrity: TectonicCacheIntegrity::Verified,
            installed_seed_version,
            detail: "Every installed seed file passed SHA-256 verification; additional downloaded files were preserved."
                .to_owned(),
        },
        Err(error) => corrupt_cache_status(
            path,
            file_count,
            total_bytes,
            installed_seed_version,
            format!("installed seed verification failed: {error}"),
        ),
    }
}

fn corrupt_cache_status(
    path: String,
    file_count: u64,
    total_bytes: u64,
    installed_seed_version: Option<String>,
    reason: String,
) -> TectonicActiveCacheStatus {
    TectonicActiveCacheStatus {
        path,
        file_count,
        total_bytes,
        ready: false,
        integrity: TectonicCacheIntegrity::Corrupt,
        installed_seed_version,
        detail: format!("Cache integrity check failed: {reason}"),
    }
}

async fn reset_at(cache_dir: &Path, seed_dir: &Path) -> AppResult<PreparedCache> {
    let cache_parent = cache_dir.parent().ok_or_else(|| {
        AppError::RuntimePath(format!(
            "Tectonic cache has no parent: {}",
            cache_dir.to_string_lossy()
        ))
    })?;
    ensure_directory(cache_parent).await?;
    let metadata = match fs::symlink_metadata(cache_dir).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return prepare_at(cache_dir, seed_dir).await;
        }
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect cache before reset",
                cache_dir.to_string_lossy(),
                source,
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "refusing to reset a cache path that is not a regular directory: {}",
            cache_dir.to_string_lossy()
        )));
    }

    let sequence = STAGE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let backup = cache_parent.join(format!(
        ".tectonic-cache-reset-{}-{sequence}",
        std::process::id()
    ));
    fs::rename(cache_dir, &backup).await.map_err(|source| {
        AppError::compiler_io("stage cache reset", cache_dir.to_string_lossy(), source)
    })?;
    match prepare_at(cache_dir, seed_dir).await {
        Ok(prepared) => {
            fs::remove_dir_all(&backup).await.map_err(|source| {
                AppError::compiler_io(
                    "remove reset cache backup",
                    backup.to_string_lossy(),
                    source,
                )
            })?;
            Ok(prepared)
        }
        Err(error) => {
            let restore = restore_cache_backup(cache_dir, &backup).await;
            match restore {
                Ok(()) => Err(error),
                Err(restore_error) => Err(AppError::CompilerWorker(format!(
                    "cache rebuild failed ({error}) and the backup could not be restored ({restore_error}); backup retained at {}",
                    backup.to_string_lossy()
                ))),
            }
        }
    }
}

async fn restore_cache_backup(cache_dir: &Path, backup: &Path) -> AppResult<()> {
    match fs::symlink_metadata(cache_dir).await {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(AppError::InvalidPath(format!(
                    "refusing to replace an unexpected cache path during restore: {}",
                    cache_dir.to_string_lossy()
                )));
            }
            fs::remove_dir_all(cache_dir).await.map_err(|source| {
                AppError::compiler_io(
                    "remove failed cache rebuild",
                    cache_dir.to_string_lossy(),
                    source,
                )
            })?;
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect failed cache rebuild",
                cache_dir.to_string_lossy(),
                source,
            ));
        }
    }
    fs::rename(backup, cache_dir).await.map_err(|source| {
        AppError::compiler_io("restore cache backup", cache_dir.to_string_lossy(), source)
    })
}

async fn scan_regular_tree(root: &Path, skip_root_file: Option<&str>) -> AppResult<(u64, u64)> {
    let root = fs::canonicalize(root).await.map_err(|source| {
        AppError::compiler_io("resolve cache directory", root.to_string_lossy(), source)
    })?;
    let mut directories = vec![root.clone()];
    let mut file_count = 0_u64;
    let mut total_bytes = 0_u64;
    while let Some(directory) = directories.pop() {
        let mut entries = fs::read_dir(&directory).await.map_err(|source| {
            AppError::compiler_io(
                "inspect cache directory",
                directory.to_string_lossy(),
                source,
            )
        })?;
        while let Some(entry) = entries.next_entry().await.map_err(|source| {
            AppError::compiler_io(
                "inspect cache directory",
                directory.to_string_lossy(),
                source,
            )
        })? {
            if directory == root
                && skip_root_file.is_some_and(|name| entry.file_name().to_string_lossy() == name)
            {
                continue;
            }
            let entry_path = entry.path();
            let metadata = fs::symlink_metadata(&entry_path).await.map_err(|source| {
                AppError::compiler_io("inspect cache entry", entry_path.to_string_lossy(), source)
            })?;
            if metadata.file_type().is_symlink() {
                return Err(AppError::InvalidPath(format!(
                    "cache contains a symbolic link: {}",
                    entry_path.to_string_lossy()
                )));
            }
            if metadata.is_dir() {
                directories.push(entry_path);
                continue;
            }
            if !metadata.is_file() {
                return Err(AppError::InvalidPath(format!(
                    "cache contains a non-file entry: {}",
                    entry_path.to_string_lossy()
                )));
            }
            file_count = file_count
                .checked_add(1)
                .ok_or_else(|| AppError::CompilerWorker("cache file-count overflow".to_owned()))?;
            total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| AppError::CompilerWorker("cache total-size overflow".to_owned()))?;
            if file_count > MAX_CACHE_FILES || total_bytes > MAX_CACHE_TOTAL_BYTES {
                return Err(AppError::CompilerWorker(
                    "cache exceeds inspection file-count or total-size limits".to_owned(),
                ));
            }
        }
    }
    Ok((file_count, total_bytes))
}

async fn verify_manifest_files(
    root: &Path,
    manifest: &SeedManifest,
    require_exact_contents: bool,
) -> AppResult<()> {
    let root = fs::canonicalize(root).await.map_err(|source| {
        AppError::compiler_io("resolve cache files", root.to_string_lossy(), source)
    })?;
    if require_exact_contents {
        let (file_count, total_bytes) = scan_regular_tree(&root, None).await?;
        if file_count != manifest.files.len() as u64 || total_bytes != manifest.total_bytes {
            return Err(AppError::CompilerWorker(
                "support-file tree does not exactly match the manifest".to_owned(),
            ));
        }
    }
    for file in &manifest.files {
        let candidate = root.join(&file.path);
        let metadata = fs::symlink_metadata(&candidate).await.map_err(|source| {
            AppError::compiler_io("inspect support file", candidate.to_string_lossy(), source)
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() != file.size {
            return Err(AppError::CompilerWorker(format!(
                "support file metadata mismatch: {}",
                file.path
            )));
        }
        let canonical = fs::canonicalize(&candidate).await.map_err(|source| {
            AppError::compiler_io("resolve support file", candidate.to_string_lossy(), source)
        })?;
        if !canonical.starts_with(&root) {
            return Err(AppError::InvalidPath(format!(
                "support file escapes its cache root: {}",
                canonical.to_string_lossy()
            )));
        }
        if hash_regular_file(&canonical, file.size).await? != file.sha256 {
            return Err(AppError::CompilerWorker(format!(
                "support file SHA-256 mismatch: {}",
                file.path
            )));
        }
    }
    Ok(())
}

async fn hash_regular_file(path: &Path, expected_size: u64) -> AppResult<String> {
    let mut input = fs::File::open(path).await.map_err(|source| {
        AppError::compiler_io("open support file", path.to_string_lossy(), source)
    })?;
    let metadata = input.metadata().await.map_err(|source| {
        AppError::compiler_io("inspect open support file", path.to_string_lossy(), source)
    })?;
    if !metadata.is_file() || metadata.len() != expected_size {
        return Err(AppError::CompilerWorker(format!(
            "support file size changed while opening: {}",
            path.to_string_lossy()
        )));
    }
    let mut digest = Sha256::new();
    let mut read_total = 0_u64;
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer).await.map_err(|source| {
            AppError::compiler_io("read support file", path.to_string_lossy(), source)
        })?;
        if read == 0 {
            break;
        }
        read_total = read_total
            .checked_add(read as u64)
            .ok_or_else(|| AppError::CompilerWorker("support file size overflow".to_owned()))?;
        if read_total > expected_size {
            return Err(AppError::CompilerWorker(format!(
                "support file grew while hashing: {}",
                path.to_string_lossy()
            )));
        }
        digest.update(&buffer[..read]);
    }
    if read_total != expected_size {
        return Err(AppError::CompilerWorker(format!(
            "support file size changed while hashing: {}",
            path.to_string_lossy()
        )));
    }
    Ok(format!("{:x}", digest.finalize()))
}

async fn ensure_directory(path: &Path) -> AppResult<()> {
    match fs::symlink_metadata(path).await {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(AppError::InvalidPath(format!(
                    "cache path is not a regular directory: {}",
                    path.to_string_lossy()
                )));
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir_all(path).await.map_err(|source| {
                AppError::compiler_io("create cache directory", path.to_string_lossy(), source)
            })?;
        }
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect cache directory",
                path.to_string_lossy(),
                source,
            ));
        }
    }
    Ok(())
}

async fn read_limited(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    let file = fs::File::open(path).await.map_err(|source| {
        AppError::compiler_io("open cache metadata", path.to_string_lossy(), source)
    })?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|source| {
            AppError::compiler_io("read cache metadata", path.to_string_lossy(), source)
        })?;
    if bytes.len() as u64 > limit {
        return Err(AppError::CompilerWorker(
            "cache metadata exceeds the allowed size".to_owned(),
        ));
    }
    Ok(bytes)
}

async fn copy_and_hash(source: &Path, target: &Path, expected_size: u64) -> AppResult<String> {
    let mut input = fs::File::open(source).await.map_err(|source_error| {
        AppError::compiler_io(
            "open offline seed file",
            source.to_string_lossy(),
            source_error,
        )
    })?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .await
        .map_err(|source_error| {
            AppError::compiler_io(
                "stage offline seed file",
                target.to_string_lossy(),
                source_error,
            )
        })?;
    let mut digest = Sha256::new();
    let mut copied = 0_u64;
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer).await.map_err(|source_error| {
            AppError::compiler_io(
                "read offline seed file",
                source.to_string_lossy(),
                source_error,
            )
        })?;
        if read == 0 {
            break;
        }
        copied = copied.checked_add(read as u64).ok_or_else(|| {
            AppError::CompilerWorker("offline seed copy size overflow".to_owned())
        })?;
        if copied > expected_size {
            return Err(AppError::CompilerWorker(format!(
                "offline seed file grew while copying: {}",
                source.to_string_lossy()
            )));
        }
        digest.update(&buffer[..read]);
        output
            .write_all(&buffer[..read])
            .await
            .map_err(|source_error| {
                AppError::compiler_io(
                    "write offline seed file",
                    target.to_string_lossy(),
                    source_error,
                )
            })?;
    }
    output.flush().await.map_err(|source_error| {
        AppError::compiler_io(
            "flush offline seed file",
            target.to_string_lossy(),
            source_error,
        )
    })?;
    if copied != expected_size {
        return Err(AppError::CompilerWorker(format!(
            "offline seed file size changed while copying: {}",
            source.to_string_lossy()
        )));
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn validate_relative_path(path: &str) -> AppResult<()> {
    let candidate = Path::new(path);
    if path.is_empty()
        || path.contains('\0')
        || candidate.is_absolute()
        || candidate
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(AppError::InvalidPath(format!(
            "invalid offline seed path: {path}"
        )));
    }
    Ok(())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn hex_digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(path: &str, bytes: &[u8]) -> String {
        format!(
            "{{\"schemaVersion\":1,\"seedVersion\":\"test-v1\",\"tectonicVersion\":\"0.17.0\",\"totalBytes\":{},\"files\":[{{\"path\":\"{}\",\"size\":{},\"sha256\":\"{}\"}}]}}",
            bytes.len(),
            path,
            bytes.len(),
            hex_digest(bytes)
        )
    }

    async fn write_seed(seed: &Path, relative_path: &str, bytes: &[u8]) {
        let file = seed.join(SEED_FILES_DIRECTORY).join(relative_path);
        fs::create_dir_all(file.parent().unwrap()).await.unwrap();
        fs::write(&file, bytes).await.unwrap();
        fs::write(seed.join(MANIFEST_NAME), manifest(relative_path, bytes))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn atomically_installs_a_verified_seed_once() {
        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let cache = temp.path().join("cache/tectonic");
        fs::create_dir_all(seed.join("files/bundles"))
            .await
            .unwrap();
        fs::write(seed.join("files/bundles/common.bin"), b"seed")
            .await
            .unwrap();
        fs::write(
            seed.join(MANIFEST_NAME),
            manifest("bundles/common.bin", b"seed"),
        )
        .await
        .unwrap();

        let prepared = prepare_at(&cache, &seed).await.unwrap();
        assert!(prepared.status.contains("Installed verified"));
        assert_eq!(
            fs::read(cache.join("bundles/common.bin")).await.unwrap(),
            b"seed"
        );
        let second = prepare_at(&cache, &seed).await.unwrap();
        assert!(second.status.contains("Using verified"));

        fs::write(cache.join(INSTALLED_MARKER_NAME), b"invalid")
            .await
            .unwrap();
        let recovered = prepare_at(&cache, &seed).await.unwrap();
        assert!(recovered.status.contains("existing Tectonic cache"));
    }

    #[tokio::test]
    async fn empty_seed_keeps_network_fallback() {
        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let cache = temp.path().join("cache/tectonic");
        fs::create_dir_all(&seed).await.unwrap();
        fs::write(
            seed.join(MANIFEST_NAME),
            br#"{"schemaVersion":1,"seedVersion":"empty-v1","tectonicVersion":"0.17.0","totalBytes":0,"files":[]}"#,
        )
        .await
        .unwrap();

        let prepared = prepare_at(&cache, &seed).await.unwrap();
        assert!(prepared.status.contains("not staged"));
        assert!(cache.is_dir());
    }

    #[tokio::test]
    async fn rejects_tampered_seed_without_copying_it() {
        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let cache = temp.path().join("cache/tectonic");
        fs::create_dir_all(seed.join("files")).await.unwrap();
        fs::write(seed.join("files/common.bin"), b"tampered")
            .await
            .unwrap();
        fs::write(
            seed.join(MANIFEST_NAME),
            manifest("common.bin", b"expected"),
        )
        .await
        .unwrap();

        let prepared = prepare_at(&cache, &seed).await.unwrap();
        assert!(prepared.status.contains("installation failed"));
        assert!(!cache.join("common.bin").exists());
    }

    #[tokio::test]
    async fn reports_an_empty_packaged_seed_without_claiming_offline_readiness() {
        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let cache = temp.path().join("cache/tectonic");
        fs::create_dir_all(&seed).await.unwrap();
        fs::write(
            seed.join(MANIFEST_NAME),
            br#"{"schemaVersion":1,"seedVersion":"empty-v1","tectonicVersion":"0.17.0","totalBytes":0,"files":[]}"#,
        )
        .await
        .unwrap();

        let status = status_at(&cache, &seed).await;
        assert_eq!(status.seed.integrity, TectonicCacheIntegrity::Empty);
        assert_eq!(status.seed.seed_version.as_deref(), Some("empty-v1"));
        assert!(!status.seed.ready);
        assert_eq!(status.cache.integrity, TectonicCacheIntegrity::Missing);
        assert!(!status.cache_usable);
        assert!(status.network_fallback);
    }

    #[tokio::test]
    async fn detects_and_safely_rebuilds_a_corrupt_installed_seed() {
        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let cache = temp.path().join("cache/tectonic");
        write_seed(&seed, "bundles/common.bin", b"seed").await;

        prepare_at(&cache, &seed).await.unwrap();
        let verified = status_at(&cache, &seed).await;
        assert_eq!(verified.seed.integrity, TectonicCacheIntegrity::Verified);
        assert_eq!(verified.cache.integrity, TectonicCacheIntegrity::Verified);
        assert_eq!(verified.cache.file_count, 1);
        assert_eq!(verified.cache.total_bytes, 4);
        assert!(verified.cache_usable);

        fs::write(cache.join("bundles/common.bin"), b"evil")
            .await
            .unwrap();
        let corrupt = status_at(&cache, &seed).await;
        assert_eq!(corrupt.cache.integrity, TectonicCacheIntegrity::Corrupt);
        assert!(!corrupt.cache.ready);

        reset_at(&cache, &seed).await.unwrap();
        let rebuilt = status_at(&cache, &seed).await;
        assert_eq!(rebuilt.cache.integrity, TectonicCacheIntegrity::Verified);
        assert_eq!(
            fs::read(cache.join("bundles/common.bin")).await.unwrap(),
            b"seed"
        );
        let mut parent_entries = fs::read_dir(cache.parent().unwrap()).await.unwrap();
        while let Some(entry) = parent_entries.next_entry().await.unwrap() {
            assert!(!entry
                .file_name()
                .to_string_lossy()
                .starts_with(".tectonic-cache-reset-"));
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reset_refuses_a_symlink_cache_without_touching_its_target() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let target = temp.path().join("target");
        let cache = temp.path().join("cache/tectonic");
        fs::create_dir_all(cache.parent().unwrap()).await.unwrap();
        fs::create_dir_all(&target).await.unwrap();
        fs::write(target.join("keep"), b"keep").await.unwrap();
        symlink(&target, &cache).unwrap();

        assert!(reset_at(&cache, &seed).await.is_err());
        assert_eq!(fs::read(target.join("keep")).await.unwrap(), b"keep");
    }

    #[tokio::test]
    async fn active_compile_lease_blocks_reset_until_it_is_dropped() {
        let temp = tempfile::tempdir().unwrap();
        let seed = temp.path().join("seed");
        let cache = temp.path().join("cache/tectonic");
        fs::create_dir_all(&seed).await.unwrap();
        fs::write(
            seed.join(MANIFEST_NAME),
            br#"{"schemaVersion":1,"seedVersion":"empty-v1","tectonicVersion":"0.17.0","totalBytes":0,"files":[]}"#,
        )
        .await
        .unwrap();
        let prepared = prepare_guarded_at(&cache, &seed).await.unwrap();
        assert!(prepared.lease.is_some());

        let reset_cache = cache.clone();
        let reset_seed = seed.clone();
        let reset = tokio::spawn(async move { reset_guarded_at(&reset_cache, &reset_seed).await });
        tokio::task::yield_now().await;
        assert!(!reset.is_finished());

        drop(prepared);
        let status = tokio::time::timeout(std::time::Duration::from_secs(1), reset)
            .await
            .expect("reset should resume after compile lease")
            .expect("reset task should not panic")
            .expect("reset should succeed");
        assert_eq!(status.cache.integrity, TectonicCacheIntegrity::Empty);
    }

    #[test]
    fn rejects_traversal_and_oversized_manifests() {
        assert!(validate_relative_path("../escape").is_err());
        assert!(validate_relative_path("/absolute").is_err());
        assert!(validate_relative_path("bundles/common.bin").is_ok());
        let manifest = SeedManifest {
            schema_version: 1,
            seed_version: "v1".to_owned(),
            tectonic_version: TECTONIC_VERSION.to_owned(),
            total_bytes: MAX_SEED_TOTAL_BYTES + 1,
            files: Vec::new(),
        };
        assert!(validate_manifest(&manifest).is_err());
    }
}
