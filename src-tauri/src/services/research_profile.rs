use std::{collections::HashSet, path::PathBuf};

use reqwest::Url;
use tokio::{fs, io::AsyncReadExt};

use crate::{
    error::{AppError, AppResult},
    models::{ResearchPerson, ResearchProfile, ResearchResource},
    services::filesystem,
    state::AppState,
};

const PROFILE_FILE: &str = "research-profile.json";
const MAX_PROFILE_BYTES: u64 = 256 * 1024;
const MAX_SHORT_TEXT_BYTES: usize = 16 * 1024;
const MAX_ABSTRACT_BYTES: usize = 256 * 1024;
const MAX_INSTRUCTION_BYTES: usize = 64 * 1024;
const MAX_AUTHORS: usize = 256;
const MAX_RESOURCES: usize = 512;
const MAX_INSTRUCTIONS: usize = 256;

pub async fn load(state: &AppState) -> AppResult<ResearchProfile> {
    let _project_operation = state.lock_project_operation().await;
    load_unlocked(state).await
}

/// Loads the active project's profile while the caller holds a project
/// operation lease. This keeps composite operations from trying to acquire the
/// non-reentrant transition lock twice.
pub(crate) async fn load_unlocked(state: &AppState) -> AppResult<ResearchProfile> {
    let Some(path) = existing_profile_path(state).await? else {
        return Ok(ResearchProfile::default());
    };
    let metadata = fs::metadata(&path)
        .await
        .map_err(|source| AppError::io("inspect research profile", display(&path), source))?;
    if metadata.len() > MAX_PROFILE_BYTES {
        return Err(profile_error("research profile exceeds 256 KiB"));
    }

    let file = fs::File::open(&path)
        .await
        .map_err(|source| AppError::io("open research profile", display(&path), source))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_PROFILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|source| AppError::io("read research profile", display(&path), source))?;
    if bytes.len() as u64 > MAX_PROFILE_BYTES {
        return Err(profile_error("research profile exceeds 256 KiB"));
    }
    let profile: ResearchProfile = serde_json::from_slice(&bytes)
        .map_err(|error| profile_error(format!("invalid research profile: {error}")))?;
    validate(&profile)?;
    Ok(profile)
}

pub async fn save(state: &AppState, mut profile: ResearchProfile) -> AppResult<ResearchProfile> {
    profile.version = 1;
    normalize_optional_fields(&mut profile);
    validate(&profile)?;

    let _project_operation = state.lock_project_operation().await;
    let root = state.project_root()?;
    let directory =
        filesystem::validate_project_directory_target(state, root.join(".textex")).await?;
    fs::create_dir_all(&directory).await.map_err(|source| {
        AppError::io(
            "create research profile directory",
            display(&directory),
            source,
        )
    })?;
    let path_text = directory.join(PROFILE_FILE).to_string_lossy().into_owned();
    let path = filesystem::validate_save_file_target(state, &path_text).await?;
    let bytes =
        serde_json::to_vec_pretty(&profile).map_err(|error| profile_error(error.to_string()))?;
    if bytes.len() as u64 > MAX_PROFILE_BYTES {
        return Err(profile_error("research profile exceeds 256 KiB"));
    }
    filesystem::write_files_transactionally(vec![(path, bytes)]).await?;
    Ok(profile)
}

