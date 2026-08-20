use std::{
    ffi::{OsStr, OsString},
    path::{Component, Path, PathBuf},
    process::Output,
};

use tokio::process::Command;

use crate::{
    error::{AppError, AppResult},
    models::{GitFileStatus, GitLogEntry, GitStatusResult, SuccessResult},
    state::AppState,
};

const MAX_GIT_OUTPUT_BYTES: usize = 10 * 1024 * 1024;
const MAX_COMMIT_MESSAGE_BYTES: usize = 64 * 1024;

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

pub async fn diff(state: &AppState, work_dir: &str) -> AppResult<String> {
    let root = trusted_repository_root(state, work_dir).await?;
    let output = run_git_checked(&root, ["diff"], "read diff").await?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
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
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .env("LC_ALL", "C")
        .output()
        .await
        .map_err(|source| AppError::git_io(operation, display_root, source))?;
    if output.stdout.len().saturating_add(output.stderr.len()) > MAX_GIT_OUTPUT_BYTES {
        return Err(AppError::GitOutputTooLarge {
            operation,
            limit_mb: MAX_GIT_OUTPUT_BYTES / (1024 * 1024),
        });
    }
    Ok(output)
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
        commit, diff, file_log, init_repository, log, parse_log, parse_status,
        reject_unsafe_relative_path, run_git_checked, stage, status,
    };
    use crate::state::AppState;
    use std::{fs, path::Path};

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
}
