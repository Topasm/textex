use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError},
        Arc, Condvar, Mutex, MutexGuard, Weak,
    },
    thread,
    time::Duration,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::Channel;

use crate::{
    error::{AppError, AppResult},
    models::{PtyCreateOptions, PtyCreateResult, PtyEvent},
    services::filesystem,
    state::AppState,
};

const MAX_SESSIONS: usize = 4;
const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const MAX_COLS: u16 = 1_000;
const MAX_ROWS: u16 = 1_000;
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_ENV_ENTRIES: usize = 128;
const MAX_ENV_BYTES: usize = 64 * 1024;
const OUTPUT_CHUNK_BYTES: usize = 8 * 1024;
const OUTPUT_QUEUE_CHUNKS: usize = 64;
const TERMINATION_POLL_INTERVAL: Duration = Duration::from_millis(50);
const TERMINATION_WAIT_TIMEOUT: Duration = Duration::from_secs(3);

pub struct PtyState {
    runtime: Arc<PtyRuntime>,
}

struct PtyRuntime {
    sessions: Mutex<HashMap<String, Arc<PtySession>>>,
    next_id: AtomicU64,
}

struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    terminate: SyncSender<()>,
    termination_requested: std::sync::atomic::AtomicBool,
    completion: Arc<PtyCompletion>,
}

struct PtyCompletion {
    finished: Mutex<bool>,
    changed: Condvar,
}

struct SpawnedPty {
    session: Arc<PtySession>,
    reader: Box<dyn Read + Send>,
    child: Box<dyn Child + Send + Sync>,
    terminate: Receiver<()>,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            runtime: Arc::new(PtyRuntime {
                sessions: Mutex::new(HashMap::new()),
                next_id: AtomicU64::new(0),
            }),
        }
    }
}

impl Drop for PtyRuntime {
    fn drop(&mut self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for session in sessions.drain().map(|(_, session)| session) {
                session.request_termination();
            }
        }
    }
}

impl PtySession {
    fn request_termination(&self) {
        if !self.termination_requested.swap(true, Ordering::AcqRel) {
            let _ = self.terminate.try_send(());
        }
    }

    fn terminate_and_wait(&self) {
        self.request_termination();
        if let Ok(finished) = self.completion.finished.lock() {
            if !*finished {
                let _wait_result = self.completion.changed.wait_timeout_while(
                    finished,
                    TERMINATION_WAIT_TIMEOUT,
                    |done| !*done,
                );
            }
        }
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.request_termination();
    }
}

pub async fn create(
    project_state: &AppState,
    state: &PtyState,
    options: PtyCreateOptions,
    on_event: Channel<PtyEvent>,
) -> AppResult<PtyCreateResult> {
    validate_create_options(&options)?;
    let (_, project_epoch, epoch_tracker) = project_state.project_root_epoch()?;
    let cwd = filesystem::resolve_project_directory(project_state, &options.cwd).await?;
    if epoch_tracker.load(Ordering::Acquire) != project_epoch {
        return Err(pty_error(
            "active project changed while the terminal was starting",
        ));
    }
    let size = validated_size(options.cols, options.rows)?;
    let shell = options.shell.clone();
    let env = options.env.clone();

    if state.session_count()? >= MAX_SESSIONS {
        return Err(pty_error(format!(
            "at most {MAX_SESSIONS} terminal sessions may be open"
        )));
    }

    let spawned = tauri::async_runtime::spawn_blocking(move || {
        spawn_terminal(&cwd, size, shell.as_deref(), env)
    })
    .await
    .map_err(|error| pty_error(format!("terminal spawn worker failed: {error}")))??;

    let id = format!(
        "pty-{}",
        state.runtime.next_id.fetch_add(1, Ordering::Relaxed) + 1
    );
    let registration_error = {
        let mut sessions = state.lock_sessions()?;
        if epoch_tracker.load(Ordering::Acquire) != project_epoch {
            Some(pty_error(
                "active project changed while the terminal was starting",
            ))
        } else if sessions.len() >= MAX_SESSIONS {
            Some(pty_error(format!(
                "at most {MAX_SESSIONS} terminal sessions may be open"
            )))
        } else {
            sessions.insert(id.clone(), Arc::clone(&spawned.session));
            None
        }
    };
    if let Some(error) = registration_error {
        terminate_spawned(spawned).await;
        return Err(error);
    }

    start_output_threads(
        Arc::downgrade(&state.runtime),
        id.clone(),
        spawned.reader,
        on_event.clone(),
    );
    start_wait_thread(
        Arc::downgrade(&state.runtime),
        id.clone(),
        spawned.child,
        spawned.terminate,
        Arc::clone(&spawned.session.completion),
        on_event,
    );

    Ok(PtyCreateResult { id })
}