async fn existing_profile_path(state: &AppState) -> AppResult<Option<PathBuf>> {
    let requested = state.project_root()?.join(".textex").join(PROFILE_FILE);
    match fs::symlink_metadata(&requested).await {
        Ok(_) => {
            let path_text = requested.to_string_lossy().into_owned();
            filesystem::validate_existing_project_file(state, &path_text)
                .await
                .map(Some)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(AppError::io(
            "inspect research profile",
            display(&requested),
            source,
        )),
    }
}

fn validate(profile: &ResearchProfile) -> AppResult<()> {
    if profile.version != 1 {
        return Err(profile_error("unsupported research profile version"));
    }
    validate_text(
        "paper title",
        &profile.paper.title,
        MAX_SHORT_TEXT_BYTES,
        true,
    )?;
    validate_optional_multiline_text(
        "paper abstract",
        profile.paper.r#abstract.as_deref(),
        MAX_ABSTRACT_BYTES,
    )?;
    validate_optional_text(
        "paper DOI",
        profile.paper.doi.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )?;
    validate_optional_text(
        "paper arXiv identifier",
        profile.paper.arxiv.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )?;
    validate_optional_text(
        "paper venue",
        profile.paper.venue.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )?;
    validate_optional_web_url("paper website", profile.paper.website.as_deref())?;

    if profile.paper.authors.len() > MAX_AUTHORS {
        return Err(profile_error("research profile has too many authors"));
    }
    let mut author_ids = HashSet::with_capacity(profile.paper.authors.len());
    for author in &profile.paper.authors {
        validate_person(author)?;
        if !author_ids.insert(author.id.to_ascii_lowercase()) {
            return Err(profile_error("research profile author IDs must be unique"));
        }
    }

    if profile.resources.len() > MAX_RESOURCES {
        return Err(profile_error("research profile has too many resources"));
    }
    let mut resource_ids = HashSet::with_capacity(profile.resources.len());
    for resource in &profile.resources {
        validate_resource(resource)?;
        if !resource_ids.insert(resource.id.to_ascii_lowercase()) {
            return Err(profile_error(
                "research profile resource IDs must be unique",
            ));
        }
    }

    if profile.instructions.len() > MAX_INSTRUCTIONS {
        return Err(profile_error("research profile has too many instructions"));
    }
    for instruction in &profile.instructions {
        validate_text(
            "research instruction",
            instruction,
            MAX_INSTRUCTION_BYTES,
            false,
        )?;
    }
    Ok(())
}

fn validate_person(person: &ResearchPerson) -> AppResult<()> {
    validate_id("author ID", &person.id)?;
    validate_text("author name", &person.name, MAX_SHORT_TEXT_BYTES, false)?;
    validate_optional_text("author role", person.role.as_deref(), MAX_SHORT_TEXT_BYTES)?;
    validate_optional_text(
        "author email",
        person.email.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )?;
    validate_optional_web_url("author homepage", person.homepage.as_deref())?;
    validate_optional_web_url("author GitHub URL", person.github.as_deref())?;
    validate_optional_text(
        "author ORCID",
        person.orcid.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )
}

fn validate_resource(resource: &ResearchResource) -> AppResult<()> {
    validate_id("resource ID", &resource.id)?;
    validate_text(
        "resource label",
        &resource.label,
        MAX_SHORT_TEXT_BYTES,
        false,
    )?;
    validate_optional_web_url("resource URL", resource.url.as_deref())?;
    validate_optional_ssh_url(resource.ssh_url.as_deref())?;
    validate_optional_text(
        "resource local path",
        resource.local_path.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )?;
    validate_optional_text(
        "resource branch",
        resource.branch.as_deref(),
        MAX_SHORT_TEXT_BYTES,
    )
}

fn validate_id(label: &str, value: &str) -> AppResult<()> {
    validate_text(label, value, 128, false)?;
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(profile_error(format!("invalid {label}")));
    }
    Ok(())
}

fn validate_optional_text(label: &str, value: Option<&str>, max_bytes: usize) -> AppResult<()> {
    if let Some(value) = value {
        validate_text(label, value, max_bytes, false)?;
    }
    Ok(())
}

fn validate_optional_multiline_text(
    label: &str,
    value: Option<&str>,
    max_bytes: usize,
) -> AppResult<()> {
    if let Some(value) = value {
        if value.is_empty()
            || value.len() > max_bytes
            || value.trim() != value
            || value
                .chars()
                .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
        {
            return Err(profile_error(format!("invalid {label}")));
        }
    }
    Ok(())
}

fn normalize_optional_fields(profile: &mut ResearchProfile) {
    normalize_optional(&mut profile.paper.r#abstract);
    normalize_optional(&mut profile.paper.doi);
    normalize_optional(&mut profile.paper.arxiv);
    normalize_optional(&mut profile.paper.venue);
    normalize_optional(&mut profile.paper.website);
    for author in &mut profile.paper.authors {
        normalize_optional(&mut author.role);
        normalize_optional(&mut author.email);
        normalize_optional(&mut author.homepage);
        normalize_optional(&mut author.github);
        normalize_optional(&mut author.orcid);
    }
    for resource in &mut profile.resources {
        normalize_optional(&mut resource.url);
        normalize_optional(&mut resource.ssh_url);
        normalize_optional(&mut resource.local_path);
        normalize_optional(&mut resource.branch);
    }
    for instruction in &mut profile.instructions {
        *instruction = instruction.trim().to_owned();
    }
    profile
        .instructions
        .retain(|instruction| !instruction.is_empty());
}

fn normalize_optional(value: &mut Option<String>) {
    if let Some(current) = value {
        let trimmed = current.trim().to_owned();
        if trimmed.is_empty() {
            *value = None;
        } else if trimmed.len() != current.len() {
            *current = trimmed;
        }
    }
}

fn validate_text(label: &str, value: &str, max_bytes: usize, allow_empty: bool) -> AppResult<()> {
    if value.len() > max_bytes
        || value.trim() != value
        || (!allow_empty && value.is_empty())
        || value.chars().any(char::is_control)
    {
        return Err(profile_error(format!("invalid {label}")));
    }
    Ok(())
}

fn validate_optional_web_url(label: &str, value: Option<&str>) -> AppResult<()> {
    let Some(value) = value else {
        return Ok(());
    };
    validate_text(label, value, MAX_SHORT_TEXT_BYTES, false)?;
    let url = Url::parse(value).map_err(|_| profile_error(format!("invalid {label}")))?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err(profile_error(format!("invalid {label}")));
    }
    Ok(())
}

