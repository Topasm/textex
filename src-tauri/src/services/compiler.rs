use std::{
    ffi::{OsStr, OsString},
    io,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use sha2::{Digest, Sha256};
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
    models::{
        CompileDiagnostic, CompileDiagnosticSeverity, CompileEvent, CompileIdentity,
        CompileRequest, CompileResponse, CompileStage, LatexEngine,
    },
    services::tectonic_cache,
    state::AppState,
};

const TECTONIC_BASENAME: &str = "tectonic";
const COMPILE_TIMEOUT: Duration = Duration::from_secs(120);
const BUILD_TARGET_TRIPLE: &str = env!("TAURI_ENV_TARGET_TRIPLE");
const MAX_JAVASCRIPT_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_DIAGNOSTIC_LOG_BYTES: usize = 4 * 1024 * 1024;
const MAX_AUX_BYTES: u64 = 4 * 1024 * 1024;

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

struct ChildRun {
    status: ExitStatus,
    output: String,
}

struct CompilerOutput {
    pdf_path: String,
    aux_content: Option<String>,
}

enum ResolvedCompiler {
    Tectonic {
        executable: PathBuf,
        cache: tectonic_cache::PreparedCache,
    },
    PdfLatex {
        executable: PathBuf,
    },
}

pub async fn compile_latex(
    app: &AppHandle,
    state: &AppState,
    latex_engine: LatexEngine,
    request: CompileRequest,
    on_event: Channel<CompileEvent>,
) -> AppResult<CompileResponse> {
    validate_compile_request(&request)?;
    let (project_root, project_epoch, project_epoch_tracker) = state.project_root_epoch()?;
    let identity = request.identity();
    let selected_tex_path = validate_project_tex_file(state, &request.file_path).await?;
    let tex_path = resolve_magic_root(state, &selected_tex_path).await?;
    let display_tex_path = path_to_string(&tex_path)?;
    let build_dir = prepare_build_directory(app, &project_root, &tex_path, latex_engine).await?;
    let compiler = match latex_engine {
        LatexEngine::Tectonic => ResolvedCompiler::Tectonic {
            executable: resolve_tectonic_executable(app)?,
            cache: tectonic_cache::prepare(app).await?,
        },
        LatexEngine::PdfLatex => ResolvedCompiler::PdfLatex {
            executable: resolve_latexmk_executable()?,
        },
    };
    let mut lease = state.begin_compilation(&request, project_epoch).await?;
    if project_epoch_tracker.load(Ordering::Acquire) != project_epoch {
        return Err(AppError::CompilationCancelled);
    }

    match &compiler {
        ResolvedCompiler::Tectonic { cache, .. } => {
            let _ = on_event.send(CompileEvent::Log {
                identity: identity.clone(),
                text: cache.status.clone(),
            });
        }
        ResolvedCompiler::PdfLatex { executable } => {
            let _ = on_event.send(CompileEvent::Log {
                identity: identity.clone(),
                text: format!(
                    "Using system pdfLaTeX through latexmk at {}. Project latexmkrc files are ignored.\n",
                    executable.to_string_lossy()
                ),
            });
        }
    }

    send_progress(
        &on_event,
        identity.clone(),
        CompileStage::Compiling,
        display_tex_path.clone(),
    );
    let _ = on_event.send(CompileEvent::Diagnostics {
        identity: identity.clone(),
        diagnostics: Vec::new(),
    });

    let result = match &compiler {
        ResolvedCompiler::Tectonic {
            executable, cache, ..
        } => {
            run_tectonic(
                executable,
                &tex_path,
                &cache.path,
                &build_dir,
                identity.clone(),
                on_event.clone(),
                lease.cancel_receiver(),
            )
            .await
        }
        ResolvedCompiler::PdfLatex { executable } => {
            run_latexmk(
                executable,
                &tex_path,
                &build_dir,
                identity.clone(),
                on_event.clone(),
                lease.cancel_receiver(),
            )
            .await
        }
    };

    // Serialize the final epoch check with project close/open transitions so
    // a completed child cannot publish Done or return a PDF for a project
    // that became stale between process exit and command completion.
    let _project_operation = state.lock_project_operation().await;
    let result = finalize_compile_for_project(result, project_epoch, &project_epoch_tracker);

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

    // Keep a prepared Tectonic cache lease (when selected) until the child has
    // exited and all compile result handling above has finished.
    drop(compiler);
    result.map(|output| CompileResponse {
        identity,
        pdf_path: output.pdf_path,
        compiled_file_path: display_tex_path,
        aux_content: output.aux_content,
    })
}