async fn terminate_spawned(mut spawned: SpawnedPty) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let _ = spawned.child.kill();
        let _ = spawned.child.wait();
        mark_pty_complete(&spawned.session.completion);
    })
    .await;
}

pub async fn write(state: &PtyState, id: &str, data: String) -> AppResult<()> {
    validate_session_id(id)?;
    if data.len() > MAX_INPUT_BYTES {
        return Err(pty_error(format!(
            "terminal input exceeds {MAX_INPUT_BYTES} bytes"
        )));
    }
    let session = state.session(id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut writer = lock(&session.writer)?;
        writer
            .write_all(data.as_bytes())
            .and_then(|()| writer.flush())
            .map_err(|error| pty_error(format!("failed to write terminal input: {error}")))
    })
    .await
    .map_err(|error| pty_error(format!("terminal input worker failed: {error}")))?
}

pub async fn resize(state: &PtyState, id: &str, cols: u16, rows: u16) -> AppResult<()> {
    validate_session_id(id)?;
    let size = validated_size(Some(cols), Some(rows))?;
    let session = state.session(id)?;
    tauri::async_runtime::spawn_blocking(move || {
        lock(&session.master)?
            .resize(size)
            .map_err(|error| pty_error(format!("failed to resize terminal: {error}")))
    })
    .await
    .map_err(|error| pty_error(format!("terminal resize worker failed: {error}")))?
}

impl PtyState {
    pub fn dispose(&self, id: &str) -> AppResult<()> {
        validate_session_id(id)?;
        let session = self
            .lock_sessions()?
            .remove(id)
            .ok_or_else(|| pty_error("terminal session does not exist"))?;
        session.terminate_and_wait();
        Ok(())
    }

    pub fn dispose_all(&self) -> AppResult<()> {
        let sessions = self
            .lock_sessions()?
            .drain()
            .map(|(_, session)| session)
            .collect::<Vec<_>>();
        for session in &sessions {
            session.request_termination();
        }
        for session in sessions {
            session.terminate_and_wait();
        }
        Ok(())
    }

    fn session(&self, id: &str) -> AppResult<Arc<PtySession>> {
        self.lock_sessions()?
            .get(id)
            .cloned()
            .ok_or_else(|| pty_error("terminal session does not exist"))
    }

    fn session_count(&self) -> AppResult<usize> {
        Ok(self.lock_sessions()?.len())
    }

    fn lock_sessions(&self) -> AppResult<MutexGuard<'_, HashMap<String, Arc<PtySession>>>> {
        self.runtime
            .sessions
            .lock()
            .map_err(|_| pty_error("terminal session state lock was poisoned"))
    }
}

fn spawn_terminal(
    cwd: &Path,
    size: PtySize,
    shell: Option<&str>,
    env: HashMap<String, String>,
) -> AppResult<SpawnedPty> {
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| pty_error(format!("failed to open pseudo-terminal: {error}")))?;
    let mut command = match shell {
        Some(shell) => CommandBuilder::new(shell),
        None => CommandBuilder::new_default_prog(),
    };
    command.cwd(cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    for (key, value) in env {
        command.env(key, value);
    }

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| pty_error(format!("failed to start terminal shell: {error}")))?;
    drop(pair.slave);
    let reader = match pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(pty_error(format!(
                "failed to open terminal output: {error}"
            )));
        }
    };
    let writer = match pair.master.take_writer() {
        Ok(writer) => writer,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(pty_error(format!("failed to open terminal input: {error}")));
        }
    };
    let (terminate_sender, terminate_receiver) = sync_channel(1);
    let completion = Arc::new(PtyCompletion {
        finished: Mutex::new(false),
        changed: Condvar::new(),
    });
    Ok(SpawnedPty {
        session: Arc::new(PtySession {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            terminate: terminate_sender,
            termination_requested: std::sync::atomic::AtomicBool::new(false),
            completion,
        }),
        reader,
        child,
        terminate: terminate_receiver,
    })
}