fn validate_optional_ssh_url(value: Option<&str>) -> AppResult<()> {
    let Some(value) = value else {
        return Ok(());
    };
    validate_text("resource SSH URL", value, MAX_SHORT_TEXT_BYTES, false)?;
    if value.chars().any(char::is_whitespace) {
        return Err(profile_error("invalid resource SSH URL"));
    }
    if value.contains("://") {
        let url = Url::parse(value).map_err(|_| profile_error("invalid resource SSH URL"))?;
        if url.scheme() != "ssh" || url.password().is_some() || url.host_str().is_none() {
            return Err(profile_error("invalid resource SSH URL"));
        }
    } else {
        let Some((user_host, path)) = value.split_once(':') else {
            return Err(profile_error("invalid resource SSH URL"));
        };
        let Some((user, host)) = user_host.split_once('@') else {
            return Err(profile_error("invalid resource SSH URL"));
        };
        if user.is_empty() || host.is_empty() || path.is_empty() || path.starts_with('/') {
            return Err(profile_error("invalid resource SSH URL"));
        }
    }
    Ok(())
}

fn profile_error(message: impl Into<String>) -> AppError {
    AppError::ProjectData(message.into())
}

fn display(path: &std::path::Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ResearchChatAccess, ResearchPaperMetadata, ResearchResourceKind};

    fn profile() -> ResearchProfile {
        ResearchProfile {
            version: 1,
            paper: ResearchPaperMetadata {
                title: "Diffusion Policy".to_owned(),
                r#abstract: Some("A visuomotor policy.".to_owned()),
                doi: Some("10.0000/example".to_owned()),
                arxiv: Some("2303.04137".to_owned()),
                venue: Some("RSS".to_owned()),
                website: Some("https://example.test/paper".to_owned()),
                authors: vec![ResearchPerson {
                    id: "cheng-chi".to_owned(),
                    name: "Cheng Chi".to_owned(),
                    role: Some("Lead author".to_owned()),
                    email: None,
                    homepage: Some("https://example.test/author".to_owned()),
                    github: Some("https://github.com/example".to_owned()),
                    orcid: None,
                }],
            },
            resources: vec![ResearchResource {
                id: "official-code".to_owned(),
                kind: ResearchResourceKind::Git,
                label: "Official code".to_owned(),
                url: Some("https://github.com/example/project".to_owned()),
                ssh_url: Some("git@github.com:example/project.git".to_owned()),
                local_path: Some("../sources/project".to_owned()),
                branch: Some("main".to_owned()),
                chat_access: ResearchChatAccess::IndexedRead,
            }],
            instructions: vec!["Prefer the official implementation.".to_owned()],
        }
    }

    #[tokio::test]
    async fn returns_an_empty_profile_when_none_has_been_saved() {
        let project = tempfile::tempdir().unwrap();
        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();

        assert_eq!(load(&state).await.unwrap(), ResearchProfile::default());
    }

    #[tokio::test]
    async fn atomically_saves_and_loads_the_active_project_profile() {
        let project = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();
        let expected = profile();

        assert_eq!(save(&state, expected.clone()).await.unwrap(), expected);
        assert_eq!(load(&state).await.unwrap(), expected);
        assert!(root.join(".textex/research-profile.json").is_file());
    }

    #[test]
    fn rejects_duplicate_ids_and_credentials_in_web_urls() {
        let mut duplicate_authors = profile();
        duplicate_authors
            .paper
            .authors
            .push(duplicate_authors.paper.authors[0].clone());
        assert!(validate(&duplicate_authors).is_err());

        let mut credential_url = profile();
        credential_url.resources[0].url = Some("https://token@example.test/private.git".to_owned());
        assert!(validate(&credential_url).is_err());
    }

    #[tokio::test]
    async fn normalizes_empty_optional_fields_and_accepts_multiline_abstracts() {
        let project = tempfile::tempdir().unwrap();
        let state = AppState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();
        let mut profile = profile();
        profile.paper.r#abstract = Some("First paragraph.\n\nSecond paragraph.".to_owned());
        profile.paper.website = Some(String::new());
        profile.paper.authors[0].role = Some(String::new());
        profile.resources[0].branch = Some(String::new());
        profile.instructions = vec![
            String::new(),
            "  Prefer the official implementation.  ".to_owned(),
            "   ".to_owned(),
        ];

        let saved = save(&state, profile).await.unwrap();
        assert_eq!(
            saved.paper.r#abstract.as_deref(),
            Some("First paragraph.\n\nSecond paragraph.")
        );
        assert_eq!(saved.paper.website, None);
        assert_eq!(saved.paper.authors[0].role, None);
        assert_eq!(saved.resources[0].branch, None);
        assert_eq!(
            saved.instructions,
            vec!["Prefer the official implementation."]
        );
        assert_eq!(load(&state).await.unwrap(), saved);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_profile_symlink_escape() {
        use std::os::unix::fs::symlink;

        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        std::fs::create_dir(root.join(".textex")).unwrap();
        symlink(
            outside.path().join(PROFILE_FILE),
            root.join(".textex").join(PROFILE_FILE),
        )
        .unwrap();
        let state = AppState::default();
        state.set_project_root(root).unwrap();

        assert!(load(&state).await.is_err());
    }
}
