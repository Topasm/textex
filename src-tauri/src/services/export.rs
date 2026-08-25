use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tokio::{io::AsyncReadExt, process::Command, time::timeout};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{
    error::{AppError, AppResult},
    models::{ExportFormat, ExportResult},
    services::filesystem,
    state::AppState,
};

const EXPORT_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_STDERR_BYTES: u64 = 1024 * 1024;
const MAX_OUTPUT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_OVERLEAF_FILES: usize = 20_000;
const MAX_OVERLEAF_SOURCE_BYTES: u64 = 512 * 1024 * 1024;

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

pub async fn export_overleaf_zip(
    app: &AppHandle,
    state: &AppState,
) -> AppResult<Option<ExportResult>> {
    let (selected_project_root, selected_project_epoch, _) = state.project_root_epoch()?;
    let project_name = selected_project_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project");
    let selected = app
        .dialog()
        .file()
        .set_file_name(format!("{project_name}-overleaf.zip"))
        .add_filter("ZIP Archives", &["zip"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let _project_operation = state.lock_project_operation().await;
    let (project_root, project_epoch, _) = state.project_root_epoch()?;
    if project_epoch != selected_project_epoch || project_root != selected_project_root {
        return Err(export_error(
            "the active project changed while choosing the Overleaf ZIP destination",
        ));
    }
    let output = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    validate_output_target(&output).await?;
    let staged = filesystem::reserve_external_output(&output, "overleaf").await?;
    let archive_root = project_root.clone();
    let archive_staged = staged.clone();
    let archive_output = output.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        create_overleaf_zip_at(
            &archive_root,
            &archive_staged,
            Some(archive_output.as_path()),
        )
    })
    .await
    .map_err(|error| AppError::Worker(error.to_string()))?;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&staged).await;
        return Err(error);
    }
    let metadata = tokio::fs::metadata(&staged)
        .await
        .map_err(|source| AppError::io("inspect Overleaf ZIP", display(&staged), source))?;
    if !metadata.is_file() || metadata.len() > MAX_OUTPUT_BYTES {
        let _ = tokio::fs::remove_file(&staged).await;
        return Err(export_error("Overleaf ZIP is missing or exceeds 512 MiB"));
    }
    filesystem::commit_external_output(staged, output.clone()).await?;
    Ok(Some(ExportResult {
        success: true,
        output_path: filesystem::path_to_string(&output)?,
    }))
}

fn create_overleaf_zip_at(
    project_root: &Path,
    archive_path: &Path,
    final_output: Option<&Path>,
) -> AppResult<()> {
    let mut files = Vec::new();
    let mut total_bytes = 0_u64;
    collect_overleaf_sources(
        project_root,
        project_root,
        archive_path,
        final_output,
        &mut files,
        &mut total_bytes,
    )?;
    files.sort();
    let archive = File::create(archive_path)
        .map_err(|source| AppError::io("create Overleaf ZIP", display(archive_path), source))?;
    let mut zip = ZipWriter::new(archive);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut buffer = [0_u8; 64 * 1024];

    for source in files {
        let relative = source
            .strip_prefix(project_root)
            .map_err(|_| export_error("Overleaf source escaped the project root"))?;
        let archive_name = relative
            .components()
            .map(|component| component.as_os_str().to_str())
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| export_error("Overleaf source path is not valid UTF-8"))?
            .join("/");
        zip.start_file(archive_name, options)
            .map_err(|error| export_error(format!("could not add ZIP entry: {error}")))?;
        let mut input = File::open(&source).map_err(|source_error| {
            AppError::io("open Overleaf source", display(&source), source_error)
        })?;
        loop {
            let read = input.read(&mut buffer).map_err(|source_error| {
                AppError::io("read Overleaf source", display(&source), source_error)
            })?;
            if read == 0 {
                break;
            }
            zip.write_all(&buffer[..read])
                .map_err(|error| export_error(format!("could not write ZIP entry: {error}")))?;
        }
    }
    zip.finish()
        .map_err(|error| export_error(format!("could not finish Overleaf ZIP: {error}")))?;
    Ok(())
}

