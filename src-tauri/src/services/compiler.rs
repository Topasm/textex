use std::{
    ffi::OsStr,
    io,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    time::Duration,
};

use tauri::{ipc::Channel, AppHandle, Manager};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, BufReader},
    process::{Child, Command},
    sync::oneshot,
    task::JoinHandle,
};

use crate::{
    error::{AppError, AppResult},
    models::{CompileEvent, CompileIdentity, CompileRequest, CompileResponse, CompileStage},
    state::AppState,
};

const TECTONIC_BASENAME: &str = "tectonic";
const COMPILE_TIMEOUT: Duration = Duration::from_secs(120);
const BUILD_TARGET_TRIPLE: &str = env!("TAURI_ENV_TARGET_TRIPLE");
const MAX_JAVASCRIPT_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RuntimeMode {
    Development,
    Packaged,
}

enum ChildOutcome {
    Exited(ExitStatus),
    Cancelled,
    TimedOut,
}

pub async fn compile_latex(
    app: &AppHandle,
    state: &AppState,
    request: CompileRequest,
    on_event: Channel<CompileEvent>,
) -> AppResult<CompileResponse> {
    validate_compile_request(&request)?;
    let identity = request.identity();
    let selected_tex_path = validate_project_tex_file(state, &request.file_path).await?;
    let tex_path = resolve_magic_root(state, &selected_tex_path).await?;
    let display_tex_path = path_to_string(&tex_path)?;
    let tectonic_path = resolve_tectonic_executable(app)?;
    let cache_dir = prepare_cache_directory(app).await?;
    let mut lease = state.begin_compilation(&request).await?;

    send_progress(
        &on_event,
        identity.clone(),
        CompileStage::Compiling,
        display_tex_path.clone(),
    );

    let result = run_tectonic(
        &tectonic_path,
        &tex_path,
        &cache_dir,
        identity.clone(),
        on_event.clone(),
        lease.cancel_receiver(),
        COMPILE_TIMEOUT,
    )
    .await;

    match &result {
        Ok(_) => send_progress(
            &on_event,
            identity.clone(),
            CompileStage::Done,
            display_tex_path.clone(),
        ),
        Err(AppError::CompilationCancelled) => send_progress(
            &on_event,
            identity.clone(),
            CompileStage::Cancelled,
            display_tex_path.clone(),
        ),
        Err(AppError::CompilationTimedOut { .. }) => send_progress(
            &on_event,
            identity.clone(),
            CompileStage::TimedOut,
            display_tex_path.clone(),
        ),
        Err(_) => send_progress(
            &on_event,
            identity.clone(),
            CompileStage::Failed,
            display_tex_path.clone(),
        ),
    }

    result.map(|pdf_path| CompileResponse {
        identity,
        pdf_path,
        compiled_file_path: display_tex_path,
    })
}

fn validate_compile_request(request: &CompileRequest) -> AppResult<()> {
    if request.request_id == 0 || request.request_id > MAX_JAVASCRIPT_SAFE_INTEGER {
        return Err(AppError::InvalidPath(
            "compile requestId must be a positive JavaScript-safe integer".to_owned(),
        ));
    }
    if request.document_id.is_empty() || request.document_id.contains('\0') {
        return Err(AppError::InvalidPath(
            "compile documentId must be a non-empty string without NUL bytes".to_owned(),
        ));
    }
    if request.document_revision > MAX_JAVASCRIPT_SAFE_INTEGER {
        return Err(AppError::InvalidPath(
            "compile documentRevision must be a JavaScript-safe integer".to_owned(),
        ));
    }
    Ok(())
}

pub fn cancel_compile(state: &AppState) -> AppResult<bool> {
    state.cancel_compilation()
}

