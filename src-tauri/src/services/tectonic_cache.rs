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
static STAGE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

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
}

pub async fn prepare(app: &AppHandle) -> AppResult<PreparedCache> {
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
    prepare_at(&cache_dir, &seed_dir).await
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
        });
    }

    let seed = match load_seed(seed_dir).await {
        Ok(Some(seed)) => seed,
        Ok(None) => {
            ensure_directory(cache_dir).await?;
            return Ok(PreparedCache {
                path: cache_dir.to_path_buf(),
                status: "Tectonic offline seed is not staged; using the local cache with network fallback for missing support files.\n".to_owned(),
            });
        }
        Err(error) => {
            ensure_directory(cache_dir).await?;
            return Ok(PreparedCache {
                path: cache_dir.to_path_buf(),
                status: format!(
                    "Tectonic offline seed was rejected ({error}); using network fallback for missing support files.\n"
                ),
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
        }),
        Err(source) => {
            let _ = fs::remove_dir_all(&stage).await;
            if fs::symlink_metadata(cache_dir).await.is_ok() {
                ensure_directory(cache_dir).await?;
                Ok(PreparedCache {
                    path: cache_dir.to_path_buf(),
                    status: "Another compiler initialized the Tectonic cache first; preserving that cache and retaining network fallback.\n".to_owned(),
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
