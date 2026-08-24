use std::{collections::HashSet, path::PathBuf};

use serde::{Deserialize, Serialize};
use tokio::{fs, io::AsyncReadExt};

use crate::{
    error::{AppError, AppResult},
    models::{
        ResearchChatSession, ResearchChatSessionContext, ResearchChatSessionContextKind,
        ResearchChatSessionScope, ResearchChatSessionSnapshot, ResearchReferenceSource,
    },
    services::{filesystem, research, research_limits},
    state::AppState,
};

const SESSION_FILE: &str = "research-chat.json";
const MAX_SESSION_BYTES: u64 = 1024 * 1024;
const MAX_CONTEXT_ID_BYTES: usize = 128;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredResearchChatSession {
    #[serde(default)]
    revision: u64,
    #[serde(flatten)]
    session: ResearchChatSession,
}

pub async fn load(state: &AppState) -> AppResult<ResearchChatSessionSnapshot> {
    let _project_operation = state.lock_project_operation().await;
    let (root, epoch, _) = state.project_root_epoch()?;
    let stored = load_unlocked(state).await?;
    session_snapshot(root, epoch, stored)
}

async fn load_unlocked(state: &AppState) -> AppResult<StoredResearchChatSession> {
    let Some(path) = existing_session_path(state).await? else {
        return Ok(StoredResearchChatSession {
            revision: 0,
            session: ResearchChatSession::default(),
        });
    };
    let metadata = fs::metadata(&path)
        .await
        .map_err(|source| AppError::io("inspect research Chat session", display(&path), source))?;
    if metadata.len() > MAX_SESSION_BYTES {
        return Err(session_error("Research Chat session exceeds 1 MiB"));
    }

    let file = fs::File::open(&path)
        .await
        .map_err(|source| AppError::io("open research Chat session", display(&path), source))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_SESSION_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|source| AppError::io("read research Chat session", display(&path), source))?;
    if bytes.len() as u64 > MAX_SESSION_BYTES {
        return Err(session_error("Research Chat session exceeds 1 MiB"));
    }
    let stored: StoredResearchChatSession = serde_json::from_slice(&bytes)
        .map_err(|error| session_error(format!("invalid Research Chat session: {error}")))?;
    validate(&stored.session)?;
    Ok(stored)
}

pub async fn save(
    state: &AppState,
    scope: &ResearchChatSessionScope,
    mut session: ResearchChatSession,
) -> AppResult<ResearchChatSessionSnapshot> {
    session.version = 1;
    let _project_operation = state.lock_project_operation().await;
    let (root, epoch) = validate_scope_activation(state, scope)?;
    validate(&session)?;
    let current = load_unlocked(state).await?;
    let next_revision = validate_scope_revision(scope, current.revision)?;
    save_validated_unlocked(state, next_revision, &session).await?;
    session_snapshot(
        root,
        epoch,
        StoredResearchChatSession {
            revision: next_revision,
            session,
        },
    )
}

pub async fn clear(
    state: &AppState,
    scope: &ResearchChatSessionScope,
) -> AppResult<ResearchChatSessionSnapshot> {
    // Persisting the empty value through the same transactional writer keeps
    // clear crash-safe and avoids a delete/create race with project watchers.
    let _project_operation = state.lock_project_operation().await;
    let (root, epoch) = validate_scope_activation(state, scope)?;
    let current = load_unlocked(state).await?;
    let next_revision = validate_scope_revision(scope, current.revision)?;
    let session = ResearchChatSession::default();
    save_validated_unlocked(state, next_revision, &session).await?;
    session_snapshot(
        root,
        epoch,
        StoredResearchChatSession {
            revision: next_revision,
            session,
        },
    )
}