async fn run_tectonic(
    tectonic_path: &Path,
    tex_path: &Path,
    cache_dir: &Path,
    identity: CompileIdentity,
    on_event: Channel<CompileEvent>,
    cancel_receiver: &mut oneshot::Receiver<()>,
    timeout: Duration,
) -> AppResult<String> {
    let working_directory = tex_path.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "compile input has no parent directory: {}",
            tex_path.to_string_lossy()
        ))
    })?;
    let display_tectonic_path = tectonic_path.to_string_lossy().into_owned();

    let mut command = Command::new(tectonic_path);
    command
        .arg("-X")
        .arg("compile")
        .arg("--synctex")
        .arg(tex_path)
        .current_dir(working_directory)
        .env("TECTONIC_CACHE_DIR", cache_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    isolate_process_group(&mut command);

    let child = command
        .spawn()
        .map_err(|source| AppError::compiler_io("start", display_tectonic_path.clone(), source))?;
    let status = monitor_child(
        child,
        cancel_receiver,
        timeout,
        identity,
        on_event,
        &display_tectonic_path,
    )
    .await?;

    if !status.success() {
        return Err(AppError::CompilerFailed {
            status: format_exit_status(status),
        });
    }

    let pdf_path = tex_path.with_extension("pdf");
    let display_pdf_path = path_to_string(&pdf_path)?;
    match fs::metadata(&pdf_path).await {
        Ok(metadata) if metadata.is_file() => Ok(display_pdf_path),
        Ok(_) => Err(AppError::CompiledPdfMissing(display_pdf_path)),
        Err(source) if source.kind() == io::ErrorKind::NotFound => {
            Err(AppError::CompiledPdfMissing(display_pdf_path))
        }
        Err(source) => Err(AppError::compiler_io(
            "inspect generated PDF",
            display_pdf_path,
            source,
        )),
    }
}

async fn monitor_child(
    mut child: Child,
    cancel_receiver: &mut oneshot::Receiver<()>,
    timeout: Duration,
    identity: CompileIdentity,
    on_event: Channel<CompileEvent>,
    display_tectonic_path: &str,
) -> AppResult<ExitStatus> {
    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::CompilerWorker("Tectonic stdout pipe was not created".to_owned())
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::CompilerWorker("Tectonic stderr pipe was not created".to_owned())
    })?;

    let stdout_task = tokio::spawn(forward_output(stdout, identity.clone(), on_event.clone()));
    let stderr_task = tokio::spawn(forward_output(stderr, identity, on_event));

    let outcome = tokio::select! {
        status = child.wait() => {
            ChildOutcome::Exited(status.map_err(|source| {
                AppError::compiler_io("wait for", display_tectonic_path, source)
            })?)
        }
        _ = cancel_receiver => {
            terminate_child(&mut child, display_tectonic_path).await?;
            ChildOutcome::Cancelled
        }
        _ = tokio::time::sleep(timeout) => {
            terminate_child(&mut child, display_tectonic_path).await?;
            ChildOutcome::TimedOut
        }
    };

    join_output_tasks(stdout_task, stderr_task, display_tectonic_path).await?;

    match outcome {
        ChildOutcome::Exited(status) => Ok(status),
        ChildOutcome::Cancelled => Err(AppError::CompilationCancelled),
        ChildOutcome::TimedOut => Err(AppError::CompilationTimedOut {
            seconds: timeout.as_secs(),
        }),
    }
}

async fn terminate_child(child: &mut Child, display_tectonic_path: &str) -> AppResult<()> {
    match child.try_wait() {
        Ok(Some(_)) => return Ok(()),
        Ok(None) => {}
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect",
                display_tectonic_path,
                source,
            ));
        }
    }

    if let Err(source) = terminate_running_child(child).await {
        // The process may have exited between try_wait and kill. Only suppress
        // the error if a subsequent non-blocking wait confirms that outcome.
        if child.try_wait().ok().flatten().is_none() {
            return Err(AppError::compiler_io(
                "terminate",
                display_tectonic_path,
                source,
            ));
        }
    }

    child
        .wait()
        .await
        .map_err(|source| AppError::compiler_io("reap", display_tectonic_path, source))?;
    Ok(())
}