fn finalize_compile_for_project<T>(
    result: AppResult<T>,
    expected_epoch: u64,
    epoch_tracker: &AtomicU64,
) -> AppResult<T> {
    if epoch_tracker.load(Ordering::Acquire) == expected_epoch {
        result
    } else {
        Err(AppError::CompilationCancelled)
    }
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
    build_dir: &Path,
    identity: CompileIdentity,
    on_event: Channel<CompileEvent>,
    cancel_receiver: &mut oneshot::Receiver<()>,
) -> AppResult<CompilerOutput> {
    let working_directory = tex_path.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "compile input has no parent directory: {}",
            tex_path.to_string_lossy()
        ))
    })?;
    let mut command = Command::new(tectonic_path);
    command
        .arg("-X")
        .arg("compile")
        .arg("--synctex")
        .arg("--outdir")
        .arg(build_dir)
        .arg(tex_path)
        .current_dir(working_directory)
        .env("TECTONIC_CACHE_DIR", cache_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    isolate_process_group(&mut command);

    run_configured_compiler(
        command,
        tectonic_path,
        tex_path,
        expected_output_path(build_dir, tex_path, "pdf")?,
        identity,
        on_event,
        cancel_receiver,
    )
    .await
}

async fn run_latexmk(
    latexmk_path: &Path,
    tex_path: &Path,
    build_dir: &Path,
    identity: CompileIdentity,
    on_event: Channel<CompileEvent>,
    cancel_receiver: &mut oneshot::Receiver<()>,
) -> AppResult<CompilerOutput> {
    let working_directory = tex_path.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "compile input has no parent directory: {}",
            tex_path.to_string_lossy()
        ))
    })?;

    let mut command = Command::new(latexmk_path);
    command
        .args(latexmk_arguments(tex_path, build_dir))
        // Finder-launched macOS applications do not inherit the user's shell
        // PATH. latexmk may be resolved through MacTeX's absolute stable path,
        // but it still launches pdflatex by name, so expose its sibling tools
        // to the child without mutating the application-wide environment.
        .env(
            "PATH",
            executable_parent_path(latexmk_path, std::env::var_os("PATH").as_deref())?,
        )
        .current_dir(working_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    isolate_process_group(&mut command);

    run_configured_compiler(
        command,
        latexmk_path,
        tex_path,
        expected_output_path(build_dir, tex_path, "pdf")?,
        identity,
        on_event,
        cancel_receiver,
    )
    .await
}

fn executable_parent_path(executable: &Path, inherited: Option<&OsStr>) -> AppResult<OsString> {
    let parent = executable
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| {
            AppError::RuntimePath(format!(
                "compiler executable has no parent directory: {}",
                executable.to_string_lossy()
            ))
        })?;
    let mut paths = inherited
        .map(std::env::split_paths)
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    if !paths.iter().any(|path| path == parent) {
        paths.insert(0, parent.to_path_buf());
    }
    std::env::join_paths(paths).map_err(|error| {
        AppError::RuntimePath(format!(
            "could not construct compiler PATH for {}: {error}",
            executable.to_string_lossy()
        ))
    })
}