fn collect_overleaf_sources(
    project_root: &Path,
    directory: &Path,
    archive_path: &Path,
    final_output: Option<&Path>,
    files: &mut Vec<PathBuf>,
    total_bytes: &mut u64,
) -> AppResult<()> {
    let entries = std::fs::read_dir(directory).map_err(|source| {
        AppError::io("read Overleaf source directory", display(directory), source)
    })?;
    for entry in entries {
        let entry = entry.map_err(|source| {
            AppError::io("read Overleaf source entry", display(directory), source)
        })?;
        let path = entry.path();
        if path == archive_path || final_output.is_some_and(|output| path == output) {
            continue;
        }
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            return Err(export_error("Overleaf source path is not valid UTF-8"));
        };
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|source| AppError::io("inspect Overleaf source", display(&path), source))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            if is_excluded_overleaf_directory(name) {
                continue;
            }
            collect_overleaf_sources(
                project_root,
                &path,
                archive_path,
                final_output,
                files,
                total_bytes,
            )?;
        } else if metadata.is_file() && !is_generated_latex_file(name) {
            if !path.starts_with(project_root) {
                return Err(export_error("Overleaf source escaped the project root"));
            }
            *total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| export_error("Overleaf source size overflow"))?;
            if *total_bytes > MAX_OVERLEAF_SOURCE_BYTES {
                return Err(export_error("Overleaf sources exceed 512 MiB"));
            }
            if files.len() >= MAX_OVERLEAF_FILES {
                return Err(export_error("Overleaf project exceeds 20,000 files"));
            }
            files.push(path);
        }
    }
    Ok(())
}

fn is_excluded_overleaf_directory(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        ".git"
            | ".hg"
            | ".svn"
            | ".textex"
            | ".tectonic"
            | "node_modules"
            | "target"
            | "__pycache__"
    )
}

fn is_generated_latex_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower == ".ds_store" {
        return true;
    }
    const GENERATED_SUFFIXES: &[&str] = &[
        ".aux",
        ".bcf",
        ".blg",
        ".dvi",
        ".fdb_latexmk",
        ".fls",
        ".ilg",
        ".lof",
        ".log",
        ".lot",
        ".nav",
        ".out",
        ".run.xml",
        ".snm",
        ".synctex",
        ".synctex.gz",
        ".toc",
        ".vrb",
        ".xdv",
    ];
    if GENERATED_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
    {
        return true;
    }
    false
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
    let stderr = child
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
    use std::{fs::File, io::Read};

    use super::{create_overleaf_zip_at, formats, platform_directory, validate_format};
    use zip::ZipArchive;

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

    #[test]
    fn overleaf_zip_contains_sources_but_excludes_build_outputs_and_private_metadata() {
        let directory = tempfile::tempdir().expect("project tempdir");
        let root = directory.path().join("paper");
        std::fs::create_dir_all(root.join("figures")).expect("create source tree");
        std::fs::create_dir_all(root.join(".git")).expect("create git metadata");
        std::fs::write(root.join("main.tex"), "source").expect("write tex");
        std::fs::write(root.join("references.bib"), "bib").expect("write bib");
        std::fs::write(root.join("main.aux"), "generated").expect("write aux");
        std::fs::write(root.join("main.pdf"), "source-compatible pdf").expect("write pdf");
        std::fs::write(root.join("main.bbl"), "submission bibliography").expect("write bbl");
        std::fs::write(root.join(".latexmkrc"), "xelatex").expect("write latexmkrc");
        std::fs::write(root.join(".git/config"), "private").expect("write git config");
        std::fs::write(root.join("figures/result.pdf"), "source figure")
            .expect("write source figure");
        let archive_path = directory.path().join("paper-overleaf.zip");

        create_overleaf_zip_at(&root, &archive_path, None).expect("create archive");
        let mut archive = ZipArchive::new(File::open(archive_path).expect("open archive"))
            .expect("parse archive");
        let mut names = (0..archive.len())
            .map(|index| {
                archive
                    .by_index(index)
                    .expect("archive entry")
                    .name()
                    .to_owned()
            })
            .collect::<Vec<_>>();
        names.sort();
        assert_eq!(
            names,
            [
                ".latexmkrc",
                "figures/result.pdf",
                "main.bbl",
                "main.pdf",
                "main.tex",
                "references.bib"
            ]
        );
        let mut source = String::new();
        archive
            .by_name("main.tex")
            .expect("main source")
            .read_to_string(&mut source)
            .expect("read main source");
        assert_eq!(source, "source");
    }
}