#[cfg(unix)]
fn isolate_process_group(command: &mut Command) {
    // Tectonic can start helper processes which inherit its stdout/stderr
    // pipes. Giving the compiler its own process group lets cancellation kill
    // the complete tree instead of leaving a descendant holding those pipes
    // open after the direct child has been reaped.
    command.process_group(0);
}

#[cfg(not(unix))]
fn isolate_process_group(_command: &mut Command) {}

#[cfg(unix)]
async fn terminate_running_child(child: &mut Child) -> io::Result<()> {
    let process_group_id = child.id().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "compiler process has no process-group ID",
        )
    })?;
    let process_group_id = libc::pid_t::try_from(process_group_id).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "compiler process-group ID exceeds the platform PID range",
        )
    })?;

    // A negative PID addresses a Unix process group. The direct child is the
    // group leader because `isolate_process_group` configured PGID 0 before
    // spawn, so this signal also terminates helpers that inherited its pipes.
    // SAFETY: `kill` only reads the integer process-group ID. The ID came
    // directly from the live child handle and is negated intentionally to
    // target the isolated compiler process group.
    let result = unsafe { libc::kill(-process_group_id, libc::SIGKILL) };
    if result == 0 {
        return Ok(());
    }

    let source = io::Error::last_os_error();
    if source.raw_os_error() == Some(libc::ESRCH) {
        // The process tree may have exited between try_wait and kill. Let the
        // caller's follow-up wait reap the direct child.
        Ok(())
    } else {
        Err(source)
    }
}

#[cfg(not(unix))]
async fn terminate_running_child(child: &mut Child) -> io::Result<()> {
    child.kill().await
}

async fn forward_output<R>(
    output: R,
    identity: CompileIdentity,
    on_event: Channel<CompileEvent>,
) -> io::Result<()>
where
    R: AsyncRead + Unpin,
{
    let mut reader = BufReader::new(output);
    let mut buffer = Vec::with_capacity(4096);

    loop {
        buffer.clear();
        let read = reader.read_until(b'\n', &mut buffer).await?;
        if read == 0 {
            return Ok(());
        }

        // A closed renderer channel must not turn a successful compilation
        // into a failure, so channel delivery is intentionally best-effort.
        let _ = on_event.send(CompileEvent::Log {
            identity: identity.clone(),
            text: String::from_utf8_lossy(&buffer).into_owned(),
        });
    }
}

async fn join_output_tasks(
    stdout_task: JoinHandle<io::Result<()>>,
    stderr_task: JoinHandle<io::Result<()>>,
    display_tectonic_path: &str,
) -> AppResult<()> {
    let (stdout_result, stderr_result) = tokio::join!(stdout_task, stderr_task);
    finish_output_task(stdout_result, "read stdout from", display_tectonic_path)?;
    finish_output_task(stderr_result, "read stderr from", display_tectonic_path)?;
    Ok(())
}

fn finish_output_task(
    result: Result<io::Result<()>, tokio::task::JoinError>,
    operation: &'static str,
    display_tectonic_path: &str,
) -> AppResult<()> {
    result
        .map_err(|error| AppError::CompilerWorker(error.to_string()))?
        .map_err(|source| AppError::compiler_io(operation, display_tectonic_path, source))
}

fn send_progress(
    on_event: &Channel<CompileEvent>,
    identity: CompileIdentity,
    stage: CompileStage,
    file_path: String,
) {
    let _ = on_event.send(CompileEvent::Progress {
        identity,
        stage,
        file_path,
    });
}

async fn prepare_cache_directory(app: &AppHandle) -> AppResult<PathBuf> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?
        .join("tectonic");
    let display_cache_dir = cache_dir.to_string_lossy().into_owned();
    fs::create_dir_all(&cache_dir).await.map_err(|source| {
        AppError::compiler_io("create cache directory for", display_cache_dir, source)
    })?;
    Ok(cache_dir)
}

