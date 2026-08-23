use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tokio::{fs, sync::Mutex};
use zip::ZipArchive;

use crate::{
    error::{AppError, AppResult},
    models::{SuccessResult, Template, TemplateProjectResult},
    services::filesystem,
    state::AppState,
};

const CUSTOM_TEMPLATES_FILE: &str = "custom-templates.json";
const MAX_TEMPLATES: usize = 256;
const MAX_NAME_BYTES: usize = 200;
const MAX_DESCRIPTION_BYTES: usize = 4 * 1024;
const MAX_CONTENT_BYTES: usize = 10 * 1024 * 1024;
const MAX_TEMPLATE_FILES: usize = 512;
const MAX_TEMPLATE_FILE_BYTES: usize = 20 * 1024 * 1024;
const MAX_TEMPLATE_TOTAL_BYTES: usize = 100 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: u64 = 100 * 1024 * 1024;
static TEMPLATE_ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct TemplateState {
    operation_lock: Mutex<()>,
}

#[derive(Deserialize)]
struct TemplateMetadata {
    name: Option<String>,
    description: Option<String>,
}

pub async fn list_custom(app: &AppHandle, state: &TemplateState) -> AppResult<Vec<Template>> {
    let _guard = state.operation_lock.lock().await;
    let path = custom_templates_path(app)?;
    let legacy_paths = legacy_template_paths(&path);
    load_with_legacy_import(&path, &legacy_paths).await
}

pub async fn add_custom(
    app: &AppHandle,
    state: &TemplateState,
    name: String,
    description: String,
    content: String,
) -> AppResult<Template> {
    validate_text_fields(&name, &description, &content)?;
    let _guard = state.operation_lock.lock().await;
    let path = custom_templates_path(app)?;
    let mut templates = load_with_legacy_import(&path, &legacy_template_paths(&path)).await?;
    if templates.len() >= MAX_TEMPLATES {
        return Err(template_error(format!(
            "at most {MAX_TEMPLATES} custom templates may be stored"
        )));
    }

    let template = Template {
        id: new_template_id(),
        name,
        description,
        content,
        built_in: false,
        files: None,
    };
    templates.push(template.clone());
    save_custom_templates(&path, &templates).await?;
    Ok(template)
}

pub async fn remove_custom(
    app: &AppHandle,
    state: &TemplateState,
    id: &str,
) -> AppResult<SuccessResult> {
    validate_template_id(id)?;
    let _guard = state.operation_lock.lock().await;
    let path = custom_templates_path(app)?;
    let mut templates = load_with_legacy_import(&path, &legacy_template_paths(&path)).await?;
    let previous_len = templates.len();
    templates.retain(|template| template.id != id);
    if templates.len() == previous_len {
        return Err(template_error(format!(
            "template with id \"{id}\" was not found"
        )));
    }
    save_custom_templates(&path, &templates).await?;
    Ok(SuccessResult::ok())
}

