use std::{
    ffi::{OsStr, OsString},
    io,
    path::{Component, Path, PathBuf},
    process::{Output, Stdio},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};

use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
    time::timeout,
};

use crate::{
    error::{AppError, AppResult},
    models::{GitFileStatus, GitLogEntry, GitRemoteStatus, GitStatusResult, SuccessResult},
    state::AppState,
};

const MAX_GIT_OUTPUT_BYTES: usize = 10 * 1024 * 1024;
const MAX_COMMIT_MESSAGE_BYTES: usize = 64 * 1024;
const GIT_READ_TIMEOUT: Duration = Duration::from_secs(30);
const GIT_MUTATION_TIMEOUT: Duration = Duration::from_secs(60);
const GIT_COMMIT_TIMEOUT: Duration = Duration::from_secs(120);
const GIT_NETWORK_TIMEOUT: Duration = Duration::from_secs(300);
const GIT_REAP_TIMEOUT: Duration = Duration::from_secs(5);
const GIT_OUTPUT_CHUNK_BYTES: usize = 8 * 1024;

pub async fn is_repository(state: &AppState, work_dir: &str) -> AppResult<bool> {
    let root = trusted_repository_root(state, work_dir).await?;
    let output = run_git_output(&root, ["rev-parse", "--is-inside-work-tree"], "inspect").await;
    Ok(output
        .ok()
        .filter(|output| output.status.success())
        .is_some_and(|output| trim_ascii(&output.stdout) == b"true"))
}

pub async fn init_repository(state: &AppState, work_dir: &str) -> AppResult<SuccessResult> {
    let root = trusted_repository_root(state, work_dir).await?;
    run_git_checked(&root, ["init"], "initialize").await?;
    Ok(SuccessResult::ok())
}

pub async fn status(state: &AppState, work_dir: &str) -> AppResult<GitStatusResult> {
    let root = trusted_repository_root(state, work_dir).await?;
    let branch = match run_git_checked(
        &root,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        "read branch",
    )
    .await
    {
        Ok(output) => decode_git_text(&output.stdout, "branch")?.trim().to_owned(),
        Err(AppError::GitFailed { .. }) => "detached".to_owned(),
        Err(error) => return Err(error),
    };
    let output = run_git_checked(&root, ["status", "--porcelain=v1", "-z"], "read status").await?;
    parse_status(
        &output.stdout,
        if branch.is_empty() {
            "detached"
        } else {
            &branch
        },
    )
}

pub async fn remote_status(state: &AppState, work_dir: &str) -> AppResult<GitRemoteStatus> {
    let root = trusted_repository_root(state, work_dir).await?;
    read_remote_status(&root).await
}

pub async fn fetch(state: &AppState, work_dir: &str) -> AppResult<GitRemoteStatus> {
    let root = trusted_repository_root(state, work_dir).await?;
    let status = read_remote_status(&root).await?;
    let remote = require_remote(&status)?;
    run_git_checked_os(
        &root,
        [
            OsStr::new("fetch"),
            OsStr::new("--prune"),
            OsStr::new(remote),
        ],
        "fetch",
    )
    .await?;
    read_remote_status(&root).await
}

pub async fn pull(state: &AppState, work_dir: &str) -> AppResult<GitRemoteStatus> {
    let root = trusted_repository_root(state, work_dir).await?;
    let remote = read_remote_status(&root).await?;
    require_upstream(&remote)?;
    require_clean_worktree(&root).await?;
    run_git_checked(&root, ["pull", "--ff-only"], "pull").await?;
    read_remote_status(&root).await
}

pub async fn push(state: &AppState, work_dir: &str) -> AppResult<GitRemoteStatus> {
    let root = trusted_repository_root(state, work_dir).await?;
    let status = read_remote_status(&root).await?;
    let remote = require_remote(&status)?;
    let upstream = require_upstream(&status)?;
    let branch = upstream
        .strip_prefix(remote)
        .and_then(|value| value.strip_prefix('/'))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::GitSafety("the current branch has an invalid upstream".to_owned())
        })?;
    let refspec = format!("HEAD:refs/heads/{branch}");
    run_git_checked_os(
        &root,
        [
            OsStr::new("push"),
            OsStr::new("--"),
            OsStr::new(remote),
            OsStr::new(refspec.as_str()),
        ],
        "push",
    )
    .await?;
    read_remote_status(&root).await
}

