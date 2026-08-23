use std::{
    mem,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex, MutexGuard, Notify};

use crate::{
    error::{AppError, AppResult},
    models::{UpdateDownloadEvent, UpdateMetadata},
};

const UPDATE_ENDPOINT: &str =
    "https://github.com/Topasm/textex/releases/latest/download/latest.json";
const UPDATE_DOWNLOAD_HOST: &str = "github.com";
const UPDATE_DOWNLOAD_PATH_PREFIX: &str = "/Topasm/textex/releases/download/";
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const CHECK_WALL_TIMEOUT: Duration = Duration::from_secs(35);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_UPDATE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_SIGNATURE_BYTES: usize = 16 * 1024;
const MAX_RELEASE_NOTES_BYTES: usize = 256 * 1024;
const MAX_UPDATE_URL_BYTES: usize = 4 * 1024;
const MAX_VERSION_BYTES: usize = 128;
const MINISIGN_PUBLIC_KEY_BYTES: usize = 42;

pub struct AppUpdaterState {
    operation: Mutex<()>,
    phase: Mutex<UpdaterPhase>,
}

impl Default for AppUpdaterState {
    fn default() -> Self {
        Self {
            operation: Mutex::new(()),
            phase: Mutex::new(UpdaterPhase::Idle),
        }
    }
}