pub async fn import_zip(app: &AppHandle, state: &TemplateState) -> AppResult<Option<Template>> {
    let selected = app
        .dialog()
        .file()
        .add_filter("ZIP Archives", &["zip"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    let metadata = fs::metadata(&path)
        .await
        .map_err(|source| AppError::io("inspect template archive", display(&path), source))?;
    if !metadata.is_file() || metadata.len() > MAX_ARCHIVE_BYTES {
        return Err(template_error("template archive exceeds the 100 MiB limit"));
    }

    let imported = tauri::async_runtime::spawn_blocking(move || parse_template_zip(&path))
        .await
        .map_err(|error| AppError::Worker(error.to_string()))??;
    validate_template(&imported)?;

    let _guard = state.operation_lock.lock().await;
    let custom_path = custom_templates_path(app)?;
    let mut templates =
        load_with_legacy_import(&custom_path, &legacy_template_paths(&custom_path)).await?;
    if templates.len() >= MAX_TEMPLATES {
        return Err(template_error(format!(
            "at most {MAX_TEMPLATES} custom templates may be stored"
        )));
    }
    templates.push(imported.clone());
    save_custom_templates(&custom_path, &templates).await?;
    Ok(Some(imported))
}

pub async fn create_project(
    app: &AppHandle,
    project_state: &AppState,
    template_name: &str,
    content: String,
    files: Option<HashMap<String, String>>,
) -> AppResult<Option<TemplateProjectResult>> {
    validate_text_fields(template_name, "", &content)?;
    let default_name = safe_default_project_name(template_name);
    let selected = app
        .dialog()
        .file()
        .set_title("Create Project Folder")
        .set_file_name(&default_name)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let project_dir = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    create_project_at(project_state, project_dir, content, files)
        .await
        .map(Some)
}

async fn create_project_at(
    project_state: &AppState,
    project_dir: PathBuf,
    content: String,
    files: Option<HashMap<String, String>>,
) -> AppResult<TemplateProjectResult> {
    if !project_dir.is_absolute() {
        return Err(AppError::InvalidPath(display(&project_dir)));
    }
    match fs::symlink_metadata(&project_dir).await {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Ok(_) => return Err(template_error("project destination already exists")),
        Err(source) => {
            return Err(AppError::io(
                "inspect project destination",
                display(&project_dir),
                source,
            ));
        }
    }
    let parent = project_dir
        .parent()
        .ok_or_else(|| AppError::InvalidPath(display(&project_dir)))?;
    let canonical_parent = dunce::canonicalize(parent)
        .map_err(|source| AppError::io("resolve project parent", display(parent), source))?;
    if !canonical_parent.is_dir() {
        return Err(AppError::NotADirectory(display(&canonical_parent)));
    }
    let name = project_dir
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(display(&project_dir)))?;
    let project_dir = canonical_parent.join(name);
    fs::create_dir(&project_dir)
        .await
        .map_err(|source| AppError::io("create template project", display(&project_dir), source))?;

    let result = write_project_files(&project_dir, content, files).await;
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&project_dir).await;
        return Err(error);
    }
    let canonical_project = dunce::canonicalize(&project_dir).map_err(|source| {
        AppError::io("resolve template project", display(&project_dir), source)
    })?;
    project_state.grant_project_selection(canonical_project.clone())?;
    let main_file = canonical_project.join("main.tex");
    Ok(TemplateProjectResult {
        project_path: filesystem::path_to_string(&canonical_project)?,
        file_path: filesystem::path_to_string(&main_file)?,
    })
}

async fn write_project_files(
    project_dir: &Path,
    content: String,
    files: Option<HashMap<String, String>>,
) -> AppResult<()> {
    let files = files.unwrap_or_default();
    if files.len() > MAX_TEMPLATE_FILES {
        return Err(template_error(format!(
            "template contains more than {MAX_TEMPLATE_FILES} files"
        )));
    }
    let mut writes = vec![(project_dir.join("main.tex"), content.into_bytes())];
    let mut total_bytes = writes[0].1.len();
    let mut paths = HashSet::new();
    paths.insert(portable_path_identity("main.tex"));

    for (relative, stored_content) in files {
        let normalized = normalize_relative_path(Path::new(&relative))?;
        let identity = portable_path_identity(&normalized);
        if identity == portable_path_identity("main.tex") {
            continue;
        }
        if !paths.insert(identity) {
            return Err(template_error(format!(
                "template contains a duplicate portable path: {normalized}"
            )));
        }
        let bytes = if is_text_file(Path::new(&normalized)) {
            stored_content.into_bytes()
        } else {
            BASE64
                .decode(stored_content.as_bytes())
                .map_err(|_| template_error(format!("invalid base64 file: {normalized}")))?
        };
        if bytes.len() > MAX_TEMPLATE_FILE_BYTES {
            return Err(template_error(format!(
                "template file exceeds the 20 MiB limit: {normalized}"
            )));
        }
        total_bytes = total_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| template_error("template size overflow"))?;
        if total_bytes > MAX_TEMPLATE_TOTAL_BYTES {
            return Err(template_error(
                "template files exceed the 100 MiB total limit",
            ));
        }
        let target = project_dir.join(Path::new(&normalized));
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).await.map_err(|source| {
                AppError::io("create template directory", display(parent), source)
            })?;
        }
        writes.push((target, bytes));
    }
    filesystem::write_files_transactionally(writes).await
}