async fn validate_project_tex_file(state: &AppState, file_path: &str) -> AppResult<PathBuf> {
    if file_path.is_empty() || file_path.contains('\0') {
        return Err(AppError::InvalidPath(file_path.to_owned()));
    }

    let requested = PathBuf::from(file_path);
    if !requested.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "compile input must be absolute: {}",
            requested.to_string_lossy()
        )));
    }
    if !requested
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("tex"))
    {
        return Err(AppError::InvalidPath(format!(
            "only .tex files can be compiled: {}",
            requested.to_string_lossy()
        )));
    }

    let display_requested = requested.to_string_lossy().into_owned();
    let canonical = tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(requested))
        .await
        .map_err(|error| AppError::CompilerWorker(error.to_string()))?
        .map_err(|source| AppError::io("resolve compile input", display_requested, source))?;
    let project_root = state.project_root()?;
    if !path_is_within(&project_root, &canonical) {
        return Err(AppError::OutsideProject(
            canonical.to_string_lossy().into_owned(),
        ));
    }

    let display_canonical = path_to_string(&canonical)?;
    let metadata = fs::metadata(&canonical).await.map_err(|source| {
        AppError::io("inspect compile input", display_canonical.clone(), source)
    })?;
    if !metadata.is_file() {
        return Err(AppError::NotAFile(display_canonical));
    }

    Ok(canonical)
}

async fn resolve_magic_root(state: &AppState, selected_tex_path: &Path) -> AppResult<PathBuf> {
    let display_selected_path = path_to_string(selected_tex_path)?;
    let file = fs::File::open(selected_tex_path).await.map_err(|source| {
        AppError::io("read compile input", display_selected_path.clone(), source)
    })?;
    let mut prefix = Vec::with_capacity(500);
    file.take(500)
        .read_to_end(&mut prefix)
        .await
        .map_err(|source| AppError::io("read compile input", display_selected_path, source))?;

    let Some(root_value) = extract_magic_root(&String::from_utf8_lossy(&prefix)) else {
        return Ok(selected_tex_path.to_path_buf());
    };
    let parent = selected_tex_path.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "compile input has no parent directory: {}",
            selected_tex_path.to_string_lossy()
        ))
    })?;
    let requested_root = parent.join(root_value);
    let requested_root = path_to_string(&requested_root)?;
    validate_project_tex_file(state, &requested_root).await
}

fn extract_magic_root(prefix: &str) -> Option<String> {
    for line in prefix.lines().take(5) {
        let lowercase = line.to_ascii_lowercase();
        let Some(marker) = lowercase.find("%!") else {
            continue;
        };
        let Some(after_marker) = line.get(marker + 2..) else {
            continue;
        };
        let Some(after_tex) = strip_ascii_keyword(after_marker.trim_start(), "tex") else {
            continue;
        };
        if !after_tex.chars().next().is_some_and(char::is_whitespace) {
            continue;
        }
        let after_tex = after_tex.trim_start();
        let after_root = match strip_ascii_keyword(after_tex, "root") {
            Some(value) => value.trim_start(),
            None => continue,
        };
        let value = match after_root.strip_prefix('=') {
            Some(value) => value.trim(),
            None => continue,
        };
        let value = value.replace(['"', '\''], "").trim().to_owned();
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

fn strip_ascii_keyword<'a>(value: &'a str, keyword: &str) -> Option<&'a str> {
    let prefix = value.get(..keyword.len())?;
    prefix
        .eq_ignore_ascii_case(keyword)
        .then(|| &value[keyword.len()..])
}

