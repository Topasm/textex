use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Weak,
    },
    time::Duration,
};

use serde_json::Value;
use tauri::{ipc::Channel, AppHandle, Manager};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, ChildStdin, Command},
    sync::Mutex,
    time::timeout,
};

use crate::{
    error::{AppError, AppResult},
    models::{LspEvent, LspStatus},
    services::filesystem,
    state::AppState,
};

const MAX_HEADER_BYTES: usize = 8 * 1024;
// Project files are capped at 50 MiB. Leave JSON-RPC framing headroom so a
// valid editor document cannot silently fail only at the language-server edge.
const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
const MAX_SEND_BYTES: usize = 64 * 1024 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(5);
const STOP_TIMEOUT: Duration = Duration::from_secs(3);
const BUILD_TARGET_TRIPLE: &str = env!("TAURI_ENV_TARGET_TRIPLE");

pub struct LspState {
    inner: Arc<LspInner>,
}

struct LspInner {
    transition: Mutex<()>,
    runtime: Mutex<LspRuntime>,
    next_generation: AtomicU64,
}

struct LspRuntime {
    status: LspStatus,
    session: Option<LspSession>,
    channel: Option<Channel<LspEvent>>,
}

struct LspSession {
    generation: u64,
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    channel: Channel<LspEvent>,
}

#[derive(Debug)]
struct BinaryCandidate {
    program: OsString,
    source: &'static str,
}

impl Default for LspState {
    fn default() -> Self {
        Self {
            inner: Arc::new(LspInner {
                transition: Mutex::new(()),
                runtime: Mutex::new(LspRuntime {
                    status: LspStatus::Stopped,
                    session: None,
                    channel: None,
                }),
                next_generation: AtomicU64::new(0),
            }),
        }
    }
}

pub async fn start(
    app: &AppHandle,
    project_state: &AppState,
    state: &LspState,
    workspace_root: &str,
    on_event: Channel<LspEvent>,
) -> AppResult<bool> {
    let (_, project_epoch, epoch_tracker) = project_state.project_root_epoch()?;
    let workspace = filesystem::resolve_project_directory(project_state, workspace_root).await?;
    let candidates = binary_candidates(app)?;
    let _transition = state.inner.transition.lock().await;
    ensure_project_epoch(project_epoch, &epoch_tracker)?;
    state.stop_locked().await?;
    state
        .set_status_for_project(
            LspStatus::Starting,
            None,
            &on_event,
            project_epoch,
            &epoch_tracker,
        )
        .await?;

    let mut errors = Vec::new();
    for candidate in candidates {
        ensure_project_epoch(project_epoch, &epoch_tracker)?;
        match spawn_candidate(&candidate, &workspace) {
            Ok(mut child) => {
                let (Some(stdin), Some(stdout), Some(stderr)) =
                    (child.stdin.take(), child.stdout.take(), child.stderr.take())
                else {
                    terminate_child(&mut child).await;
                    errors.push(format!("{}: piped stdio was unavailable", candidate.source));
                    continue;
                };
                let generation = state.inner.next_generation.fetch_add(1, Ordering::Relaxed) + 1;
                let stale_child = {
                    let mut runtime = state.inner.runtime.lock().await;
                    if epoch_tracker.load(Ordering::Acquire) != project_epoch {
                        Some(child)
                    } else {
                        runtime.session = Some(LspSession {
                            generation,
                            child,
                            stdin: Arc::new(Mutex::new(stdin)),
                            channel: on_event.clone(),
                        });
                        runtime.channel = Some(on_event.clone());
                        runtime.status = LspStatus::Running;
                        let _ = on_event.send(LspEvent::Status {
                            status: LspStatus::Running,
                            error: None,
                        });
                        None
                    }
                };
                if let Some(mut child) = stale_child {
                    terminate_child(&mut child).await;
                    return Err(lsp_error(
                        "active project changed while TexLab was starting",
                    ));
                }
                spawn_stdout_reader(Arc::downgrade(&state.inner), generation, stdout, on_event);
                spawn_stderr_drain(stderr);
                return Ok(true);
            }
            Err(error) => errors.push(format!("{}: {error}", candidate.source)),
        }
    }

    let message = format!(
        "TexLab is unavailable. Configure TEXTEX_TEXLAB_PATH or install texlab on PATH. {}",
        errors.join("; ")
    );
    state
        .set_status_for_project(
            LspStatus::Error,
            Some(message),
            &on_event,
            project_epoch,
            &epoch_tracker,
        )
        .await?;
    Ok(false)
}