fn parse_template_zip(path: &Path) -> AppResult<Template> {
    let file = File::open(path)
        .map_err(|source| AppError::io("open template archive", display(path), source))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| template_error(format!("invalid ZIP archive: {error}")))?;
    if archive.len() > MAX_TEMPLATE_FILES + 64 {
        return Err(template_error("template archive contains too many entries"));
    }

    let zip_stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("template");
    let mut name = zip_stem.to_owned();
    let mut description = "Imported template".to_owned();
    let mut files = HashMap::new();
    let mut paths = HashSet::new();
    let mut main_content = None;
    let mut main_rank = 0_u8;
    let mut total_bytes = 0_usize;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| template_error(format!("could not read ZIP entry: {error}")))?;
        if entry.is_dir() {
            continue;
        }
        if entry.is_symlink() {
            return Err(template_error("template archive contains a symbolic link"));
        }
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| template_error("template archive contains an unsafe path"))?;
        let relative = normalize_relative_path(&enclosed)?;
        if !paths.insert(portable_path_identity(&relative)) {
            return Err(template_error(format!(
                "template archive contains a duplicate portable path: {relative}"
            )));
        }
        if entry.size() > MAX_TEMPLATE_FILE_BYTES as u64 {
            return Err(template_error(format!(
                "template file exceeds the 20 MiB limit: {relative}"
            )));
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .by_ref()
            .take(MAX_TEMPLATE_FILE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| template_error(format!("could not read {relative}: {error}")))?;
        if bytes.len() > MAX_TEMPLATE_FILE_BYTES {
            return Err(template_error(format!(
                "template file exceeds the 20 MiB limit: {relative}"
            )));
        }
        total_bytes = total_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| template_error("template size overflow"))?;
        if total_bytes > MAX_TEMPLATE_TOTAL_BYTES {
            return Err(template_error(
                "template files exceed the 100 MiB total limit",
            ));
        }

        let file_name = enclosed
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if file_name.eq_ignore_ascii_case("template.json") {
            if let Ok(metadata) = serde_json::from_slice::<TemplateMetadata>(&bytes) {
                if let Some(value) = metadata.name.filter(|value| !value.trim().is_empty()) {
                    name = value.trim().to_owned();
                }
                if let Some(value) = metadata
                    .description
                    .filter(|value| !value.trim().is_empty())
                {
                    description = value.trim().to_owned();
                }
            }
            continue;
        }

        let stored_content = if is_text_file(&enclosed) {
            String::from_utf8_lossy(&bytes).into_owned()
        } else {
            BASE64.encode(&bytes)
        };
        if enclosed
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("tex"))
        {
            let stem = enclosed
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let rank = if stem.eq_ignore_ascii_case("main") {
                3
            } else if stem.eq_ignore_ascii_case(zip_stem) {
                2
            } else {
                1
            };
            if rank > main_rank {
                main_rank = rank;
                main_content = Some(stored_content.clone());
            }
        }
        if files.insert(relative.clone(), stored_content).is_some() {
            return Err(template_error(format!(
                "template archive contains a duplicate path: {relative}"
            )));
        }
    }

    let content =
        main_content.ok_or_else(|| template_error("ZIP archive does not contain a .tex file"))?;
    Ok(Template {
        id: new_template_id(),
        name,
        description,
        content,
        built_in: false,
        files: Some(files),
    })
}

fn custom_templates_path(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(CUSTOM_TEMPLATES_FILE))
        .map_err(|error| AppError::RuntimePath(error.to_string()))
}

fn legacy_template_paths(path: &Path) -> Vec<PathBuf> {
    let Some(config_root) = path.parent().and_then(Path::parent) else {
        return Vec::new();
    };
    ["TextEx", "textex", "com.textex.app"]
        .into_iter()
        .map(|directory| config_root.join(directory).join(CUSTOM_TEMPLATES_FILE))
        .filter(|candidate| candidate != path)
        .collect()
}