async fn read_remote_status(root: &Path) -> AppResult<GitRemoteStatus> {
    let remotes = run_git_checked(root, ["remote"], "read remotes").await?;
    let first_remote = decode_git_text(&remotes.stdout, "remote")?
        .lines()
        .map(str::trim)
        .find(|remote| !remote.is_empty())
        .map(str::to_owned);

    let upstream_output = run_git_output(
        root,
        [
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
        "read upstream",
    )
    .await?;
    if !upstream_output.status.success() {
        return Ok(GitRemoteStatus {
            remote: first_remote,
            upstream: None,
            ahead: 0,
            behind: 0,
        });
    }

    let upstream = decode_git_text(&upstream_output.stdout, "upstream")?
        .trim()
        .to_owned();
    if upstream.is_empty() {
        return Ok(GitRemoteStatus {
            remote: first_remote,
            upstream: None,
            ahead: 0,
            behind: 0,
        });
    }
    let remote = upstream
        .split_once('/')
        .map(|(remote, _)| remote.to_owned())
        .or(first_remote);
    let counts = run_git_checked(
        root,
        ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        "read divergence",
    )
    .await?;
    let counts = decode_git_text(&counts.stdout, "divergence")?;
    let mut fields = counts.split_whitespace();
    let ahead = parse_divergence_count(fields.next(), "ahead")?;
    let behind = parse_divergence_count(fields.next(), "behind")?;
    if fields.next().is_some() {
        return Err(AppError::Worker(
            "Git returned malformed divergence counts".to_owned(),
        ));
    }

    Ok(GitRemoteStatus {
        remote,
        upstream: Some(upstream),
        ahead,
        behind,
    })
}

fn parse_divergence_count(value: Option<&str>, label: &str) -> AppResult<u32> {
    value
        .ok_or_else(|| AppError::Worker("Git returned incomplete divergence counts".to_owned()))?
        .parse::<u32>()
        .map_err(|_| AppError::Worker(format!("Git returned an invalid {label} count")))
}

fn require_remote(status: &GitRemoteStatus) -> AppResult<&str> {
    status.remote.as_deref().ok_or_else(|| {
        AppError::GitSafety("no remote is configured for this repository".to_owned())
    })
}

fn require_upstream(status: &GitRemoteStatus) -> AppResult<&str> {
    let _remote = require_remote(status)?;
    status.upstream.as_deref().ok_or_else(|| {
        AppError::GitSafety(
            "the current branch has no upstream; configure one in the terminal first".to_owned(),
        )
    })
}

async fn require_clean_worktree(root: &Path) -> AppResult<()> {
    let status = run_git_checked(
        root,
        ["status", "--porcelain=v1", "--untracked-files=normal"],
        "check pull safety",
    )
    .await?;
    if !status.stdout.is_empty() {
        return Err(AppError::GitSafety(
            "pull requires a clean worktree; commit or stash local changes first".to_owned(),
        ));
    }
    Ok(())
}

pub async fn stage(state: &AppState, work_dir: &str, file_path: &str) -> AppResult<SuccessResult> {
    let root = trusted_repository_root(state, work_dir).await?;
    let pathspec = safe_pathspec(&root, file_path).await?;
    run_git_checked_os(
        &root,
        [OsStr::new("add"), OsStr::new("--"), &pathspec],
        "stage",
    )
    .await?;
    Ok(SuccessResult::ok())
}

pub async fn unstage(
    state: &AppState,
    work_dir: &str,
    file_path: &str,
) -> AppResult<SuccessResult> {
    let root = trusted_repository_root(state, work_dir).await?;
    let pathspec = safe_pathspec(&root, file_path).await?;
    let reset = run_git_output_os(
        &root,
        [
            OsStr::new("reset"),
            OsStr::new("HEAD"),
            OsStr::new("--"),
            &pathspec,
        ],
        "unstage",
    )
    .await?;
    if !reset.status.success() {
        run_git_checked_os(
            &root,
            [
                OsStr::new("rm"),
                OsStr::new("--cached"),
                OsStr::new("--"),
                &pathspec,
            ],
            "unstage",
        )
        .await?;
    }
    Ok(SuccessResult::ok())
}

pub async fn commit(state: &AppState, work_dir: &str, message: &str) -> AppResult<SuccessResult> {
    let root = trusted_repository_root(state, work_dir).await?;
    let message = message.trim();
    if message.is_empty() || message.contains('\0') || message.len() > MAX_COMMIT_MESSAGE_BYTES {
        return Err(AppError::InvalidPath(
            "Git commit message must be non-empty, NUL-free, and at most 64 KiB".to_owned(),
        ));
    }
    run_git_checked_os(
        &root,
        [OsStr::new("commit"), OsStr::new("-m"), OsStr::new(message)],
        "commit",
    )
    .await?;
    Ok(SuccessResult::ok())
}

pub async fn log(state: &AppState, work_dir: &str) -> AppResult<Vec<GitLogEntry>> {
    let root = trusted_repository_root(state, work_dir).await?;
    read_log(&root, None).await
}

pub async fn file_log(
    state: &AppState,
    work_dir: &str,
    file_path: &str,
) -> AppResult<Vec<GitLogEntry>> {
    let root = trusted_repository_root(state, work_dir).await?;
    let pathspec = safe_pathspec(&root, file_path).await?;
    read_log(&root, Some(pathspec)).await
}

async fn read_log(root: &Path, pathspec: Option<OsString>) -> AppResult<Vec<GitLogEntry>> {
    let mut args = vec![
        OsString::from("log"),
        OsString::from("--pretty=format:%H%x1f%aI%x1f%an%x1f%s%x1e"),
        OsString::from(if pathspec.is_some() { "-50" } else { "-20" }),
    ];
    if let Some(pathspec) = pathspec {
        args.push(OsString::from("--follow"));
        args.push(OsString::from("--"));
        args.push(pathspec);
    }

    match run_git_checked_os(root, args.iter().map(OsString::as_os_str), "read log").await {
        Ok(output) => parse_log(&decode_git_text(&output.stdout, "log")?),
        Err(AppError::GitFailed { .. }) => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

async fn trusted_repository_root(state: &AppState, work_dir: &str) -> AppResult<PathBuf> {
    if work_dir.is_empty() || work_dir.contains('\0') {
        return Err(AppError::InvalidPath(work_dir.to_owned()));
    }
    let requested = PathBuf::from(work_dir);
    if !requested.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "Git workDir must be absolute: {}",
            requested.to_string_lossy()
        )));
    }
    let display = requested.to_string_lossy().into_owned();
    let canonical = tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(requested))
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?
        .map_err(|source| AppError::git_io("resolve", display, source))?;
    let project_root = state.project_root()?;
    if !paths_equal(&project_root, &canonical) {
        return Err(AppError::OutsideProject(
            canonical.to_string_lossy().into_owned(),
        ));
    }
    Ok(canonical)
}

