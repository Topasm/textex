use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};

use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    models::{UpdateDownloadEvent, UpdateMetadata},
};

const UPDATE_ENDPOINT: &str =
    "https://github.com/Topasm/textex/releases/latest/download/latest.json";

#[derive(Default)]
pub struct AppUpdaterState {
    pending: Mutex<Option<Update>>,
}

pub async fn check(app: &AppHandle, state: &AppUpdaterState) -> AppResult<Option<UpdateMetadata>> {
    ensure_signing_key()?;
    let endpoint = UPDATE_ENDPOINT
        .parse()
        .map_err(|error| AppError::Updater(format!("invalid update endpoint: {error}")))?;
    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(updater_error)?
        .build()
        .map_err(updater_error)?
        .check()
        .await
        .map_err(updater_error)?;

    let metadata = update.as_ref().map(|update| UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: update.date.map(|date| date.to_string()),
        body: update.body.clone(),
    });
    *state.pending.lock().await = update;
    Ok(metadata)
}

pub async fn download_and_install(
    state: &AppUpdaterState,
    on_event: Channel<UpdateDownloadEvent>,
) -> AppResult<()> {
    ensure_signing_key()?;
    let update = state.pending.lock().await.take().ok_or_else(|| {
        AppError::Updater("no checked update is available; check for updates first".to_owned())
    })?;
    let retry_update = update.clone();
    let started = Arc::new(AtomicBool::new(false));
    let downloaded = Arc::new(AtomicU64::new(0));
    let chunk_channel = on_event.clone();
    let chunk_started = started.clone();
    let chunk_downloaded = downloaded.clone();
    let finish_channel = on_event.clone();
    let finish_started = started.clone();

    let result = update
        .download_and_install(
            move |chunk_length, content_length| {
                if !chunk_started.swap(true, Ordering::Relaxed) {
                    let _ = chunk_channel.send(UpdateDownloadEvent::Started { content_length });
                }
                let chunk_length = u64::try_from(chunk_length).unwrap_or(u64::MAX);
                let downloaded = chunk_downloaded
                    .fetch_add(chunk_length, Ordering::Relaxed)
                    .saturating_add(chunk_length);
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
        )
        .await;

    if let Err(error) = result {
        *state.pending.lock().await = Some(retry_update);
        return Err(updater_error(error));
    }
    let _ = on_event.send(UpdateDownloadEvent::Finished);
    Ok(())
}

fn ensure_signing_key() -> AppResult<()> {
    if updater_public_key().is_empty() {
        return Err(AppError::Updater(
            "this build does not contain TEXTEX_UPDATER_PUBLIC_KEY".to_owned(),
        ));
    }
    Ok(())
}

pub fn updater_public_key() -> &'static str {
    option_env!("TEXTEX_UPDATER_PUBLIC_KEY").unwrap_or("")
}

fn updater_error(error: tauri_plugin_updater::Error) -> AppError {
    AppError::Updater(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_endpoint_is_https_and_static() {
        assert!(UPDATE_ENDPOINT.starts_with("https://"));
        assert!(UPDATE_ENDPOINT.ends_with("/latest.json"));
    }
}