async fn save_validated_unlocked(
    state: &AppState,
    revision: u64,
    session: &ResearchChatSession,
) -> AppResult<()> {
    let root = state.project_root()?;
    let directory =
        filesystem::validate_project_directory_target(state, root.join(".textex")).await?;
    fs::create_dir_all(&directory).await.map_err(|source| {
        AppError::io(
            "create Research Chat session directory",
            display(&directory),
            source,
        )
    })?;
    let path_text = directory.join(SESSION_FILE).to_string_lossy().into_owned();
    let path = filesystem::validate_save_file_target(state, &path_text).await?;
    let bytes = serde_json::to_vec_pretty(&StoredResearchChatSession {
        revision,
        session: session.clone(),
    })
    .map_err(|error| session_error(format!("serialize Research Chat session: {error}")))?;
    if bytes.len() as u64 > MAX_SESSION_BYTES {
        return Err(session_error("Research Chat session exceeds 1 MiB"));
    }
    filesystem::write_files_transactionally(vec![(path, bytes)]).await
}

fn validate_scope_activation(
    state: &AppState,
    scope: &ResearchChatSessionScope,
) -> AppResult<(PathBuf, u64)> {
    let expected_epoch = parse_scope_token("project epoch", &scope.project_epoch)?;
    let (active_root, active_epoch, _) = state.project_root_epoch()?;
    if active_epoch != expected_epoch
        || !filesystem::paths_equal(&active_root, std::path::Path::new(&scope.project_root))
    {
        return Err(session_error(
            "the active project changed before the Research Chat session operation",
        ));
    }
    Ok((active_root, active_epoch))
}

fn validate_scope_revision(scope: &ResearchChatSessionScope, current: u64) -> AppResult<u64> {
    let expected = parse_scope_token("session revision", &scope.revision)?;
    if current != expected {
        return Err(session_error(
            "the Research Chat session changed before this operation",
        ));
    }
    current
        .checked_add(1)
        .ok_or_else(|| session_error("Research Chat session revision is exhausted"))
}

fn parse_scope_token(label: &str, value: &str) -> AppResult<u64> {
    if value.is_empty()
        || value.len() > 20
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(session_error(format!("invalid Research Chat {label}")));
    }
    value
        .parse::<u64>()
        .map_err(|_| session_error(format!("invalid Research Chat {label}")))
}

fn session_snapshot(
    root: PathBuf,
    epoch: u64,
    stored: StoredResearchChatSession,
) -> AppResult<ResearchChatSessionSnapshot> {
    Ok(ResearchChatSessionSnapshot {
        project_root: filesystem::path_to_string(&root)?,
        project_epoch: epoch.to_string(),
        revision: stored.revision.to_string(),
        session: stored.session,
    })
}