fn start_output_threads(
    runtime: Weak<PtyRuntime>,
    id: String,
    mut reader: Box<dyn Read + Send>,
    on_event: Channel<PtyEvent>,
) {
    let (sender, receiver) = sync_channel::<Vec<u8>>(OUTPUT_QUEUE_CHUNKS);
    let dropped = Arc::new(AtomicU64::new(0));
    let reader_dropped = Arc::clone(&dropped);
    thread::spawn(move || {
        let mut buffer = vec![0_u8; OUTPUT_CHUNK_BYTES];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
                Ok(length) => match sender.try_send(buffer[..length].to_vec()) {
                    Ok(()) => {}
                    Err(TrySendError::Full(chunk)) => {
                        reader_dropped.fetch_add(chunk.len() as u64, Ordering::Relaxed);
                    }
                    Err(TrySendError::Disconnected(_)) => break,
                },
            }
        }
    });

    thread::spawn(move || {
        let mut pending_utf8 = Vec::new();
        for chunk in receiver {
            let dropped_bytes = dropped.swap(0, Ordering::Relaxed);
            if dropped_bytes > 0
                && on_event
                    .send(PtyEvent::Overflow {
                        id: id.clone(),
                        dropped_bytes,
                    })
                    .is_err()
            {
                dispose_runtime_session(&runtime, &id);
                return;
            }
            if let Some(data) = decode_pty_output(&mut pending_utf8, &chunk, false) {
                if on_event
                    .send(PtyEvent::Data {
                        id: id.clone(),
                        data,
                    })
                    .is_err()
                {
                    dispose_runtime_session(&runtime, &id);
                    return;
                }
            }
        }
        if let Some(data) = decode_pty_output(&mut pending_utf8, &[], true) {
            let _ = on_event.send(PtyEvent::Data {
                id: id.clone(),
                data,
            });
        }
        let dropped_bytes = dropped.swap(0, Ordering::Relaxed);
        if dropped_bytes > 0 {
            let _ = on_event.send(PtyEvent::Overflow { id, dropped_bytes });
        }
    });
}

fn decode_pty_output(pending: &mut Vec<u8>, chunk: &[u8], final_chunk: bool) -> Option<String> {
    pending.extend_from_slice(chunk);
    let mut decoded = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                decoded.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid_length = error.valid_up_to();
                if valid_length > 0 {
                    decoded.push_str(
                        std::str::from_utf8(&pending[..valid_length])
                            .expect("UTF-8 validator reported a valid prefix"),
                    );
                    pending.drain(..valid_length);
                    continue;
                }
                if let Some(invalid_length) = error.error_len() {
                    decoded.push('\u{fffd}');
                    pending.drain(..invalid_length);
                    continue;
                }
                if final_chunk {
                    decoded.push_str(&String::from_utf8_lossy(pending));
                    pending.clear();
                }
                break;
            }
        }
    }
    (!decoded.is_empty()).then_some(decoded)
}

fn start_wait_thread(
    runtime: Weak<PtyRuntime>,
    id: String,
    mut child: Box<dyn Child + Send + Sync>,
    terminate: Receiver<()>,
    completion: Arc<PtyCompletion>,
    on_event: Channel<PtyEvent>,
) {
    thread::spawn(move || {
        let status = supervise_pty_child(&mut child, &terminate);
        mark_pty_complete(&completion);
        remove_runtime_session(&runtime, &id);
        let (exit_code, signal) = match status {
            Ok(status) => (status.exit_code(), None),
            Err(_) => (1, None),
        };
        let _ = on_event.send(PtyEvent::Exit {
            id,
            exit_code,
            signal,
        });
    });
}

fn supervise_pty_child(
    child: &mut Box<dyn Child + Send + Sync>,
    terminate: &Receiver<()>,
) -> std::io::Result<portable_pty::ExitStatus> {
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        match terminate.recv_timeout(TERMINATION_POLL_INTERVAL) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => {
                // Calling kill on the owning Child (rather than a cloned
                // signaller) gives portable-pty its HUP grace period and
                // force-kill fallback. Always wait afterwards to reap it.
                let _ = child.kill();
                return child.wait();
            }
            Err(RecvTimeoutError::Timeout) => {}
        }
    }
}

fn mark_pty_complete(completion: &PtyCompletion) {
    if let Ok(mut finished) = completion.finished.lock() {
        *finished = true;
        completion.changed.notify_all();
    }
}

fn dispose_runtime_session(runtime: &Weak<PtyRuntime>, id: &str) {
    if let Some(session) = remove_runtime_session(runtime, id) {
        session.request_termination();
    }
}

fn remove_runtime_session(runtime: &Weak<PtyRuntime>, id: &str) -> Option<Arc<PtySession>> {
    runtime
        .upgrade()
        .and_then(|runtime| runtime.sessions.lock().ok()?.remove(id))
}