fn latexmk_arguments(tex_path: &Path, build_dir: &Path) -> Vec<OsString> {
    // Ignore system, user, and project latexmkrc files so an existing
    // XeLaTeX/LuaLaTeX override cannot change the selected engine.
    let mut outdir = OsString::from("-outdir=");
    outdir.push(build_dir);
    [
        OsString::from("-norc"),
        // A PDF produced by Tectonic can otherwise look up-to-date to
        // latexmk after an engine switch even though pdfLaTeX never ran.
        OsString::from("-g"),
        OsString::from("-pdf"),
        OsString::from("-synctex=1"),
        OsString::from("-interaction=nonstopmode"),
        OsString::from("-file-line-error"),
        OsString::from("-halt-on-error"),
        outdir,
        tex_path.as_os_str().to_owned(),
    ]
    .into()
}

fn expected_output_path(build_dir: &Path, tex_path: &Path, extension: &str) -> AppResult<PathBuf> {
    let file_stem = tex_path
        .file_stem()
        .ok_or_else(|| AppError::InvalidPath(tex_path.to_string_lossy().into_owned()))?;
    Ok(build_dir.join(file_stem).with_extension(extension))
}

async fn read_aux_content(aux_path: &Path) -> AppResult<Option<String>> {
    let metadata = match fs::metadata(aux_path).await {
        Ok(metadata) => metadata,
        Err(source) if source.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(AppError::compiler_io(
                "inspect generated AUX",
                aux_path.to_string_lossy(),
                source,
            ));
        }
    };
    if !metadata.is_file() || metadata.len() > MAX_AUX_BYTES {
        return Ok(None);
    }
    let bytes = fs::read(aux_path).await.map_err(|source| {
        AppError::compiler_io("read generated AUX", aux_path.to_string_lossy(), source)
    })?;
    Ok(String::from_utf8(bytes).ok())
}

async fn prepare_build_directory(
    app: &AppHandle,
    project_root: &Path,
    root_file: &Path,
    engine: LatexEngine,
) -> AppResult<PathBuf> {
    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?;
    let build_root = app_cache.join("build");
    fs::create_dir_all(&build_root).await.map_err(|source| {
        AppError::compiler_io("create build cache", build_root.to_string_lossy(), source)
    })?;
    let canonical_build_root = dunce::canonicalize(&build_root).map_err(|source| {
        AppError::compiler_io("resolve build cache", build_root.to_string_lossy(), source)
    })?;

    let engine_name = match engine {
        LatexEngine::Tectonic => "tectonic",
        LatexEngine::PdfLatex => "pdflatex",
    };
    let build_dir = canonical_build_root
        .join(project_cache_id(project_root))
        .join(engine_name)
        .join(root_document_cache_id(project_root, root_file)?);
    fs::create_dir_all(&build_dir).await.map_err(|source| {
        AppError::compiler_io(
            "create engine build cache",
            build_dir.to_string_lossy(),
            source,
        )
    })?;
    let canonical_build_dir = dunce::canonicalize(&build_dir).map_err(|source| {
        AppError::compiler_io(
            "resolve engine build cache",
            build_dir.to_string_lossy(),
            source,
        )
    })?;
    if !path_is_within(&canonical_build_root, &canonical_build_dir) {
        return Err(AppError::RuntimePath(format!(
            "engine build cache escaped application cache: {}",
            canonical_build_dir.to_string_lossy()
        )));
    }
    Ok(canonical_build_dir)
}

pub(crate) fn project_build_cache_root(app: &AppHandle, project_root: &Path) -> AppResult<PathBuf> {
    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::RuntimePath(error.to_string()))?;
    Ok(app_cache.join("build").join(project_cache_id(project_root)))
}

fn project_cache_id(project_root: &Path) -> String {
    let identity = if cfg!(windows) {
        project_root.to_string_lossy().to_lowercase()
    } else {
        project_root.to_string_lossy().into_owned()
    };
    format!("{:x}", Sha256::digest(identity.as_bytes()))
}

