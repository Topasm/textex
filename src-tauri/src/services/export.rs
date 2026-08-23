use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tokio::{io::AsyncReadExt, process::Command, time::timeout};

use crate::{
    error::{AppError, AppResult},
    models::{ExportFormat, ExportResult},
    services::filesystem,
    state::AppState,
};

const EXPORT_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_STDERR_BYTES: u64 = 1024 * 1024;
const MAX_OUTPUT_BYTES: u64 = 512 * 1024 * 1024;

pub fn formats() -> Vec<ExportFormat> {
    vec![
        ExportFormat {
            name: "HTML",
            ext: "html",
        },
        ExportFormat {
            name: "DOCX",
            ext: "docx",
        },
        ExportFormat {
            name: "ODT",
            ext: "odt",
        },
        ExportFormat {
            name: "EPUB",
            ext: "epub",
        },
    ]
}

pub async fn export_document(
    app: &AppHandle,
    state: &AppState,
    input_path: &str,
    format: &str,
) -> AppResult<Option<ExportResult>> {
    let extension = validate_format(format)?;
    let input = filesystem::validate_existing_project_file(state, input_path).await?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("tex"))
    {
        return Err(export_error("only .tex source files can be exported"));
    }
    let default_name = input
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| format!("{value}.{extension}"))
        .ok_or_else(|| export_error("input filename is not valid UTF-8"))?;
    let selected = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(format.to_ascii_uppercase(), &[extension])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let output = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    validate_output_target(&output).await?;
    let staged = filesystem::reserve_external_output(&output, "pandoc").await?;
    let pandoc = resolve_pandoc(app);

    let result = run_pandoc(&pandoc, &input, &staged, extension).await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&staged).await;
        return Err(error);
    }
    let metadata = tokio::fs::metadata(&staged)
        .await
        .map_err(|source| AppError::io("inspect Pandoc output", display(&staged), source))?;
    if !metadata.is_file() || metadata.len() > MAX_OUTPUT_BYTES {
        let _ = tokio::fs::remove_file(&staged).await;
        return Err(export_error("Pandoc output is missing or exceeds 512 MiB"));
    }
    filesystem::commit_external_output(staged, output.clone()).await?;
    Ok(Some(ExportResult {
        success: true,
        output_path: filesystem::path_to_string(&output)?,
    }))
}

async fn run_pandoc(pandoc: &Path, input: &Path, output: &Path, format: &str) -> AppResult<()> {
    let work_dir = input
        .parent()
        .ok_or_else(|| export_error("input file has no parent directory"))?;
    let mut command = Command::new(pandoc);
    command
        .arg(input)
        .arg("-o")
        .arg(output)
        .arg("-f")
        .arg("latex")
        .arg("-t")
        .arg(format)
        .current_dir(work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(|source| {
        export_error(format!(
            "Pandoc is not installed or could not be started at {}: {source}",
            pandoc.to_string_lossy()
        ))
    })?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| export_error("could not capture Pandoc diagnostics"))?;
    let operation = async {
        let wait_for_child = async {
            child.wait().await.map_err(|source| {
                export_error(format!("could not wait for Pandoc process: {source}"))
            })
        };
        let read_stderr = async {
            let mut bytes = Vec::new();
            stderr
                .take(MAX_STDERR_BYTES + 1)
                .read_to_end(&mut bytes)
                .await
                .map_err(|source| {
                    export_error(format!("could not read Pandoc output: {source}"))
                })?;
            AppResult::Ok(bytes)
        };
        tokio::try_join!(wait_for_child, read_stderr)
    };
    let (status, stderr) = match timeout(EXPORT_TIMEOUT, operation).await {
        Ok(result) => result?,
        Err(_) => return Err(export_error("Pandoc timed out after 180 seconds")),
    };
    if stderr.len() > MAX_STDERR_BYTES as usize {
        return Err(export_error("Pandoc diagnostics exceeded 1 MiB"));
    }
    if !status.success() {
        let message = String::from_utf8_lossy(&stderr).trim().to_owned();
        return Err(export_error(if message.is_empty() {
            format!("Pandoc exited unsuccessfully ({status})")
        } else {
            message
        }));
    }
    Ok(())
}

fn resolve_pandoc(app: &AppHandle) -> PathBuf {
    let binary_name = if cfg!(windows) {
        "pandoc.exe"
    } else {
        "pandoc"
    };
    if let Ok(resources) = app.path().resource_dir() {
        for candidate in [
            resources.join("bin").join(binary_name),
            resources
                .join("bin")
                .join(platform_directory())
                .join(binary_name),
        ] {
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    PathBuf::from(binary_name)
}

async fn validate_output_target(path: &Path) -> AppResult<()> {
    if !path.is_absolute() {
        return Err(AppError::InvalidPath(display(path)));
    }
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidPath(display(path)))?;
    let canonical_parent = dunce::canonicalize(parent)
        .map_err(|source| AppError::io("resolve export directory", display(parent), source))?;
    if !canonical_parent.is_dir() {
        return Err(AppError::NotADirectory(display(&canonical_parent)));
    }
    match tokio::fs::symlink_metadata(path).await {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err(export_error("export target must be a regular file"));
        }
        Ok(_) => {}
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => {}
        Err(source) => {
            return Err(AppError::io("inspect export target", display(path), source));
        }
    }
    Ok(())
}

fn validate_format(format: &str) -> AppResult<&'static str> {
    match format {
        "html" => Ok("html"),
        "docx" => Ok("docx"),
        "odt" => Ok("odt"),
        "epub" => Ok("epub"),
        _ => Err(export_error("unsupported export format")),
    }
}

const fn platform_directory() -> &'static str {
    if cfg!(windows) {
        "win"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    }
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn export_error(message: impl Into<String>) -> AppError {
    AppError::Export(message.into())
}

#[cfg(test)]
mod tests {
    use super::{formats, platform_directory, validate_format};

    #[test]
    fn exposes_only_supported_pandoc_formats() {
        assert_eq!(
            formats()
                .into_iter()
                .map(|format| format.ext)
                .collect::<Vec<_>>(),
            ["html", "docx", "odt", "epub"]
        );
        assert!(validate_format("pdf").is_err());
        assert!(!platform_directory().is_empty());
    }
}