fn validated_size(cols: Option<u16>, rows: Option<u16>) -> AppResult<PtySize> {
    let cols = cols.unwrap_or(DEFAULT_COLS);
    let rows = rows.unwrap_or(DEFAULT_ROWS);
    if !(1..=MAX_COLS).contains(&cols) || !(1..=MAX_ROWS).contains(&rows) {
        return Err(pty_error(format!(
            "terminal size must be between 1x1 and {MAX_COLS}x{MAX_ROWS}"
        )));
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

fn validate_create_options(options: &PtyCreateOptions) -> AppResult<()> {
    if let Some(shell) = &options.shell {
        if shell.is_empty() || shell.len() > 4_096 || shell.contains('\0') {
            return Err(pty_error("terminal shell path is invalid"));
        }
    }
    if options.env.len() > MAX_ENV_ENTRIES {
        return Err(pty_error(format!(
            "terminal environment exceeds {MAX_ENV_ENTRIES} entries"
        )));
    }
    let mut total_bytes = 0_usize;
    for (key, value) in &options.env {
        total_bytes = total_bytes
            .saturating_add(key.len())
            .saturating_add(value.len());
        if key.is_empty()
            || key.contains('=')
            || key.contains('\0')
            || value.contains('\0')
            || total_bytes > MAX_ENV_BYTES
        {
            return Err(pty_error("terminal environment is invalid or too large"));
        }
    }
    validated_size(options.cols, options.rows)?;
    Ok(())
}

fn validate_session_id(id: &str) -> AppResult<()> {
    let suffix = id
        .strip_prefix("pty-")
        .filter(|suffix| !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit()));
    if suffix.is_none() || id.len() > 32 {
        return Err(pty_error("terminal session ID is invalid"));
    }
    Ok(())
}

fn lock<T>(mutex: &Mutex<T>) -> AppResult<MutexGuard<'_, T>> {
    mutex
        .lock()
        .map_err(|_| pty_error("terminal session lock was poisoned"))
}

fn pty_error(message: impl Into<String>) -> AppError {
    AppError::Pty(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn validates_session_ids() {
        assert!(validate_session_id("pty-42").is_ok());
        assert!(validate_session_id("pty-").is_err());
        assert!(validate_session_id("other-1").is_err());
        assert!(validate_session_id("pty-1/../2").is_err());
    }

    #[test]
    fn bounds_terminal_dimensions() {
        assert_eq!(validated_size(None, None).unwrap().cols, DEFAULT_COLS);
        assert!(validated_size(Some(0), Some(24)).is_err());
        assert!(validated_size(Some(MAX_COLS + 1), Some(24)).is_err());
        assert!(validated_size(Some(80), Some(MAX_ROWS + 1)).is_err());
    }

    #[test]
    fn validates_environment_payloads() {
        let mut options = PtyCreateOptions {
            cwd: "/project".to_owned(),
            ..PtyCreateOptions::default()
        };
        options
            .env
            .insert("LANG".to_owned(), "ko_KR.UTF-8".to_owned());
        assert!(validate_create_options(&options).is_ok());

        options.env.insert("BAD=KEY".to_owned(), "value".to_owned());
        assert!(validate_create_options(&options).is_err());
    }

    #[test]
    fn preserves_utf8_characters_split_between_output_chunks() {
        let bytes = "한글".as_bytes();
        let mut pending = Vec::new();

        assert_eq!(decode_pty_output(&mut pending, &bytes[..2], false), None);
        assert_eq!(
            decode_pty_output(&mut pending, &bytes[2..], false).as_deref(),
            Some("한글")
        );
        assert!(pending.is_empty());
    }

    #[tokio::test]
    async fn rejects_terminal_cwd_outside_active_project() {
        let project = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let project_state = AppState::default();
        project_state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();
        let options = PtyCreateOptions {
            cwd: outside.path().to_string_lossy().into_owned(),
            ..PtyCreateOptions::default()
        };

        let error = create(
            &project_state,
            &PtyState::default(),
            options,
            Channel::new(|_| Ok(())),
        )
        .await
        .unwrap_err();

        assert!(matches!(error, AppError::OutsideProject(_)));
    }

    #[tokio::test]
    async fn rejects_oversized_terminal_input_before_lookup() {
        let error = write(
            &PtyState::default(),
            "pty-1",
            "x".repeat(MAX_INPUT_BYTES + 1),
        )
        .await
        .unwrap_err();

        assert!(matches!(error, AppError::Pty(message) if message.contains("exceeds")));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failed_registration_termination_reaps_the_shell() {
        let directory = tempdir().unwrap();
        let spawned = spawn_terminal(
            directory.path(),
            validated_size(None, None).unwrap(),
            Some("/bin/sh"),
            HashMap::new(),
        )
        .unwrap();
        let process_id = spawned.child.process_id().unwrap();

        terminate_spawned(spawned).await;

        // SAFETY: signal 0 only probes the PID captured from the child.
        let result = unsafe { libc::kill(process_id as libc::pid_t, 0) };
        assert_eq!(result, -1);
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ESRCH)
        );
    }
}