async fn load_with_legacy_import(
    path: &Path,
    legacy_paths: &[PathBuf],
) -> AppResult<Vec<Template>> {
    if fs::try_exists(path)
        .await
        .map_err(|source| AppError::io("inspect custom templates", display(path), source))?
    {
        return load_custom_templates(path).await;
    }
    for legacy in legacy_paths {
        let Ok(templates) = load_custom_templates(legacy).await else {
            continue;
        };
        if templates.is_empty() {
            continue;
        }
        save_custom_templates(path, &templates).await?;
        return Ok(templates);
    }
    Ok(Vec::new())
}

async fn load_custom_templates(path: &Path) -> AppResult<Vec<Template>> {
    let metadata = match fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(AppError::io(
                "inspect custom templates",
                display(path),
                source,
            ));
        }
    };
    if !metadata.is_file() || metadata.len() > MAX_TEMPLATE_TOTAL_BYTES as u64 * 2 {
        return Ok(Vec::new());
    }
    let bytes = fs::read(path)
        .await
        .map_err(|source| AppError::io("read custom templates", display(path), source))?;
    let templates: Vec<Template> = match serde_json::from_slice(&bytes) {
        Ok(templates) => templates,
        Err(_) => return Ok(Vec::new()),
    };
    if templates.len() > MAX_TEMPLATES
        || templates
            .iter()
            .any(|item| validate_template(item).is_err())
    {
        return Ok(Vec::new());
    }
    Ok(templates)
}

async fn save_custom_templates(path: &Path, templates: &[Template]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|source| {
            AppError::io(
                "create template settings directory",
                display(parent),
                source,
            )
        })?;
    }
    let bytes = serde_json::to_vec_pretty(templates)
        .map_err(|error| template_error(format!("could not serialize templates: {error}")))?;
    if bytes.len() > MAX_TEMPLATE_TOTAL_BYTES * 2 {
        return Err(template_error("custom template storage exceeds 200 MiB"));
    }
    filesystem::write_files_transactionally(vec![(path.to_path_buf(), bytes)]).await
}

fn validate_template(template: &Template) -> AppResult<()> {
    validate_template_id(&template.id)?;
    if template.built_in {
        return Err(template_error("custom template cannot be marked built-in"));
    }
    validate_text_fields(&template.name, &template.description, &template.content)?;
    if let Some(files) = &template.files {
        if files.len() > MAX_TEMPLATE_FILES {
            return Err(template_error("template contains too many files"));
        }
        let mut total = 0_usize;
        for (path, content) in files {
            normalize_relative_path(Path::new(path))?;
            total = total
                .checked_add(content.len())
                .ok_or_else(|| template_error("template size overflow"))?;
            if content.len() > MAX_TEMPLATE_FILE_BYTES * 2 || total > MAX_TEMPLATE_TOTAL_BYTES * 2 {
                return Err(template_error(
                    "template file storage exceeds its size limit",
                ));
            }
        }
    }
    Ok(())
}

fn validate_template_id(id: &str) -> AppResult<()> {
    if !id.starts_with("custom-")
        || id.len() > 100
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(template_error(
            "cannot remove a built-in or invalid template",
        ));
    }
    Ok(())
}

fn validate_text_fields(name: &str, description: &str, content: &str) -> AppResult<()> {
    if name.trim().is_empty() || name.len() > MAX_NAME_BYTES {
        return Err(template_error("template name is empty or too long"));
    }
    if description.len() > MAX_DESCRIPTION_BYTES {
        return Err(template_error("template description is too long"));
    }
    if content.trim().is_empty() || content.len() > MAX_CONTENT_BYTES {
        return Err(template_error(
            "template content is empty or exceeds 10 MiB",
        ));
    }
    Ok(())
}

fn normalize_relative_path(path: &Path) -> AppResult<String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(template_error("template contains an invalid file path"));
    }
    let mut segments = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => {
                let segment = segment
                    .to_str()
                    .ok_or_else(|| template_error("template path is not UTF-8"))?;
                if segment.is_empty()
                    || segment.contains('/')
                    || segment.contains('\0')
                    || segment.contains('\\')
                {
                    return Err(template_error("template contains an invalid file path"));
                }
                segments.push(segment);
            }
            _ => return Err(template_error("template contains an unsafe file path")),
        }
    }
    if segments.is_empty() {
        return Err(template_error("template contains an empty file path"));
    }
    Ok(segments.join("/"))
}