fn ensure_project_epoch(project_epoch: u64, epoch_tracker: &AtomicU64) -> AppResult<()> {
    if epoch_tracker.load(Ordering::Acquire) == project_epoch {
        Ok(())
    } else {
        Err(lsp_error(
            "active project changed while TexLab was starting",
        ))
    }
}

impl LspState {
    pub async fn stop(&self) -> AppResult<()> {
        let _transition = self.inner.transition.lock().await;
        self.stop_locked().await
    }

    async fn stop_locked(&self) -> AppResult<()> {
        let (session, channel) = {
            let mut runtime = self.inner.runtime.lock().await;
            runtime.status = LspStatus::Stopped;
            (runtime.session.take(), runtime.channel.take())
        };
        if let Some(channel) = channel {
            let _ = channel.send(LspEvent::Status {
                status: LspStatus::Stopped,
                error: None,
            });
        }
        if let Some(mut session) = session {
            terminate_child(&mut session.child).await;
        }
        Ok(())
    }

    pub async fn send(&self, message: Value) -> AppResult<()> {
        if !message.is_object() {
            return Err(lsp_error("JSON-RPC payload must be an object"));
        }
        let body = serde_json::to_vec(&message)
            .map_err(|error| lsp_error(format!("failed to encode JSON-RPC payload: {error}")))?;
        if body.len() > MAX_SEND_BYTES {
            return Err(lsp_error(format!(
                "JSON-RPC payload exceeds {MAX_SEND_BYTES} bytes"
            )));
        }
        let stdin = {
            let runtime = self.inner.runtime.lock().await;
            let session = runtime
                .session
                .as_ref()
                .filter(|_| runtime.status == LspStatus::Running)
                .ok_or_else(|| lsp_error("TexLab is not running"))?;
            Arc::clone(&session.stdin)
        };
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        timeout(IO_TIMEOUT, async {
            let mut stdin = stdin.lock().await;
            stdin.write_all(header.as_bytes()).await?;
            stdin.write_all(&body).await?;
            stdin.flush().await
        })
        .await
        .map_err(|_| lsp_error("timed out writing to TexLab"))?
        .map_err(|error| lsp_error(format!("failed to write to TexLab: {error}")))
    }

    pub async fn status(&self) -> LspStatus {
        self.inner.runtime.lock().await.status
    }

    async fn set_status_for_project(
        &self,
        status: LspStatus,
        error: Option<String>,
        channel: &Channel<LspEvent>,
        project_epoch: u64,
        epoch_tracker: &AtomicU64,
    ) -> AppResult<()> {
        let mut runtime = self.inner.runtime.lock().await;
        ensure_project_epoch(project_epoch, epoch_tracker)?;
        runtime.status = status;
        runtime.channel = Some(channel.clone());
        let _ = channel.send(LspEvent::Status { status, error });
        Ok(())
    }
}