fn root_document_cache_id(project_root: &Path, root_file: &Path) -> AppResult<String> {
    let relative = root_file
        .strip_prefix(project_root)
        .map_err(|_| AppError::OutsideProject(root_file.to_string_lossy().into_owned()))?;
    let identity = if cfg!(windows) {
        relative.to_string_lossy().to_lowercase()
    } else {
        relative.to_string_lossy().into_owned()
    };
    Ok(format!("{:x}", Sha256::digest(identity.as_bytes())))
}

async fn run_configured_compiler(
    mut command: Command,
    compiler_path: &Path,
    tex_path: &Path,
    pdf_path: PathBuf,
    identity: CompileIdentity,
    on_event: Channel<CompileEvent>,
    cancel_receiver: &mut oneshot::Receiver<()>,
) -> AppResult<CompilerOutput> {
    let display_compiler_path = compiler_path.to_string_lossy().into_owned();
    let child = command
        .spawn()
        .map_err(|source| AppError::compiler_io("start", display_compiler_path.clone(), source))?;
    let child_run = monitor_child(
        child,
        cancel_receiver,
        COMPILE_TIMEOUT,
        identity.clone(),
        on_event.clone(),
        &display_compiler_path,
    )
    .await?;

    let diagnostics = parse_tectonic_diagnostics(&child_run.output, tex_path);
    let _ = on_event.send(CompileEvent::Diagnostics {
        identity: identity.clone(),
        diagnostics,
    });

    if !child_run.status.success() {
        return Err(AppError::CompilerFailed {
            status: format_exit_status(child_run.status),
        });
    }

    let display_pdf_path = path_to_string(&pdf_path)?;
    match fs::metadata(&pdf_path).await {
        Ok(metadata) if metadata.is_file() => Ok(CompilerOutput {
            pdf_path: display_pdf_path,
            aux_content: read_aux_content(&pdf_path.with_extension("aux")).await?,
        }),
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
) -> AppResult<ChildRun> {
    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::CompilerWorker("compiler stdout pipe was not created".to_owned())
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::CompilerWorker("compiler stderr pipe was not created".to_owned())
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

    let output = join_output_tasks(stdout_task, stderr_task, display_tectonic_path).await?;

    match outcome {
        ChildOutcome::Exited(status) => Ok(ChildRun { status, output }),
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
) -> io::Result<String>
where
    R: AsyncRead + Unpin,
{
    let mut reader = BufReader::new(output);
    let mut buffer = Vec::with_capacity(4096);
    let mut captured = Vec::with_capacity(16 * 1024);

    loop {
        buffer.clear();
        let read = reader.read_until(b'\n', &mut buffer).await?;
        if read == 0 {
            return Ok(String::from_utf8_lossy(&captured).into_owned());
        }

        let remaining = MAX_DIAGNOSTIC_LOG_BYTES.saturating_sub(captured.len());
        captured.extend_from_slice(&buffer[..buffer.len().min(remaining)]);

        // A closed renderer channel must not turn a successful compilation
        // into a failure, so channel delivery is intentionally best-effort.
        let _ = on_event.send(CompileEvent::Log {
            identity: identity.clone(),
            text: String::from_utf8_lossy(&buffer).into_owned(),
        });
    }
}

async fn join_output_tasks(
    stdout_task: JoinHandle<io::Result<String>>,
    stderr_task: JoinHandle<io::Result<String>>,
    display_tectonic_path: &str,
) -> AppResult<String> {
    let (stdout_result, stderr_result) = tokio::join!(stdout_task, stderr_task);
    let stdout = finish_output_task(stdout_result, "read stdout from", display_tectonic_path)?;
    let stderr = finish_output_task(stderr_result, "read stderr from", display_tectonic_path)?;
    Ok(format!("{stdout}{stderr}"))
}

fn finish_output_task(
    result: Result<io::Result<String>, tokio::task::JoinError>,
    operation: &'static str,
    display_tectonic_path: &str,
) -> AppResult<String> {
    result
        .map_err(|error| AppError::CompilerWorker(error.to_string()))?
        .map_err(|source| AppError::compiler_io(operation, display_tectonic_path, source))
}

fn parse_tectonic_diagnostics(output: &str, root_file: &Path) -> Vec<CompileDiagnostic> {
    let lines: Vec<&str> = output.lines().collect();
    let mut diagnostics = Vec::new();

    for (index, raw_line) in lines.iter().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        let parsed = if let Some(message) = line.strip_prefix("error:") {
            Some(parse_prefixed_diagnostic(
                CompileDiagnosticSeverity::Error,
                message,
                &lines,
                index,
                root_file,
            ))
        } else if let Some(message) = line.strip_prefix("warning:") {
            Some(parse_prefixed_diagnostic(
                CompileDiagnosticSeverity::Warning,
                message,
                &lines,
                index,
                root_file,
            ))
        } else if let Some((file, line, column, message)) = parse_location(line) {
            // pdfTeX's -file-line-error format is emitted without an "error:"
            // prefix (for example, "./main.tex:12: Undefined control sequence").
            Some(CompileDiagnostic {
                file: diagnostic_file(root_file, Some(file)),
                line,
                column,
                severity: CompileDiagnosticSeverity::Error,
                message: message.to_owned(),
            })
        } else if let Some(message) = line.strip_prefix('!') {
            let line_number = lines
                .iter()
                .skip(index + 1)
                .take(5)
                .find_map(|candidate| parse_classic_error_line(candidate));
            Some(CompileDiagnostic {
                file: diagnostic_file(root_file, None),
                line: line_number.unwrap_or(1),
                column: None,
                severity: CompileDiagnosticSeverity::Error,
                message: message.trim().to_owned(),
            })
        } else if is_latex_warning(line) {
            Some(CompileDiagnostic {
                file: diagnostic_file(root_file, None),
                line: parse_input_line(line).unwrap_or(1),
                column: None,
                severity: CompileDiagnosticSeverity::Warning,
                message: line.to_owned(),
            })
        } else if line.starts_with(r"Overfull \") || line.starts_with(r"Underfull \") {
            Some(CompileDiagnostic {
                file: diagnostic_file(root_file, None),
                line: parse_bad_box_line(line).unwrap_or(1),
                column: None,
                severity: CompileDiagnosticSeverity::Info,
                message: line.to_owned(),
            })
        } else {
            None
        };

        if let Some(diagnostic) = parsed {
            if !diagnostic.message.is_empty() && !diagnostics.contains(&diagnostic) {
                diagnostics.push(diagnostic);
            }
        }
    }

    diagnostics
}

fn parse_prefixed_diagnostic(
    severity: CompileDiagnosticSeverity,
    raw_message: &str,
    lines: &[&str],
    index: usize,
    root_file: &Path,
) -> CompileDiagnostic {
    if let Some((file, line, column, message)) = parse_location(raw_message) {
        return CompileDiagnostic {
            file: diagnostic_file(root_file, Some(file)),
            line,
            column,
            severity,
            message: if message.is_empty() {
                raw_message.trim().to_owned()
            } else {
                message.to_owned()
            },
        };
    }

    let location = find_following_location(lines, index);
    let (file, line, column) = location
        .map(|(file, line, column, _)| (Some(file), line, column))
        .unwrap_or((None, 1, None));
    CompileDiagnostic {
        file: diagnostic_file(root_file, file),
        line,
        column,
        severity,
        message: raw_message.trim().to_owned(),
    }
}

fn find_following_location<'a>(
    lines: &'a [&'a str],
    diagnostic_index: usize,
) -> Option<(&'a str, u64, Option<u64>, &'a str)> {
    for candidate in lines.iter().skip(diagnostic_index + 1).take(5) {
        let trimmed = candidate.trim();
        if trimmed.starts_with("error:")
            || trimmed.starts_with("warning:")
            || trimmed.starts_with('!')
            || is_latex_warning(trimmed)
        {
            break;
        }
        if let Some(location) = parse_location(candidate) {
            return Some(location);
        }
    }
    None
}