#[derive(Default)]
enum UpdaterPhase {
    #[default]
    Idle,
    Available(Box<Update>),
    Ready(Arc<StagedUpdate>),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UpdaterPhaseKind {
    Idle,
    Available,
    Ready,
}

impl UpdaterPhase {
    fn kind(&self) -> UpdaterPhaseKind {
        match self {
            Self::Idle => UpdaterPhaseKind::Idle,
            Self::Available(_) => UpdaterPhaseKind::Available,
            Self::Ready(_) => UpdaterPhaseKind::Ready,
        }
    }
}

struct StagedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

enum DownloadOutcome {
    Completed(tauri_plugin_updater::Result<Vec<u8>>),
    TimedOut,
    TooLarge,
}

pub async fn check(app: &AppHandle, state: &AppUpdaterState) -> AppResult<Option<UpdateMetadata>> {
    ensure_signing_key()?;
    let _operation = begin_operation(state)?;
    if let Some(metadata) = cached_ready_metadata(state).await {
        return Ok(Some(metadata));
    }

    let endpoint = UPDATE_ENDPOINT
        .parse()
        .map_err(|_| AppError::Updater("the update endpoint is invalid".to_owned()))?;
    let updater = app
        .updater_builder()
        .timeout(CHECK_TIMEOUT)
        .endpoints(vec![endpoint])
        .map_err(|error| updater_error("update check", error))?
        .build()
        .map_err(|error| updater_error("update check", error))?;
    let checked = tokio::time::timeout(CHECK_WALL_TIMEOUT, updater.check())
        .await
        .map_err(|_| AppError::Updater("update check timed out".to_owned()))?
        .map_err(|error| updater_error("update check", error))?;

    let (phase, metadata) = match checked {
        Some(mut update) => {
            validate_release(&update)?;
            // The plugin retains the complete remote JSON, including unknown
            // fields. Only the bounded typed fields below are needed later.
            update.raw_json = serde_json::Value::Null;
            // UpdaterBuilder's timeout covers manifest checks. The plugin's
            // Update value has its own public request timeout for the package.
            update.timeout = Some(DOWNLOAD_TIMEOUT);
            let metadata = metadata(&update);
            (UpdaterPhase::Available(Box::new(update)), Some(metadata))
        }
        None => (UpdaterPhase::Idle, None),
    };
    *state.phase.lock().await = phase;
    Ok(metadata)
}

pub async fn download_and_stage(
    state: &AppUpdaterState,
    on_event: Channel<UpdateDownloadEvent>,
) -> AppResult<()> {
    ensure_signing_key()?;
    let _operation = begin_operation(state)?;
    let update = {
        let phase = state.phase.lock().await;
        match &*phase {
            // Preserve the checked update in state until verified bytes are
            // ready, so cancellation or task teardown remains retry-safe.
            UpdaterPhase::Available(update) => (**update).clone(),
            UpdaterPhase::Ready(_) => {
                let _ = on_event.send(UpdateDownloadEvent::Finished);
                return Ok(());
            }
            UpdaterPhase::Idle => {
                return Err(AppError::Updater(
                    "no checked update is available; check for updates first".to_owned(),
                ));
            }
        }
    };

    let started = Arc::new(AtomicBool::new(false));
    let limit_exceeded = Arc::new(AtomicBool::new(false));
    let limit_notify = Arc::new(Notify::new());
    let chunk_channel = on_event.clone();
    let chunk_started = Arc::clone(&started);
    let chunk_limit_exceeded = Arc::clone(&limit_exceeded);
    let chunk_limit_notify = Arc::clone(&limit_notify);
    let finish_channel = on_event.clone();
    let finish_started = Arc::clone(&started);
    let mut downloaded = 0_u64;

    let outcome = tokio::select! {
        biased;
        _ = limit_notify.notified() => DownloadOutcome::TooLarge,
        result = update.download(
            move |chunk_length, content_length| {
                if !chunk_started.swap(true, Ordering::Relaxed) {
                    let _ = chunk_channel.send(UpdateDownloadEvent::Started { content_length });
                }
                let chunk_length = u64::try_from(chunk_length).unwrap_or(u64::MAX);
                downloaded = downloaded.saturating_add(chunk_length);
                let exceeds_limit = content_length
                    .is_some_and(|length| length > MAX_UPDATE_BYTES)
                    || downloaded > MAX_UPDATE_BYTES;
                if exceeds_limit && !chunk_limit_exceeded.swap(true, Ordering::Release) {
                    chunk_limit_notify.notify_one();
                }
                let _ = chunk_channel.send(UpdateDownloadEvent::Progress {
                    chunk_length,
                    downloaded,
                    content_length,
                });
            },
            move || {
                if !finish_started.swap(true, Ordering::Relaxed) {
                    let _ = finish_channel.send(UpdateDownloadEvent::Started {
                        content_length: None,
                    });
                }
            },
        ) => DownloadOutcome::Completed(result),
        _ = tokio::time::sleep(DOWNLOAD_TIMEOUT) => DownloadOutcome::TimedOut,
    };

    let bytes = match outcome {
        DownloadOutcome::Completed(Ok(bytes))
            if !limit_exceeded.load(Ordering::Acquire)
                && u64::try_from(bytes.len()).unwrap_or(u64::MAX) <= MAX_UPDATE_BYTES =>
        {
            bytes
        }
        DownloadOutcome::Completed(Ok(_)) | DownloadOutcome::TooLarge => {
            return Err(AppError::Updater(format!(
                "update package exceeds the {} MiB safety limit",
                MAX_UPDATE_BYTES / (1024 * 1024)
            )));
        }
        DownloadOutcome::TimedOut => {
            return Err(AppError::Updater("update download timed out".to_owned()));
        }
        DownloadOutcome::Completed(Err(error)) => {
            return Err(updater_error("update download", error));
        }
    };

    *state.phase.lock().await = UpdaterPhase::Ready(Arc::new(StagedUpdate { update, bytes }));
    let _ = on_event.send(UpdateDownloadEvent::Finished);
    Ok(())
}

pub async fn install_and_restart(app: &AppHandle, state: &AppUpdaterState) -> AppResult<()> {
    ensure_signing_key()?;
    let _operation = begin_operation(state)?;
    let staged = {
        let mut phase = state.phase.lock().await;
        match mem::take(&mut *phase) {
            UpdaterPhase::Ready(staged) => staged,
            UpdaterPhase::Available(update) => {
                *phase = UpdaterPhase::Available(update);
                return Err(AppError::Updater(
                    "the checked update must be downloaded before restart".to_owned(),
                ));
            }
            UpdaterPhase::Idle => {
                return Err(AppError::Updater(
                    "no verified update is ready to install".to_owned(),
                ));
            }
        }
    };

    let install_staged = Arc::clone(&staged);
    let result = tauri::async_runtime::spawn_blocking(move || {
        install_staged.update.install(&install_staged.bytes)
    })
    .await;
    match result {
        Ok(Ok(())) => {
            app.request_restart();
            Ok(())
        }
        Ok(Err(error)) => {
            *state.phase.lock().await = UpdaterPhase::Ready(staged);
            Err(updater_error("update installation", error))
        }
        Err(_) => {
            *state.phase.lock().await = UpdaterPhase::Ready(staged);
            Err(AppError::Updater(
                "update installation worker failed".to_owned(),
            ))
        }
    }
}

fn begin_operation(state: &AppUpdaterState) -> AppResult<MutexGuard<'_, ()>> {
    state
        .operation
        .try_lock()
        .map_err(|_| AppError::Updater("another updater operation is already running".to_owned()))
}