fn resolve_tectonic_executable(app: &AppHandle) -> AppResult<PathBuf> {
    let runtime_mode = if cfg!(debug_assertions) {
        RuntimeMode::Development
    } else {
        RuntimeMode::Packaged
    };

    let candidates = match runtime_mode {
        RuntimeMode::Development => development_candidates(
            Path::new(env!("CARGO_MANIFEST_DIR")),
            std::env::consts::OS,
            std::env::consts::ARCH,
            BUILD_TARGET_TRIPLE,
        ),
        RuntimeMode::Packaged => {
            let executable = std::env::current_exe()
                .map_err(|error| AppError::RuntimePath(error.to_string()))?;
            let executable_dir = executable.parent().ok_or_else(|| {
                AppError::RuntimePath(format!(
                    "application executable has no parent: {}",
                    executable.to_string_lossy()
                ))
            })?;
            let resource_dir = app.path().resource_dir().ok();
            packaged_candidates(
                executable_dir,
                resource_dir.as_deref(),
                std::env::consts::OS,
                std::env::consts::ARCH,
            )
        }
    };

    candidates
        .iter()
        .find(|candidate| candidate.is_file())
        .cloned()
        .ok_or_else(|| AppError::CompilerNotFound {
            checked_paths: candidates
                .iter()
                .map(|path| path.to_string_lossy())
                .collect::<Vec<_>>()
                .join(", "),
        })
}

fn development_candidates(
    manifest_dir: &Path,
    os: &str,
    arch: &str,
    target_triple: &str,
) -> Vec<PathBuf> {
    let repository_root = manifest_dir.parent().unwrap_or(manifest_dir);
    let executable_name = executable_name(os);
    let platform_resources = repository_root
        .join("resources")
        .join("bin")
        .join(platform_resource_directory(os));
    let mut candidates = Vec::new();

    push_unique(
        &mut candidates,
        platform_resources
            .join(resource_architecture_directory(arch))
            .join(&executable_name),
    );
    push_unique(&mut candidates, platform_resources.join(&executable_name));
    // `bundle.externalBin = ["binaries/tectonic"]` expects this target-suffixed
    // source name. It is a final development fallback after the canonical
    // resources/bin/<platform> layout used by the existing application.
    push_unique(
        &mut candidates,
        manifest_dir
            .join("binaries")
            .join(sidecar_source_filename(target_triple)),
    );

    candidates
}

fn packaged_candidates(
    executable_dir: &Path,
    resource_dir: Option<&Path>,
    os: &str,
    arch: &str,
) -> Vec<PathBuf> {
    let executable_name = executable_name(os);
    let mut candidates = Vec::new();

    // Tauri externalBin sidecars are copied beside the packaged app binary
    // with the target-triple suffix removed.
    push_unique(&mut candidates, executable_dir.join(&executable_name));

    if let Some(resource_dir) = resource_dir {
        // Also accept an explicitly bundled resource layout, which is useful
        // while Electron and Tauri packaging coexist.
        push_unique(&mut candidates, resource_dir.join(&executable_name));
        push_unique(
            &mut candidates,
            resource_dir
                .join("bin")
                .join(resource_architecture_directory(arch))
                .join(&executable_name),
        );
        push_unique(
            &mut candidates,
            resource_dir.join("bin").join(&executable_name),
        );
    }

    candidates
}

pub(crate) fn sidecar_source_filename(target_triple: &str) -> String {
    let extension = if target_triple.contains("windows") {
        ".exe"
    } else {
        ""
    };
    format!("{TECTONIC_BASENAME}-{target_triple}{extension}")
}

fn executable_name(os: &str) -> String {
    if os == "windows" {
        format!("{TECTONIC_BASENAME}.exe")
    } else {
        TECTONIC_BASENAME.to_owned()
    }
}

fn platform_resource_directory(os: &str) -> &str {
    match os {
        "windows" => "win",
        "macos" => "mac",
        _ => "linux",
    }
}

fn resource_architecture_directory(arch: &str) -> &str {
    match arch {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    }
}

fn push_unique(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.contains(&candidate) {
        paths.push(candidate);
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

fn path_to_string(path: &Path) -> AppResult<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::NonUtf8Path(path.to_string_lossy().into_owned()))
}