fn parse_location(value: &str) -> Option<(&str, u64, Option<u64>, &str)> {
    let value = value
        .trim()
        .trim_start_matches("-->")
        .trim_start_matches(['┌', '╭', '─'])
        .trim();

    for (separator, _) in value.match_indices(':') {
        let after_separator = &value[separator + 1..];
        let line_digits = after_separator
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .count();
        if line_digits == 0 {
            continue;
        }
        let line = after_separator[..line_digits].parse().ok()?;
        let after_line = &after_separator[line_digits..];
        let Some(after_line_separator) = after_line.strip_prefix(':') else {
            continue;
        };
        let column_digits = after_line_separator
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .count();
        let (column, message) = if column_digits > 0 {
            let column = after_line_separator[..column_digits].parse().ok();
            let message = after_line_separator[column_digits..]
                .strip_prefix(':')
                .unwrap_or_default()
                .trim();
            (column, message)
        } else {
            (None, after_line_separator.trim())
        };
        let file = value[..separator].trim().trim_matches(['"', '`']);
        if !file.is_empty() {
            return Some((file, line, column, message));
        }
    }
    None
}

fn diagnostic_file(root_file: &Path, reported_file: Option<&str>) -> String {
    let Some(reported_file) = reported_file.filter(|file| !file.is_empty()) else {
        return root_file.to_string_lossy().into_owned();
    };
    let reported_file = reported_file
        .strip_prefix("./")
        .or_else(|| reported_file.strip_prefix(".\\"))
        .unwrap_or(reported_file);
    let reported_path = Path::new(reported_file);
    let resolved = if reported_path.is_absolute() {
        reported_path.to_path_buf()
    } else {
        root_file
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join(reported_path)
    };
    resolved.to_string_lossy().into_owned()
}