async fn cached_ready_metadata(state: &AppUpdaterState) -> Option<UpdateMetadata> {
    let phase = state.phase.lock().await;
    if !should_reuse_check_result(phase.kind()) {
        return None;
    }
    match &*phase {
        UpdaterPhase::Ready(staged) => Some(metadata(&staged.update)),
        UpdaterPhase::Idle | UpdaterPhase::Available(_) => None,
    }
}

fn should_reuse_check_result(kind: UpdaterPhaseKind) -> bool {
    kind == UpdaterPhaseKind::Ready
}

fn metadata(update: &Update) -> UpdateMetadata {
    UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: update.date.as_ref().map(ToString::to_string),
        body: update.body.clone(),
    }
}

fn validate_release(update: &Update) -> AppResult<()> {
    validate_release_fields(
        &update.download_url,
        &update.signature,
        update.body.as_deref(),
        &update.version,
    )
}

fn validate_release_fields(
    download_url: &reqwest::Url,
    signature: &str,
    notes: Option<&str>,
    version: &str,
) -> AppResult<()> {
    if version.is_empty() || version.len() > MAX_VERSION_BYTES {
        return Err(AppError::Updater(
            "the update manifest contains an invalid version".to_owned(),
        ));
    }
    let expected_path_prefix = format!("{UPDATE_DOWNLOAD_PATH_PREFIX}v{version}/");
    let valid_url = download_url.as_str().len() <= MAX_UPDATE_URL_BYTES
        && download_url.scheme() == "https"
        && download_url.username().is_empty()
        && download_url.password().is_none()
        && download_url.port_or_known_default() == Some(443)
        && download_url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case(UPDATE_DOWNLOAD_HOST))
        && download_url.path().starts_with(&expected_path_prefix)
        && download_url.query().is_none()
        && download_url.fragment().is_none();
    if !valid_url {
        return Err(AppError::Updater(
            "the update manifest contains an untrusted download target".to_owned(),
        ));
    }
    if signature.is_empty()
        || signature.trim() != signature
        || signature.len() > MAX_SIGNATURE_BYTES
    {
        return Err(AppError::Updater(
            "the update manifest contains an invalid signature".to_owned(),
        ));
    }
    if notes.is_some_and(|notes| notes.len() > MAX_RELEASE_NOTES_BYTES || notes.contains('\0')) {
        return Err(AppError::Updater(
            "the update manifest release notes exceed the safety limit".to_owned(),
        ));
    }
    Ok(())
}

fn ensure_signing_key() -> AppResult<()> {
    if !valid_signing_key(updater_public_key()) {
        return Err(AppError::Updater(
            "this build does not contain a valid updater signing key".to_owned(),
        ));
    }
    Ok(())
}