fn format_exit_status(status: ExitStatus) -> String {
    status
        .code()
        .map_or_else(|| status.to_string(), |code| format!("exit code {code}"))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    #[cfg(unix)]
    use std::{process::Stdio, time::Instant};

    use super::{
        development_candidates, extract_magic_root, packaged_candidates, resolve_magic_root,
        sidecar_source_filename, validate_compile_request, validate_project_tex_file,
    };
    #[cfg(unix)]
    use super::{isolate_process_group, monitor_child};
    #[cfg(unix)]
    use crate::models::CompileIdentity;
    use crate::models::{CompilePriority, CompileRequest};
    use crate::{error::AppError, state::AppState};
    #[cfg(unix)]
    use tauri::ipc::Channel;
    #[cfg(unix)]
    use tokio::{process::Command, sync::oneshot, time::Duration};

    #[test]
    fn target_specific_sidecar_filenames_match_tauri_convention() {
        assert_eq!(
            sidecar_source_filename("aarch64-apple-darwin"),
            "tectonic-aarch64-apple-darwin"
        );
        assert_eq!(
            sidecar_source_filename("x86_64-unknown-linux-musl"),
            "tectonic-x86_64-unknown-linux-musl"
        );
        assert_eq!(
            sidecar_source_filename("x86_64-pc-windows-msvc"),
            "tectonic-x86_64-pc-windows-msvc.exe"
        );
    }

    #[test]
    fn validates_shared_compile_identity_fields() {
        let mut request = CompileRequest {
            request_id: 1,
            document_id: "document-1".to_owned(),
            document_revision: 0,
            file_path: "/project/main.tex".to_owned(),
            priority: CompilePriority::Normal,
        };
        validate_compile_request(&request).expect("valid request");

        request.request_id = 0;
        assert!(matches!(
            validate_compile_request(&request),
            Err(AppError::InvalidPath(_))
        ));
        request.request_id = 1;
        request.document_id.clear();
        assert!(matches!(
            validate_compile_request(&request),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn extracts_magic_root_from_the_first_five_lines() {
        assert_eq!(
            extract_magic_root("% comment\n%! TeX root = '../main.tex'\ncontent"),
            Some("../main.tex".to_owned())
        );
        assert_eq!(
            extract_magic_root("1\n2\n3\n4\n5\n%! TeX root = main.tex"),
            None
        );
    }

    #[test]
    fn development_resolution_prefers_existing_resource_layout() {
        let candidates = development_candidates(
            Path::new("/workspace/src-tauri"),
            "macos",
            "aarch64",
            "aarch64-apple-darwin",
        );
        assert_eq!(
            candidates,
            vec![
                Path::new("/workspace/resources/bin/mac/arm64/tectonic").to_path_buf(),
                Path::new("/workspace/resources/bin/mac/tectonic").to_path_buf(),
                Path::new("/workspace/src-tauri/binaries/tectonic-aarch64-apple-darwin")
                    .to_path_buf(),
            ]
        );
    }

    #[test]
    fn packaged_resolution_prefers_external_bin_next_to_app() {
        let candidates = packaged_candidates(
            Path::new("/app/Contents/MacOS"),
            Some(Path::new("/app/Contents/Resources")),
            "macos",
            "x86_64",
        );
        assert_eq!(candidates[0], Path::new("/app/Contents/MacOS/tectonic"));
        assert_eq!(
            candidates[2],
            Path::new("/app/Contents/Resources/bin/x64/tectonic")
        );

        let windows_candidates = packaged_candidates(
            Path::new("C:/TextEx"),
            Some(Path::new("C:/TextEx/resources")),
            "windows",
            "x86_64",
        );
        assert_eq!(windows_candidates[0], Path::new("C:/TextEx/tectonic.exe"));
    }

    #[tokio::test]
    async fn compile_input_must_be_a_tex_file_inside_project() {
        let project = tempfile::tempdir().expect("project tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let project_root = dunce::canonicalize(project.path()).expect("canonical project");
        let tex_path = project.path().join("main.tex");
        let other_path = project.path().join("notes.txt");
        let outside_tex_path = outside.path().join("outside.tex");
        tokio::fs::write(&tex_path, "\\documentclass{article}")
            .await
            .expect("write tex");
        tokio::fs::write(&other_path, "not tex")
            .await
            .expect("write text");
        tokio::fs::write(&outside_tex_path, "\\documentclass{article}")
            .await
            .expect("write outside tex");

        let state = AppState::default();
        state.set_project_root(project_root).expect("set root");
        assert_eq!(
            validate_project_tex_file(&state, tex_path.to_str().expect("utf8 path"))
                .await
                .expect("valid tex"),
            dunce::canonicalize(&tex_path).expect("canonical tex")
        );
        assert!(matches!(
            validate_project_tex_file(&state, other_path.to_str().expect("utf8 path")).await,
            Err(AppError::InvalidPath(_))
        ));
        assert!(matches!(
            validate_project_tex_file(
                &state,
                outside_tex_path.to_str().expect("utf8 outside path")
            )
            .await,
            Err(AppError::OutsideProject(_))
        ));
    }

    #[tokio::test]
    async fn magic_root_is_canonicalized_and_revalidated_inside_project() {
        let project = tempfile::tempdir().expect("project tempdir");
        let chapter_dir = project.path().join("chapters");
        tokio::fs::create_dir_all(&chapter_dir)
            .await
            .expect("create chapter dir");
        let main_path = project.path().join("main.tex");
        let chapter_path = chapter_dir.join("one.tex");
        tokio::fs::write(&main_path, "\\documentclass{article}")
            .await
            .expect("write main");
        tokio::fs::write(&chapter_path, "%! TeX root = ../main.tex\nchapter")
            .await
            .expect("write chapter");

        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).expect("canonical project"))
            .expect("set project");
        let selected =
            validate_project_tex_file(&state, chapter_path.to_str().expect("utf8 chapter path"))
                .await
                .expect("validate chapter");
        assert_eq!(
            resolve_magic_root(&state, &selected)
                .await
                .expect("resolve magic root"),
            dunce::canonicalize(main_path).expect("canonical main")
        );
    }

    #[cfg(unix)]
    fn sleeping_child() -> tokio::process::Child {
        let mut command = Command::new("/bin/sh");
        command
            .arg("-c")
            // Keep a real descendant alive with inherited stdout/stderr. A
            // final foreground command could be replaced via the shell's
            // `exec` optimization and would not exercise process-tree cleanup.
            .arg("sleep 5 & wait")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        isolate_process_group(&mut command);
        command.spawn().expect("spawn sleeping child")
    }

    #[cfg(unix)]
    fn no_op_channel() -> Channel<crate::models::CompileEvent> {
        Channel::new(|_| Ok(()))
    }

    #[cfg(unix)]
    fn compile_identity() -> CompileIdentity {
        CompileIdentity {
            request_id: 7,
            document_id: "document-7".to_owned(),
            document_revision: 11,
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_kills_and_reaps_the_child() {
        let child = sleeping_child();
        let (cancel, mut cancel_receiver) = oneshot::channel();
        let started = Instant::now();
        let monitor = monitor_child(
            child,
            &mut cancel_receiver,
            Duration::from_secs(30),
            compile_identity(),
            no_op_channel(),
            "/bin/sh",
        );
        let request_cancel = async move {
            tokio::time::sleep(Duration::from_millis(40)).await;
            cancel.send(()).expect("deliver cancellation");
        };

        let (result, _) = tokio::join!(monitor, request_cancel);
        assert!(matches!(result, Err(AppError::CompilationCancelled)));
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn timeout_kills_and_reaps_the_child() {
        let child = sleeping_child();
        let (_cancel, mut cancel_receiver) = oneshot::channel::<()>();
        let started = Instant::now();
        let result = monitor_child(
            child,
            &mut cancel_receiver,
            Duration::from_millis(40),
            compile_identity(),
            no_op_channel(),
            "/bin/sh",
        )
        .await;

        assert!(matches!(result, Err(AppError::CompilationTimedOut { .. })));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