fn parse_classic_error_line(line: &str) -> Option<u64> {
    let line = line.trim_start();
    let digits = line.strip_prefix("l.")?;
    let digits = digits
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>();
    digits.parse().ok()
}

fn is_latex_warning(line: &str) -> bool {
    (line.starts_with("LaTeX")
        || line.starts_with("Package ")
        || line.starts_with("Class ")
        || line.starts_with("Module "))
        && (line.contains(" Warning:") || line.starts_with("LaTeX Warning:"))
}

fn parse_input_line(line: &str) -> Option<u64> {
    let suffix = line.split("on input line ").nth(1)?;
    suffix
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()
}

fn parse_bad_box_line(line: &str) -> Option<u64> {
    let suffix = line
        .split(" at lines ")
        .nth(1)
        .or_else(|| line.split(" at line ").nth(1))?;
    suffix
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()
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

pub(crate) async fn validate_project_tex_file(
    state: &AppState,
    file_path: &str,
) -> AppResult<PathBuf> {
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

pub(crate) async fn resolve_magic_root(
    state: &AppState,
    selected_tex_path: &Path,
) -> AppResult<PathBuf> {
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

fn resolve_latexmk_executable() -> AppResult<PathBuf> {
    let path = std::env::var_os("PATH");
    let candidates = system_latexmk_candidates(std::env::consts::OS, path.as_deref());

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

fn system_latexmk_candidates(os: &str, path: Option<&OsStr>) -> Vec<PathBuf> {
    let executable_name = if os == "windows" {
        "latexmk.exe"
    } else {
        "latexmk"
    };
    let mut candidates = Vec::new();

    // Desktop apps launched from Finder do not inherit the interactive shell
    // PATH. MacTeX maintains this stable symlink independently of CPU type.
    if os == "macos" {
        push_unique(
            &mut candidates,
            Path::new("/Library/TeX/texbin").join(executable_name),
        );
        push_unique(
            &mut candidates,
            Path::new("/opt/homebrew/bin").join(executable_name),
        );
        push_unique(
            &mut candidates,
            Path::new("/usr/local/bin").join(executable_name),
        );
    } else if os != "windows" {
        push_unique(
            &mut candidates,
            Path::new("/usr/local/bin").join(executable_name),
        );
        push_unique(&mut candidates, Path::new("/usr/bin").join(executable_name));
    }

    if let Some(path) = path {
        for directory in std::env::split_paths(path) {
            push_unique(&mut candidates, directory.join(executable_name));
        }
    }

    candidates
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
        // Also accept an explicitly bundled resource layout for portable and
        // development packages.
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
    use std::{
        ffi::OsString,
        path::Path,
        sync::atomic::{AtomicU64, Ordering},
    };

    #[cfg(unix)]
    use std::{process::Stdio, time::Instant};

    use super::{
        development_candidates, executable_parent_path, extract_magic_root,
        finalize_compile_for_project, latexmk_arguments, packaged_candidates,
        parse_tectonic_diagnostics, resolve_magic_root, root_document_cache_id,
        sidecar_source_filename, system_latexmk_candidates, validate_compile_request,
        validate_project_tex_file,
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
    fn parses_structured_classic_and_typesetting_diagnostics() {
        let root = Path::new("/project/main.tex");
        let output = concat!(
            "error: chapters/one.tex:12:4: Undefined control sequence\n",
            "warning: Citation `missing` is undefined\n",
            "  ┌─ main.tex:18:2\n",
            "! Missing $ inserted.\n",
            "l.27 \\section{Broken}\n",
            "LaTeX Warning: Label(s) may have changed on input line 31.\n",
            "Overfull \\hbox (3.0pt too wide) in paragraph at lines 40--41\n"
        );

        let diagnostics = parse_tectonic_diagnostics(output, root);
        assert_eq!(diagnostics.len(), 5);
        assert_eq!(diagnostics[0].file, "/project/chapters/one.tex");
        assert_eq!(diagnostics[0].line, 12);
        assert_eq!(diagnostics[0].column, Some(4));
        assert_eq!(diagnostics[0].message, "Undefined control sequence");
        assert_eq!(diagnostics[1].file, "/project/main.tex");
        assert_eq!(diagnostics[1].line, 18);
        assert_eq!(diagnostics[2].line, 27);
        assert_eq!(diagnostics[3].line, 31);
        assert_eq!(diagnostics[4].line, 40);
    }

    #[test]
    fn diagnostics_are_deduplicated_and_unlocated_errors_use_the_root() {
        let root = Path::new("/project/main.tex");
        let diagnostics = parse_tectonic_diagnostics(
            "error: compilation failed\nerror: compilation failed\n",
            root,
        );

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].file, "/project/main.tex");
        assert_eq!(diagnostics[0].line, 1);
    }

    #[test]
    fn parses_pdftex_file_line_error_output() {
        let root = Path::new("/project/main.tex");
        let diagnostics = parse_tectonic_diagnostics(
            "./chapters/one.tex:23: Undefined control sequence.\n",
            root,
        );

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].file, "/project/chapters/one.tex");
        assert_eq!(diagnostics[0].line, 23);
        assert_eq!(diagnostics[0].message, "Undefined control sequence.");
    }

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
    fn completed_compile_is_cancelled_after_project_epoch_changes() {
        let epoch_tracker = AtomicU64::new(17);
        assert_eq!(
            finalize_compile_for_project(Ok("/project/main.pdf".to_owned()), 17, &epoch_tracker)
                .expect("active project result"),
            "/project/main.pdf"
        );

        epoch_tracker.store(18, Ordering::Release);
        assert!(matches!(
            finalize_compile_for_project(Ok("/project/main.pdf".to_owned()), 17, &epoch_tracker),
            Err(AppError::CompilationCancelled)
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

    #[test]
    fn system_latexmk_resolution_covers_mactex_and_process_path() {
        let process_path =
            std::env::join_paths(["/custom/tex/bin", "/usr/local/bin"]).expect("join test PATH");
        let candidates = system_latexmk_candidates("macos", Some(process_path.as_os_str()));

        assert_eq!(candidates[0], Path::new("/Library/TeX/texbin/latexmk"));
        assert!(candidates.contains(&Path::new("/opt/homebrew/bin/latexmk").to_path_buf()));
        assert!(candidates.contains(&Path::new("/custom/tex/bin/latexmk").to_path_buf()));
        assert_eq!(
            candidates
                .iter()
                .filter(|candidate| *candidate == Path::new("/usr/local/bin/latexmk"))
                .count(),
            1
        );
    }

    #[test]
    fn latexmk_child_path_prepends_the_resolved_executable_directory_once() {
        let inherited =
            std::env::join_paths(["/usr/local/bin", "/usr/bin"]).expect("join inherited PATH");
        let child_path = executable_parent_path(
            Path::new("/Library/TeX/texbin/latexmk"),
            Some(inherited.as_os_str()),
        )
        .expect("construct latexmk child PATH");
        let entries = std::env::split_paths(&child_path).collect::<Vec<_>>();

        assert_eq!(
            entries.first(),
            Some(&Path::new("/Library/TeX/texbin").to_path_buf())
        );
        assert_eq!(
            entries
                .iter()
                .filter(|entry| *entry == Path::new("/Library/TeX/texbin"))
                .count(),
            1
        );

        let child_path = executable_parent_path(
            Path::new("/Library/TeX/texbin/latexmk"),
            Some(child_path.as_os_str()),
        )
        .expect("preserve existing latexmk directory");
        assert_eq!(
            std::env::split_paths(&child_path)
                .filter(|entry| entry == Path::new("/Library/TeX/texbin"))
                .count(),
            1
        );
    }

    #[test]
    fn pdf_latex_invocation_ignores_rc_and_requests_submission_compatible_mode() {
        let arguments = latexmk_arguments(
            Path::new("/project/main.tex"),
            Path::new("/cache/build/project/pdflatex"),
        );
        assert_eq!(
            arguments,
            [
                "-norc",
                "-g",
                "-pdf",
                "-synctex=1",
                "-interaction=nonstopmode",
                "-file-line-error",
                "-halt-on-error",
                "-outdir=/cache/build/project/pdflatex",
                "/project/main.tex",
            ]
            .map(OsString::from)
        );
    }

    #[test]
    fn pdf_latex_keeps_source_paths_with_spaces_at_signs_and_underscores_verbatim() {
        let source = Path::new(
            "/Users/seonghyeon/Library/CloudStorage/GoogleDrive-shkim.p0215@gmail.com/My Drive/workspace/01_Projects/icra_2027/paper/main.tex",
        );
        let arguments = latexmk_arguments(source, Path::new("/cache/pdflatex"));

        assert_eq!(
            arguments.last().map(OsString::as_os_str),
            Some(source.as_os_str())
        );
        assert!(!arguments
            .last()
            .expect("source argument")
            .to_string_lossy()
            .contains("\\@"));
        assert!(!arguments
            .last()
            .expect("source argument")
            .to_string_lossy()
            .contains("\\_"));
    }

    #[test]
    fn build_cache_isolated_for_same_stem_root_documents() {
        let project = Path::new("/project");
        let first = root_document_cache_id(project, Path::new("/project/paper/main.tex"))
            .expect("first root cache id");
        let second = root_document_cache_id(project, Path::new("/project/supplement/main.tex"))
            .expect("second root cache id");

        assert_ne!(first, second);
        assert_eq!(
            first,
            root_document_cache_id(project, Path::new("/project/paper/main.tex"))
                .expect("stable root cache id")
        );
        assert!(root_document_cache_id(project, Path::new("/outside/main.tex")).is_err());
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