fn is_text_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .is_some_and(|extension| {
            matches!(
                extension.as_str(),
                "tex"
                    | "sty"
                    | "cls"
                    | "bib"
                    | "bst"
                    | "txt"
                    | "md"
                    | "json"
                    | "xml"
                    | "yaml"
                    | "yml"
            )
        })
}

fn safe_default_project_name(name: &str) -> String {
    let mut normalized = String::new();
    let mut separator = false;
    for character in name.trim().chars().take(80) {
        if character.is_alphanumeric() || character == '_' {
            normalized.push(character);
            separator = false;
        } else if !separator && !normalized.is_empty() {
            normalized.push('-');
            separator = true;
        }
    }
    let normalized = normalized.trim_end_matches('-').to_lowercase();
    if normalized.is_empty() {
        return "latex-project".to_owned();
    }
    if is_windows_reserved_name(&normalized) {
        format!("latex-{normalized}")
    } else {
        normalized
    }
}

fn portable_path_identity(path: &str) -> String {
    path.to_lowercase()
}

fn is_windows_reserved_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    )
}

fn new_template_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = TEMPLATE_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("custom-{millis}-{sequence}")
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn template_error(message: impl Into<String>) -> AppError {
    AppError::Template(message.into())
}

#[cfg(test)]
mod tests {
    use super::{
        create_project_at, normalize_relative_path, parse_template_zip, safe_default_project_name,
        validate_template_id,
    };
    use crate::state::AppState;
    use std::{fs::File, io::Write, path::Path};
    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[test]
    fn validates_template_identifiers_and_relative_paths() {
        assert!(validate_template_id("custom-123-0").is_ok());
        assert!(validate_template_id("article").is_err());
        assert_eq!(
            normalize_relative_path(Path::new("figures/chart.png")).unwrap(),
            "figures/chart.png"
        );
        assert!(normalize_relative_path(Path::new("../secret.tex")).is_err());
    }

    #[test]
    fn creates_portable_default_project_names() {
        assert_eq!(
            safe_default_project_name("Research / Paper"),
            "research-paper"
        );
        assert_eq!(safe_default_project_name("///"), "latex-project");
        assert_eq!(safe_default_project_name("CON"), "latex-con");
    }

    #[test]
    fn imports_metadata_and_prefers_main_tex_from_zip() {
        let directory = tempdir().unwrap();
        let archive_path = directory.path().join("conference.zip");
        let mut archive = ZipWriter::new(File::create(&archive_path).unwrap());
        let options = SimpleFileOptions::default();
        archive.start_file("chapter.tex", options).unwrap();
        archive.write_all(b"chapter").unwrap();
        archive.start_file("main.tex", options).unwrap();
        archive.write_all(b"main document").unwrap();
        archive.start_file("template.json", options).unwrap();
        archive
            .write_all(br#"{"name":"Conference","description":"Imported metadata"}"#)
            .unwrap();
        archive.finish().unwrap();

        let template = parse_template_zip(&archive_path).unwrap();
        assert_eq!(template.name, "Conference");
        assert_eq!(template.description, "Imported metadata");
        assert_eq!(template.content, "main document");
        assert_eq!(template.files.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn creates_a_new_project_without_overwriting_rendered_main_content() {
        let parent = tempdir().unwrap();
        let project = parent.path().join("paper");
        let state = AppState::default();
        let files = [
            ("main.tex".to_owned(), "stale source".to_owned()),
            ("assets/image.png".to_owned(), "TWFu".to_owned()),
        ]
        .into_iter()
        .collect();

        let result = create_project_at(
            &state,
            project.clone(),
            "rendered source".to_owned(),
            Some(files),
        )
        .await
        .unwrap();

        assert_eq!(
            tokio::fs::read_to_string(project.join("main.tex"))
                .await
                .unwrap(),
            "rendered source"
        );
        assert_eq!(
            tokio::fs::read(project.join("assets/image.png"))
                .await
                .unwrap(),
            b"Man"
        );
        let created = std::path::PathBuf::from(result.project_path);
        assert!(state.project_root().is_err());
        assert!(state.consume_project_selection(&created).unwrap());
    }
}