fn binary_candidates(app: &AppHandle) -> AppResult<Vec<BinaryCandidate>> {
    let mut candidates = Vec::new();
    if let Some(configured) = std::env::var_os("TEXTEX_TEXLAB_PATH") {
        if configured.is_empty() || configured.to_string_lossy().contains('\0') {
            return Err(lsp_error("TEXTEX_TEXLAB_PATH is invalid"));
        }
        candidates.push(BinaryCandidate {
            program: configured,
            source: "TEXTEX_TEXLAB_PATH",
        });
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?;
    let executable_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    for path in bundled_candidates(&resource_dir, executable_dir.as_deref()) {
        if path.is_file()
            && !candidates
                .iter()
                .any(|item| item.program == path.as_os_str())
        {
            candidates.push(BinaryCandidate {
                program: path.into_os_string(),
                source: "bundled resource",
            });
        }
    }
    candidates.push(BinaryCandidate {
        program: OsString::from(if cfg!(windows) {
            "texlab.exe"
        } else {
            "texlab"
        }),
        source: "PATH",
    });
    Ok(candidates)
}

fn bundled_candidates(resource_dir: &Path, executable_dir: Option<&Path>) -> Vec<PathBuf> {
    let executable = if cfg!(windows) {
        "texlab.exe"
    } else {
        "texlab"
    };
    let arch = std::env::consts::ARCH;
    let platform = match std::env::consts::OS {
        "windows" => "win",
        "macos" => "mac",
        _ => "linux",
    };
    let resource_arch = match arch {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    };
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repository_root = manifest_dir.parent().unwrap_or(manifest_dir);
    let mut candidates = vec![
        resource_dir.join("bin").join(arch).join(executable),
        resource_dir
            .join("bin")
            .join(resource_arch)
            .join(executable),
        resource_dir.join("bin").join(executable),
        resource_dir.join("binaries").join(executable),
        resource_dir.join(executable),
        repository_root
            .join("resources")
            .join("bin")
            .join(platform)
            .join(resource_arch)
            .join(executable),
        repository_root
            .join("resources")
            .join("bin")
            .join(platform)
            .join(executable),
        manifest_dir.join("binaries").join(format!(
            "texlab-{BUILD_TARGET_TRIPLE}{}",
            if cfg!(windows) { ".exe" } else { "" }
        )),
    ];
    if let Some(executable_dir) = executable_dir {
        candidates.push(executable_dir.join(executable));
    }
    candidates
}

fn spawn_candidate(candidate: &BinaryCandidate, workspace: &Path) -> std::io::Result<Child> {
    let mut command = Command::new(&candidate.program);
    command
        .current_dir(workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    isolate_process_group(&mut command);
    command.spawn()
}

fn spawn_stdout_reader<R>(
    inner: Weak<LspInner>,
    generation: u64,
    stdout: R,
    channel: Channel<LspEvent>,
) where
    R: AsyncRead + Unpin + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        let result = read_messages(stdout, |message| {
            channel
                .send(LspEvent::Message { message })
                .map_err(|error| lsp_error(format!("failed to deliver TexLab message: {error}")))
        })
        .await;
        if let Some(inner) = inner.upgrade() {
            let message = match result {
                Ok(()) => "TexLab exited unexpectedly".to_owned(),
                Err(error) => error.to_string(),
            };
            fail_session(&inner, generation, message).await;
        }
    });
}

fn spawn_stderr_drain<R>(mut stderr: R)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        let mut buffer = [0_u8; 8 * 1024];
        loop {
            match stderr.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
        }
    });
}

async fn read_messages<R, F>(mut reader: R, mut deliver: F) -> AppResult<()>
where
    R: AsyncRead + Unpin,
    F: FnMut(Value) -> AppResult<()>,
{
    let mut incoming = [0_u8; 16 * 1024];
    let mut buffer = Vec::new();
    loop {
        let read = reader
            .read(&mut incoming)
            .await
            .map_err(|error| lsp_error(format!("failed to read TexLab output: {error}")))?;
        if read == 0 {
            return Ok(());
        }
        buffer.extend_from_slice(&incoming[..read]);
        parse_frames(&mut buffer, &mut deliver)?;
    }
}

fn parse_frames<F>(buffer: &mut Vec<u8>, deliver: &mut F) -> AppResult<()>
where
    F: FnMut(Value) -> AppResult<()>,
{
    loop {
        let Some(header_end) = find_bytes(buffer, b"\r\n\r\n") else {
            if buffer.len() > MAX_HEADER_BYTES {
                return Err(lsp_error("TexLab JSON-RPC header is too large"));
            }
            return Ok(());
        };
        if header_end > MAX_HEADER_BYTES {
            return Err(lsp_error("TexLab JSON-RPC header is too large"));
        }
        let header = std::str::from_utf8(&buffer[..header_end])
            .map_err(|_| lsp_error("TexLab JSON-RPC header is not UTF-8"))?;
        let length = parse_content_length(header)?;
        if length > MAX_MESSAGE_BYTES {
            return Err(lsp_error(format!(
                "TexLab JSON-RPC message exceeds {MAX_MESSAGE_BYTES} bytes"
            )));
        }
        let body_start = header_end + 4;
        let frame_end = body_start
            .checked_add(length)
            .ok_or_else(|| lsp_error("TexLab JSON-RPC length overflow"))?;
        if buffer.len() < frame_end {
            if buffer.len() > MAX_HEADER_BYTES + MAX_MESSAGE_BYTES + 4 {
                return Err(lsp_error("TexLab JSON-RPC buffer is too large"));
            }
            return Ok(());
        }
        let message: Value = serde_json::from_slice(&buffer[body_start..frame_end])
            .map_err(|error| lsp_error(format!("invalid TexLab JSON-RPC message: {error}")))?;
        if !message.is_object() {
            return Err(lsp_error("TexLab JSON-RPC message must be an object"));
        }
        deliver(message)?;
        buffer.drain(..frame_end);
    }
}