async fn existing_session_path(state: &AppState) -> AppResult<Option<PathBuf>> {
    let requested = state.project_root()?.join(".textex").join(SESSION_FILE);
    match fs::symlink_metadata(&requested).await {
        Ok(_) => {
            let path_text = requested.to_string_lossy().into_owned();
            filesystem::validate_existing_project_file(state, &path_text)
                .await
                .map(Some)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(AppError::io(
            "inspect Research Chat session",
            display(&requested),
            source,
        )),
    }
}

fn validate(session: &ResearchChatSession) -> AppResult<()> {
    if session.version != 1 {
        return Err(session_error("unsupported Research Chat session version"));
    }
    if session.messages.len() > research_limits::MAX_CHAT_HISTORY_MESSAGES {
        return Err(session_error("Research Chat session has too many messages"));
    }
    let mut history_bytes = 0usize;
    for message in &session.messages {
        validate_multiline_text(
            "Research Chat message",
            &message.content,
            research_limits::MAX_CHAT_MESSAGE_BYTES,
        )?;
        history_bytes = history_bytes.saturating_add(message.content.len());
        validate_contexts("message sources", &message.sources)?;
    }
    if history_bytes > research_limits::MAX_CHAT_HISTORY_TOTAL_BYTES {
        return Err(session_error(
            "Research Chat session history exceeds 512 KiB",
        ));
    }
    validate_contexts("selected contexts", &session.selected_contexts)
}

fn validate_contexts(label: &str, contexts: &[ResearchChatSessionContext]) -> AppResult<()> {
    if contexts.len() > research_limits::MAX_CHAT_CONTEXTS {
        return Err(session_error(format!(
            "Research Chat {label} has too many entries"
        )));
    }
    if contexts
        .iter()
        .filter(|context| context.kind == ResearchChatSessionContextKind::Reference)
        .count()
        > research_limits::MAX_CHAT_REFERENCE_CONTEXTS
    {
        return Err(session_error(format!(
            "Research Chat {label} has too many references"
        )));
    }
    let mut ids = HashSet::new();
    for context in contexts {
        validate_single_line_text("context ID", &context.id, MAX_CONTEXT_ID_BYTES)?;
        if !ids.insert(context.id.as_str()) {
            return Err(session_error(format!(
                "Research Chat {label} contains duplicate context IDs"
            )));
        }
        validate_single_line_text(
            "context label",
            &context.label,
            research_limits::MAX_CHAT_CONTEXT_LABEL_BYTES,
        )?;
        validate_optional_single_line_text(
            "context source",
            context.source.as_deref(),
            research_limits::MAX_CHAT_CONTEXT_SOURCE_BYTES,
        )?;
        validate_optional_single_line_text(
            "context resource ID",
            context.resource_id.as_deref(),
            MAX_CONTEXT_ID_BYTES,
        )?;
        validate_optional_single_line_text(
            "context citekey",
            context.citekey.as_deref(),
            research_limits::MAX_CITATION_KEY_BYTES,
        )?;
        validate_context_shape(context)?;
    }
    Ok(())
}

fn validate_context_shape(context: &ResearchChatSessionContext) -> AppResult<()> {
    let is_resource = matches!(
        context.kind,
        ResearchChatSessionContextKind::Repository | ResearchChatSessionContextKind::Website
    );
    if is_resource != context.resource_id.is_some() {
        return Err(session_error(
            "only repository and website contexts may carry a resource ID",
        ));
    }

    if context.kind != ResearchChatSessionContextKind::Reference {
        if context.citekey.is_some()
            || context.reference_source.is_some()
            || context.online_reference.is_some()
        {
            return Err(session_error(
                "only reference contexts may carry citation metadata",
            ));
        }
        return Ok(());
    }

    match context.reference_source {
        Some(ResearchReferenceSource::Project | ResearchReferenceSource::Zotero) => {
            if !context
                .citekey
                .as_deref()
                .is_some_and(research_limits::is_safe_citation_key)
                || context.online_reference.is_some()
            {
                return Err(session_error(
                    "project and Zotero reference contexts require only a citekey",
                ));
            }
        }
        Some(ResearchReferenceSource::Online) => {
            let reference = context.online_reference.as_ref().ok_or_else(|| {
                session_error("online reference contexts require reference metadata")
            })?;
            research::validate_online_reference_for_import(reference)?;
        }
        None => {
            return Err(session_error(
                "reference contexts require an authoritative reference source",
            ));
        }
    }
    Ok(())
}

fn validate_multiline_text(label: &str, value: &str, max_bytes: usize) -> AppResult<()> {
    if value.trim().is_empty() || value.len() > max_bytes || value.contains('\0') {
        return Err(session_error(format!("{label} is invalid")));
    }
    Ok(())
}

fn validate_single_line_text(label: &str, value: &str, max_bytes: usize) -> AppResult<()> {
    if value.trim() != value
        || value.is_empty()
        || value.len() > max_bytes
        || value.chars().any(char::is_control)
    {
        return Err(session_error(format!("{label} is invalid")));
    }
    Ok(())
}

fn validate_optional_single_line_text(
    label: &str,
    value: Option<&str>,
    max_bytes: usize,
) -> AppResult<()> {
    if let Some(value) = value {
        validate_single_line_text(label, value, max_bytes)?;
    }
    Ok(())
}

fn session_error(message: impl Into<String>) -> AppError {
    AppError::Ai(message.into())
}

fn display(path: &std::path::Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ResearchChatMessage, ResearchChatRole};

    fn session() -> ResearchChatSession {
        ResearchChatSession {
            version: 1,
            messages: vec![ResearchChatMessage {
                role: ResearchChatRole::User,
                content: "Compare these papers.".to_owned(),
                sources: Vec::new(),
            }],
            selected_contexts: vec![ResearchChatSessionContext {
                id: "paper".to_owned(),
                kind: ResearchChatSessionContextKind::Paper,
                label: "Paper".to_owned(),
                source: None,
                resource_id: None,
                citekey: None,
                reference_source: None,
                online_reference: None,
            }],
        }
    }

    fn scope(snapshot: &ResearchChatSessionSnapshot) -> ResearchChatSessionScope {
        ResearchChatSessionScope {
            project_root: snapshot.project_root.clone(),
            project_epoch: snapshot.project_epoch.clone(),
            revision: snapshot.revision.clone(),
        }
    }

    #[tokio::test]
    async fn atomically_saves_loads_and_clears_the_active_project_session() {
        let project = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(root.clone()).unwrap();
        let expected = session();

        let initial = load(&state).await.unwrap();
        assert_eq!(initial.revision, "0");
        assert_eq!(initial.session, ResearchChatSession::default());
        let saved = save(&state, &scope(&initial), expected.clone())
            .await
            .unwrap();
        assert_eq!(saved.revision, "1");
        assert_eq!(saved.session, expected);
        assert_eq!(load(&state).await.unwrap(), saved);
        assert!(root.join(".textex/research-chat.json").is_file());

        let cleared = clear(&state, &scope(&saved)).await.unwrap();
        assert_eq!(cleared.revision, "2");
        assert_eq!(cleared.session, ResearchChatSession::default());
        assert_eq!(load(&state).await.unwrap(), cleared);
    }

    #[tokio::test]
    async fn rejects_stale_revisions_and_reactivated_project_epochs() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let first_root = dunce::canonicalize(first.path()).unwrap();
        let second_root = dunce::canonicalize(second.path()).unwrap();
        let state = AppState::default();
        state.set_project_root(first_root.clone()).unwrap();

        let initial = load(&state).await.unwrap();
        let saved = save(&state, &scope(&initial), session()).await.unwrap();
        assert!(save(&state, &scope(&initial), session()).await.is_err());
        assert!(clear(&state, &scope(&initial)).await.is_err());

        state.set_project_root(second_root).unwrap();
        assert!(save(&state, &scope(&saved), session()).await.is_err());
        state.set_project_root(first_root).unwrap();
        assert!(save(&state, &scope(&saved), session()).await.is_err());

        let reactivated = load(&state).await.unwrap();
        assert_ne!(reactivated.project_epoch, saved.project_epoch);
        assert_eq!(reactivated.revision, saved.revision);
        assert!(save(&state, &scope(&reactivated), session()).await.is_ok());
    }

    #[test]
    fn rejects_oversized_history_duplicate_contexts_and_untrusted_reference_shapes() {
        let mut too_many = session();
        too_many.messages =
            vec![too_many.messages[0].clone(); research_limits::MAX_CHAT_HISTORY_MESSAGES + 1];
        assert!(validate(&too_many).is_err());

        let mut duplicate = session();
        duplicate
            .selected_contexts
            .push(duplicate.selected_contexts[0].clone());
        assert!(validate(&duplicate).is_err());

        let mut untrusted = session();
        untrusted.selected_contexts[0].kind = ResearchChatSessionContextKind::Reference;
        assert!(validate(&untrusted).is_err());

        let mut unsafe_citekey = session();
        unsafe_citekey.selected_contexts[0].kind = ResearchChatSessionContextKind::Reference;
        unsafe_citekey.selected_contexts[0].reference_source =
            Some(ResearchReferenceSource::Project);
        unsafe_citekey.selected_contexts[0].citekey = Some("bad}\\input{secrets".to_owned());
        assert!(validate(&unsafe_citekey).is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_session_symlink_escape() {
        use std::os::unix::fs::symlink;

        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(project.path()).unwrap();
        std::fs::create_dir(root.join(".textex")).unwrap();
        symlink(
            outside.path().join(SESSION_FILE),
            root.join(".textex").join(SESSION_FILE),
        )
        .unwrap();
        let state = AppState::default();
        state.set_project_root(root).unwrap();

        assert!(load(&state).await.is_err());
    }
}