fn valid_signing_key(value: &str) -> bool {
    if value.is_empty() || value.trim() != value || value.len() > MAX_SIGNATURE_BYTES {
        return false;
    }
    let Ok(decoded) = BASE64.decode(value) else {
        return false;
    };
    let Ok(text) = std::str::from_utf8(&decoded) else {
        return false;
    };
    let mut lines = text.lines();
    let Some(comment) = lines.next() else {
        return false;
    };
    let Some(encoded_key) = lines.next() else {
        return false;
    };
    if !comment.starts_with("untrusted comment:") || encoded_key.is_empty() {
        return false;
    }
    BASE64.decode(encoded_key).is_ok_and(|key| {
        key.len() == MINISIGN_PUBLIC_KEY_BYTES && matches!(&key[..2], b"Ed" | b"ED")
    })
}

pub fn updater_public_key() -> &'static str {
    option_env!("TEXTEX_UPDATER_PUBLIC_KEY").unwrap_or("")
}

fn updater_error(operation: &'static str, _error: tauri_plugin_updater::Error) -> AppError {
    AppError::Updater(format!("{operation} failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_endpoint_is_https_and_static() {
        assert!(UPDATE_ENDPOINT.starts_with("https://"));
        assert!(UPDATE_ENDPOINT.ends_with("/latest.json"));
    }

    #[test]
    fn signing_key_must_be_a_bounded_encoded_minisign_public_key() {
        let mut key = [7_u8; MINISIGN_PUBLIC_KEY_BYTES];
        key[..2].copy_from_slice(b"Ed");
        let encoded_key = BASE64.encode(key);
        let public_key_file = format!("untrusted comment: TextEx updater\n{encoded_key}\n");
        let encoded_file = BASE64.encode(public_key_file);

        assert!(valid_signing_key(&encoded_file));
        assert!(!valid_signing_key(""));
        assert!(!valid_signing_key("not-base64"));
        assert!(!valid_signing_key(&BASE64.encode("missing key line")));
    }

    #[test]
    fn release_target_is_pinned_to_the_official_https_release_path() {
        let signature = BASE64.encode("signature");
        let official = reqwest::Url::parse(
            "https://github.com/Topasm/textex/releases/download/v1.0.9/win-TextEx.exe",
        )
        .unwrap();
        assert!(validate_release_fields(&official, &signature, Some("notes"), "1.0.9").is_ok());

        for untrusted in [
            "http://github.com/Topasm/textex/releases/download/v1.0.9/update",
            "https://example.invalid/Topasm/textex/releases/download/v1.0.9/update",
            "https://github.com/other/repo/releases/download/v1.0.9/update",
            "https://user@github.com/Topasm/textex/releases/download/v1.0.9/update",
            "https://github.com/Topasm/textex/releases/download/v1.0.9/update?token=value",
        ] {
            let url = reqwest::Url::parse(untrusted).unwrap();
            assert!(validate_release_fields(&url, &signature, None, "1.0.9").is_err());
        }
        assert!(validate_release_fields(&official, "", None, "1.0.9").is_err());
        assert!(validate_release_fields(&official, &signature, None, "1.0.8").is_err());
        assert!(validate_release_fields(&official, &signature, None, &"1".repeat(129)).is_err());
    }

    #[tokio::test]
    async fn updater_operations_fail_fast_when_an_operation_is_active() {
        let state = AppUpdaterState::default();
        let first = begin_operation(&state).expect("first updater operation");
        assert!(begin_operation(&state).is_err());
        drop(first);
        assert!(begin_operation(&state).is_ok());
    }

    #[test]
    fn only_a_verified_staged_update_suppresses_a_fresh_check() {
        assert!(!should_reuse_check_result(UpdaterPhaseKind::Idle));
        assert!(!should_reuse_check_result(UpdaterPhaseKind::Available));
        assert!(should_reuse_check_result(UpdaterPhaseKind::Ready));
    }

    #[test]
    fn plugin_errors_are_redacted_before_crossing_ipc() {
        let sensitive = "https://user:secret@example.invalid/home/alice/update";
        let error = updater_error(
            "update download",
            tauri_plugin_updater::Error::Network(sensitive.to_owned()),
        );
        let rendered = error.to_string();

        assert_eq!(
            rendered,
            "Application updater failed: update download failed"
        );
        assert!(!rendered.contains("secret"));
        assert!(!rendered.contains("alice"));
    }
}