fn parse_content_length(header: &str) -> AppResult<usize> {
    let mut value = None;
    for line in header.split("\r\n") {
        let Some((name, raw_value)) = line.split_once(':') else {
            return Err(lsp_error("malformed TexLab JSON-RPC header"));
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            if value.is_some() {
                return Err(lsp_error("duplicate TexLab Content-Length header"));
            }
            value = Some(
                raw_value
                    .trim()
                    .parse::<usize>()
                    .map_err(|_| lsp_error("invalid TexLab Content-Length header"))?,
            );
        }
    }
    value.ok_or_else(|| lsp_error("TexLab Content-Length header is missing"))
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

async fn fail_session(inner: &LspInner, generation: u64, error: String) {
    let session = {
        let mut runtime = inner.runtime.lock().await;
        if runtime
            .session
            .as_ref()
            .is_none_or(|session| session.generation != generation)
        {
            return;
        }
        runtime.status = LspStatus::Error;
        let session = runtime.session.take();
        runtime.channel = None;
        session
    };
    if let Some(mut session) = session {
        let _ = session.channel.send(LspEvent::Status {
            status: LspStatus::Error,
            error: Some(error),
        });
        terminate_child(&mut session.child).await;
    }
}

async fn terminate_child(child: &mut Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }
    let _ = terminate_running_child(child).await;
    if timeout(STOP_TIMEOUT, child.wait()).await.is_err() {
        let _ = child.start_kill();
        let _ = child.wait().await;
    }
}

#[cfg(unix)]
fn isolate_process_group(command: &mut Command) {
    command.process_group(0);
}

#[cfg(not(unix))]
fn isolate_process_group(_command: &mut Command) {}

#[cfg(unix)]
async fn terminate_running_child(child: &mut Child) -> io::Result<()> {
    let process_group_id = child
        .id()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "TexLab process has no PID"))?;
    let process_group_id = libc::pid_t::try_from(process_group_id)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "TexLab PID is out of range"))?;
    // SAFETY: the PID comes from the live child and is negated intentionally to
    // address the isolated process group created before spawn.
    let result = unsafe { libc::kill(-process_group_id, libc::SIGKILL) };
    if result == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        Ok(())
    } else {
        Err(error)
    }
}

#[cfg(not(unix))]
async fn terminate_running_child(child: &mut Child) -> io::Result<()> {
    child.kill().await
}

fn lsp_error(message: impl Into<String>) -> AppError {
    AppError::Lsp(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_partial_and_multiple_json_rpc_frames() {
        let first = br#"{"jsonrpc":"2.0","id":1,"result":null}"#;
        let second = br#"{"jsonrpc":"2.0","method":"window/logMessage"}"#;
        let bytes = [
            format!("Content-Length: {}\r\n\r\n", first.len()).into_bytes(),
            first.to_vec(),
            format!("Content-Length: {}\r\n\r\n", second.len()).into_bytes(),
            second.to_vec(),
        ]
        .concat();
        let mut buffer = bytes[..12].to_vec();
        let mut messages = Vec::new();
        parse_frames(&mut buffer, &mut |message| {
            messages.push(message);
            Ok(())
        })
        .unwrap();
        assert!(messages.is_empty());
        buffer.extend_from_slice(&bytes[12..]);
        parse_frames(&mut buffer, &mut |message| {
            messages.push(message);
            Ok(())
        })
        .unwrap();
        assert_eq!(messages.len(), 2);
        assert!(buffer.is_empty());
    }

    #[test]
    fn rejects_oversized_and_malformed_frames() {
        let mut oversized =
            format!("Content-Length: {}\r\n\r\n", MAX_MESSAGE_BYTES + 1).into_bytes();
        assert!(parse_frames(&mut oversized, &mut |_| Ok(())).is_err());

        let mut missing = b"Content-Type: application/json\r\n\r\n{}".to_vec();
        assert!(parse_frames(&mut missing, &mut |_| Ok(())).is_err());
    }

    #[test]
    fn bundled_paths_cover_arch_specific_and_flat_layouts() {
        let paths = bundled_candidates(Path::new("/resources"), Some(Path::new("/app")));
        assert!(paths.iter().any(|path| path.ends_with("bin/texlab")));
        assert!(paths.iter().any(|path| path.ends_with("binaries/texlab")));
    }
}