async fn safe_pathspec(root: &Path, file_path: &str) -> AppResult<OsString> {
    if file_path.is_empty() || file_path.contains('\0') {
        return Err(AppError::InvalidPath(file_path.to_owned()));
    }
    let requested = Path::new(file_path);
    let relative = if requested.is_absolute() {
        let requested = requested.to_path_buf();
        let display = requested.to_string_lossy().into_owned();
        let canonical =
            tauri::async_runtime::spawn_blocking(move || dunce::canonicalize(requested))
                .await
                .map_err(|error| AppError::Worker(error.to_string()))?
                .map_err(|source| AppError::git_io("resolve file", display, source))?;
        canonical
            .strip_prefix(root)
            .map_err(|_| AppError::OutsideProject(canonical.to_string_lossy().into_owned()))?
            .to_path_buf()
    } else {
        reject_unsafe_relative_path(requested)?;
        requested.to_path_buf()
    };

    if relative.as_os_str().is_empty() {
        return Err(AppError::InvalidPath(file_path.to_owned()));
    }
    Ok(relative.into_os_string())
}

fn reject_unsafe_relative_path(path: &Path) -> AppResult<()> {
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(AppError::InvalidPath(path.to_string_lossy().into_owned()));
    }
    Ok(())
}

async fn run_git_checked<I, S>(root: &Path, args: I, operation: &'static str) -> AppResult<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_git_checked_os(root, args, operation).await
}

async fn run_git_checked_os<I, S>(
    root: &Path,
    args: I,
    operation: &'static str,
) -> AppResult<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git_output_os(root, args, operation).await?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(AppError::GitFailed {
            operation,
            status: output
                .status
                .code()
                .map_or_else(|| "signal".to_owned(), |code| code.to_string()),
            message: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        })
    }
}

async fn run_git_output<I, S>(root: &Path, args: I, operation: &'static str) -> AppResult<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_git_output_os(root, args, operation).await
}

async fn run_git_output_os<I, S>(root: &Path, args: I, operation: &'static str) -> AppResult<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let display_root = root.to_string_lossy().into_owned();
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(root)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
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
            read_git_pipe(
                stdout,
                Arc::clone(&total_output),
                MAX_GIT_OUTPUT_BYTES,
                operation,
                &display_root,
            ),
            read_git_pipe(
                stderr,
                Arc::clone(&total_output),
                MAX_GIT_OUTPUT_BYTES,
                operation,
                &display_root,
            ),
        )?;
        Ok::<_, AppError>(Output {
            status,
            stdout,
            stderr,
        })
    };

    match timeout(git_timeout(operation), transaction).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(error)) => {
            terminate_git_process_tree(&mut child, process_id).await;
            Err(error)
        }
        Err(_) => {
            terminate_git_process_tree(&mut child, process_id).await;
            Err(AppError::git_io(
                operation,
                display_root,
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    format!(
                        "Git operation timed out after {} seconds",
                        git_timeout(operation).as_secs()
                    ),
                ),
            ))
        }
    }
}

async fn read_git_pipe<R>(
    mut reader: R,
    total_output: Arc<AtomicUsize>,
    limit: usize,
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
        if previous.saturating_add(length) > limit {
            return Err(AppError::GitOutputTooLarge {
                operation,
                limit_mb: limit / (1024 * 1024),
            });
        }
        output.extend_from_slice(&buffer[..length]);
    }
}

fn git_timeout(operation: &str) -> Duration {
    match operation {
        "fetch" | "pull" | "push" => GIT_NETWORK_TIMEOUT,
        "commit" => GIT_COMMIT_TIMEOUT,
        "initialize" | "stage" | "unstage" => GIT_MUTATION_TIMEOUT,
        _ => GIT_READ_TIMEOUT,
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

fn parse_status(bytes: &[u8], branch: &str) -> AppResult<GitStatusResult> {
    let records: Vec<&[u8]> = bytes.split(|byte| *byte == 0).collect();
    let mut files = Vec::new();
    let mut staged = Vec::new();
    let mut modified = Vec::new();
    let mut not_added = Vec::new();
    let mut index = 0;

    while index < records.len() {
        let record = records[index];
        index += 1;
        if record.is_empty() {
            continue;
        }
        if record.len() < 4 || record[2] != b' ' {
            return Err(AppError::Worker(
                "Git returned malformed porcelain status".to_owned(),
            ));
        }
        let index_status = record[0] as char;
        let working_status = record[1] as char;
        let path = decode_git_text(&record[3..], "status path")?;

        if matches!(index_status, 'R' | 'C') || matches!(working_status, 'R' | 'C') {
            // Porcelain v1 -z emits the destination first and the source in a
            // second NUL-delimited field. The UI decorates/actions the current
            // destination, so consume but do not expose the source field.
            if index >= records.len() || records[index].is_empty() {
                return Err(AppError::Worker(
                    "Git returned a rename without its source path".to_owned(),
                ));
            }
            index += 1;
        }

        if index_status != ' ' && index_status != '?' {
            staged.push(path.clone());
        }
        if matches!(working_status, 'M' | 'D' | 'R' | 'C') {
            modified.push(path.clone());
        }
        if index_status == '?' && working_status == '?' {
            not_added.push(path.clone());
        }
        files.push(GitFileStatus {
            path,
            index: index_status.to_string(),
            working_dir: working_status.to_string(),
        });
    }

    Ok(GitStatusResult {
        branch: branch.to_owned(),
        files,
        staged,
        modified,
        not_added,
    })
}

fn parse_log(output: &str) -> AppResult<Vec<GitLogEntry>> {
    output
        .split('\x1e')
        .filter(|record| !record.trim().is_empty())
        .map(|record| {
            let mut fields = record.trim().splitn(4, '\x1f');
            let hash = fields.next().unwrap_or_default();
            let date = fields.next().unwrap_or_default();
            let author = fields.next().unwrap_or_default();
            let message = fields.next().unwrap_or_default();
            if hash.is_empty() || date.is_empty() || author.is_empty() {
                return Err(AppError::Worker(
                    "Git returned malformed log output".to_owned(),
                ));
            }
            Ok(GitLogEntry {
                hash: hash.to_owned(),
                date: date.to_owned(),
                author: author.to_owned(),
                message: message.to_owned(),
            })
        })
        .collect()
}

fn decode_git_text(bytes: &[u8], field: &str) -> AppResult<String> {
    String::from_utf8(bytes.to_vec()).map_err(|_| AppError::NonUtf8Path(format!("Git {field}")))
}

fn trim_ascii(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|byte| !byte.is_ascii_whitespace())
        .map_or(start, |position| position + 1);
    &bytes[start..end]
}

#[cfg(not(windows))]
fn paths_equal(left: &Path, right: &Path) -> bool {
    left == right
}

#[cfg(windows)]
fn paths_equal(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::{
        commit, diff, fetch, file_log, git_timeout, init_repository, log, parse_log, parse_status,
        pull, push, read_git_pipe, reject_unsafe_relative_path, remote_status, run_git_checked,
        run_git_checked_os, stage, status, GIT_COMMIT_TIMEOUT, GIT_MUTATION_TIMEOUT,
        GIT_NETWORK_TIMEOUT, GIT_READ_TIMEOUT,
    };
    use crate::{error::AppError, state::AppState};
    use std::{
        ffi::OsStr,
        fs,
        path::Path,
        sync::{atomic::AtomicUsize, Arc},
    };

    #[test]
    fn parses_nul_delimited_status_and_rename_destinations() {
        let parsed = parse_status(
            b"M  staged.tex\0 M changed.tex\0?? new file.tex\0R  renamed.tex\0old.tex\0",
            "main",
        )
        .expect("parse status");

        assert_eq!(parsed.branch, "main");
        assert_eq!(parsed.staged, ["staged.tex", "renamed.tex"]);
        assert_eq!(parsed.modified, ["changed.tex"]);
        assert_eq!(parsed.not_added, ["new file.tex"]);
        assert_eq!(parsed.files.len(), 4);
    }

    #[test]
    fn parses_log_messages_without_pipe_delimiter_ambiguity() {
        let parsed = parse_log(
            "abc\x1f2026-08-20T00:00:00Z\x1fAda\x1fkeep | in message\x1edef\x1f2026-08-19T00:00:00Z\x1fLin\x1fprevious\x1e",
        )
        .expect("parse log");

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].message, "keep | in message");
        assert_eq!(parsed[1].hash, "def");
    }

    #[test]
    fn rejects_pathspecs_that_escape_the_project() {
        assert!(reject_unsafe_relative_path(Path::new("chapters/one.tex")).is_ok());
        assert!(reject_unsafe_relative_path(Path::new("../outside.tex")).is_err());
    }

    #[test]
    fn assigns_bounded_timeouts_by_git_operation() {
        assert_eq!(git_timeout("read status"), GIT_READ_TIMEOUT);
        assert_eq!(git_timeout("initialize"), GIT_MUTATION_TIMEOUT);
        assert_eq!(git_timeout("stage"), GIT_MUTATION_TIMEOUT);
        assert_eq!(git_timeout("unstage"), GIT_MUTATION_TIMEOUT);
        assert_eq!(git_timeout("commit"), GIT_COMMIT_TIMEOUT);
        assert_eq!(git_timeout("fetch"), GIT_NETWORK_TIMEOUT);
        assert_eq!(git_timeout("pull"), GIT_NETWORK_TIMEOUT);
        assert_eq!(git_timeout("push"), GIT_NETWORK_TIMEOUT);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn bounds_the_combined_streamed_git_output() {
        let total = Arc::new(AtomicUsize::new(0));
        let stdout = read_git_pipe(&b"abc"[..], Arc::clone(&total), 4, "read diff", "/project")
            .await
            .expect("stdout within the shared limit");
        assert_eq!(stdout, b"abc");

        let error = read_git_pipe(&b"de"[..], Arc::clone(&total), 4, "read diff", "/project")
            .await
            .expect_err("stderr pushes combined output over the shared limit");
        assert!(matches!(
            error,
            AppError::GitOutputTooLarge {
                operation: "read diff",
                ..
            }
        ));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn performs_the_renderer_git_workflow_against_system_git() {
        let temp = tempfile::tempdir().expect("temporary repository");
        let root = dunce::canonicalize(temp.path()).expect("canonical repository root");
        let root_text = root.to_string_lossy().into_owned();
        let state = AppState::default();
        state
            .set_project_root(root.clone())
            .expect("trust repository root");

        init_repository(&state, &root_text)
            .await
            .expect("initialize repository");
        run_git_checked(&root, ["config", "user.name", "TextEx Test"], "configure")
            .await
            .expect("configure user name");
        run_git_checked(
            &root,
            ["config", "user.email", "textex@example.invalid"],
            "configure",
        )
        .await
        .expect("configure user email");
        run_git_checked(&root, ["config", "commit.gpgsign", "false"], "configure")
            .await
            .expect("disable signing");

        let file = root.join("main.tex");
        fs::write(&file, "first revision\n").expect("write source");
        let untracked = status(&state, &root_text).await.expect("read status");
        assert_eq!(untracked.not_added, ["main.tex"]);

        stage(&state, &root_text, "main.tex")
            .await
            .expect("stage source");
        let staged = status(&state, &root_text)
            .await
            .expect("read staged status");
        assert_eq!(staged.staged, ["main.tex"]);

        commit(&state, &root_text, "initial | revision")
            .await
            .expect("commit source");
        let entries = log(&state, &root_text).await.expect("read repository log");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].message, "initial | revision");
        assert_eq!(
            file_log(&state, &root_text, &file.to_string_lossy())
                .await
                .expect("read file log")
                .len(),
            1
        );

        fs::write(&file, "second revision\n").expect("modify source");
        assert!(diff(&state, &root_text)
            .await
            .expect("read diff")
            .contains("second revision"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn performs_safe_remote_fetch_pull_and_push_against_a_local_remote() {
        let temp = tempfile::tempdir().expect("temporary Git workspace");
        let parent = dunce::canonicalize(temp.path()).expect("canonical workspace");
        let root = parent.join("paper");
        let remote = parent.join("paper.git");
        let collaborator = parent.join("collaborator");
        fs::create_dir(&root).expect("create paper repository");

        run_git_checked_os(
            &parent,
            [OsStr::new("init"), OsStr::new("--bare"), remote.as_os_str()],
            "initialize test remote",
        )
        .await
        .expect("initialize bare remote");

        let root_text = root.to_string_lossy().into_owned();
        let state = AppState::default();
        state
            .set_project_root(root.clone())
            .expect("trust repository root");
        init_repository(&state, &root_text)
            .await
            .expect("initialize paper repository");
        run_git_checked(&root, ["config", "user.name", "TextEx Test"], "configure")
            .await
            .expect("configure user name");
        run_git_checked(
            &root,
            ["config", "user.email", "textex@example.invalid"],
            "configure",
        )
        .await
        .expect("configure user email");
        run_git_checked(&root, ["config", "commit.gpgsign", "false"], "configure")
            .await
            .expect("disable signing");
        fs::write(root.join("main.tex"), "initial\n").expect("write initial paper");
        stage(&state, &root_text, "main.tex")
            .await
            .expect("stage initial paper");
        commit(&state, &root_text, "initial paper")
            .await
            .expect("commit initial paper");
        run_git_checked_os(
            &root,
            [
                OsStr::new("remote"),
                OsStr::new("add"),
                OsStr::new("origin"),
                remote.as_os_str(),
            ],
            "configure test remote",
        )
        .await
        .expect("add test remote");
        run_git_checked(
            &root,
            ["push", "--set-upstream", "origin", "HEAD:main"],
            "seed test remote",
        )
        .await
        .expect("seed test remote");
        run_git_checked(
            &remote,
            ["symbolic-ref", "HEAD", "refs/heads/main"],
            "configure remote head",
        )
        .await
        .expect("configure remote head");

        let initial_remote = remote_status(&state, &root_text)
            .await
            .expect("read initial remote status");
        assert_eq!(initial_remote.remote.as_deref(), Some("origin"));
        assert_eq!(initial_remote.upstream.as_deref(), Some("origin/main"));
        assert_eq!((initial_remote.ahead, initial_remote.behind), (0, 0));

        run_git_checked_os(
            &parent,
            [
                OsStr::new("clone"),
                remote.as_os_str(),
                collaborator.as_os_str(),
            ],
            "clone collaborator",
        )
        .await
        .expect("clone collaborator");
        run_git_checked(
            &collaborator,
            ["config", "user.name", "Collaborator"],
            "configure collaborator",
        )
        .await
        .expect("configure collaborator name");
        run_git_checked(
            &collaborator,
            ["config", "user.email", "collaborator@example.invalid"],
            "configure collaborator",
        )
        .await
        .expect("configure collaborator email");
        run_git_checked(
            &collaborator,
            ["config", "commit.gpgsign", "false"],
            "configure collaborator",
        )
        .await
        .expect("disable collaborator signing");
        fs::write(collaborator.join("main.tex"), "from remote\n")
            .expect("write collaborator change");
        run_git_checked(&collaborator, ["add", "main.tex"], "stage collaborator")
            .await
            .expect("stage collaborator change");
        run_git_checked(
            &collaborator,
            ["commit", "-m", "remote revision"],
            "commit collaborator",
        )
        .await
        .expect("commit collaborator change");
        run_git_checked(&collaborator, ["push"], "push collaborator")
            .await
            .expect("push collaborator change");

        let fetched = fetch(&state, &root_text)
            .await
            .expect("fetch remote change");
        assert_eq!((fetched.ahead, fetched.behind), (0, 1));
        let pulled = pull(&state, &root_text)
            .await
            .expect("fast-forward remote change");
        assert_eq!((pulled.ahead, pulled.behind), (0, 0));
        assert_eq!(
            fs::read_to_string(root.join("main.tex")).expect("read pulled paper"),
            "from remote\n"
        );

        fs::write(root.join("main.tex"), "dirty\n").expect("write dirty paper");
        let refused = pull(&state, &root_text)
            .await
            .expect_err("dirty worktree must be refused");
        assert!(matches!(refused, AppError::GitSafety(_)));

        fs::write(root.join("main.tex"), "local revision\n").expect("write local revision");
        stage(&state, &root_text, "main.tex")
            .await
            .expect("stage local revision");
        commit(&state, &root_text, "local revision")
            .await
            .expect("commit local revision");
        let before_push = remote_status(&state, &root_text)
            .await
            .expect("read status before push");
        assert_eq!((before_push.ahead, before_push.behind), (1, 0));
        let pushed = push(&state, &root_text).await.expect("push local revision");
        assert_eq!((pushed.ahead, pushed.behind), (0, 0));
    }
}
