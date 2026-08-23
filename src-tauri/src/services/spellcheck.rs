use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};

use spellbook::Dictionary;
use tauri::{AppHandle, Manager};
use tokio::{fs, sync::Mutex as AsyncMutex};

use crate::{
    error::{AppError, AppResult},
    models::{SpellInitResult, SuccessResult},
};

const MAX_LANGUAGE_BYTES: usize = 32;
const MAX_WORD_BYTES: usize = 256;
const MAX_WORDS_PER_CHECK: usize = 4_096;
const MAX_DICTIONARY_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SUGGESTIONS: usize = 5;

type SharedDictionary = Arc<Mutex<Option<Dictionary>>>;

#[derive(Default)]
pub struct SpellcheckState {
    dictionary: SharedDictionary,
    operation_lock: AsyncMutex<()>,
}

pub async fn initialize(
    app: &AppHandle,
    state: &SpellcheckState,
    language: &str,
) -> SpellInitResult {
    let _guard = state.operation_lock.lock().await;
    match initialize_inner(app, state, language).await {
        Ok(()) => SpellInitResult::ok(),
        Err(error) => {
            if let Ok(mut dictionary) = state.dictionary.lock() {
                *dictionary = None;
            }
            SpellInitResult::failed(error.to_string())
        }
    }
}

pub async fn check_words(state: &SpellcheckState, words: Vec<String>) -> AppResult<Vec<String>> {
    if words.len() > MAX_WORDS_PER_CHECK {
        return Err(spellcheck_error(format!(
            "at most {MAX_WORDS_PER_CHECK} words may be checked at once"
        )));
    }
    for word in &words {
        validate_word(word)?;
    }

    let mut seen = HashSet::with_capacity(words.len());
    let words = words
        .into_iter()
        .filter(|word| seen.insert(word.clone()))
        .collect::<Vec<_>>();
    let dictionary = Arc::clone(&state.dictionary);
    run_blocking(move || {
        let dictionary = lock_dictionary(&dictionary)?;
        let Some(dictionary) = dictionary.as_ref() else {
            return Ok(Vec::new());
        };
        Ok(words
            .into_iter()
            .filter(|word| !dictionary.check(word))
            .collect())
    })
    .await
}

pub async fn suggestions(state: &SpellcheckState, word: String) -> AppResult<Vec<String>> {
    validate_word(&word)?;
    let dictionary = Arc::clone(&state.dictionary);
    run_blocking(move || {
        let dictionary = lock_dictionary(&dictionary)?;
        let Some(dictionary) = dictionary.as_ref() else {
            return Ok(Vec::new());
        };
        let mut suggestions = Vec::new();
        dictionary.suggest(&word, &mut suggestions);
        suggestions.truncate(MAX_SUGGESTIONS);
        Ok(suggestions)
    })
    .await
}

pub async fn add_word(state: &SpellcheckState, word: String) -> AppResult<SuccessResult> {
    validate_word(&word)?;
    let _guard = state.operation_lock.lock().await;
    let dictionary = Arc::clone(&state.dictionary);
    run_blocking(move || {
        let mut dictionary = lock_dictionary(&dictionary)?;
        if let Some(dictionary) = dictionary.as_mut() {
            dictionary.add(&word).map_err(|error| {
                spellcheck_error(format!("could not add word to dictionary: {error}"))
            })?;
        }
        Ok(SuccessResult::ok())
    })
    .await
}

async fn initialize_inner(
    app: &AppHandle,
    state: &SpellcheckState,
    language: &str,
) -> AppResult<()> {
    validate_language(language)?;
    let directory = resolve_dictionary_directory(app)?;
    let (aff, dic) = read_dictionary_files(&directory, language).await?;
    let dictionary = run_blocking(move || {
        Dictionary::new(&aff, &dic)
            .map_err(|error| spellcheck_error(format!("could not parse dictionary: {error}")))
    })
    .await?;
    *lock_dictionary(&state.dictionary)? = Some(dictionary);
    Ok(())
}

fn resolve_dictionary_directory(app: &AppHandle) -> AppResult<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_directory) = app.path().resource_dir() {
        candidates.push(resource_directory.join("dictionaries"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("resources")
            .join("dictionaries"),
    );

    candidates
        .iter()
        .find(|candidate| candidate.is_dir())
        .cloned()
        .ok_or_else(|| {
            spellcheck_error(format!(
                "dictionary directory was not found; checked {}",
                candidates
                    .iter()
                    .map(|path| path.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        })
}

async fn read_dictionary_files(directory: &Path, language: &str) -> AppResult<(String, String)> {
    let aff_path = directory.join(format!("{language}.aff"));
    let dic_path = directory.join(format!("{language}.dic"));
    let (aff, dic) = tokio::try_join!(
        read_dictionary_file(&aff_path),
        read_dictionary_file(&dic_path)
    )?;
    Ok((aff, dic))
}

async fn read_dictionary_file(path: &Path) -> AppResult<String> {
    let metadata = fs::metadata(path).await.map_err(|error| {
        spellcheck_error(format!("could not inspect {}: {error}", path.display()))
    })?;
    if !metadata.is_file() {
        return Err(spellcheck_error(format!(
            "expected a dictionary file: {}",
            path.display()
        )));
    }
    if metadata.len() > MAX_DICTIONARY_FILE_BYTES {
        return Err(spellcheck_error(format!(
            "{} exceeds the 8 MiB dictionary limit",
            path.display()
        )));
    }
    fs::read_to_string(path)
        .await
        .map_err(|error| spellcheck_error(format!("could not read {}: {error}", path.display())))
}

fn validate_language(language: &str) -> AppResult<()> {
    if language.is_empty()
        || language.len() > MAX_LANGUAGE_BYTES
        || !language
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(spellcheck_error("invalid dictionary language"));
    }
    Ok(())
}

fn validate_word(word: &str) -> AppResult<()> {
    if word.is_empty()
        || word.len() > MAX_WORD_BYTES
        || !word
            .chars()
            .all(|character| character.is_alphabetic() || matches!(character, '\'' | '-'))
    {
        return Err(spellcheck_error("invalid spellcheck word"));
    }
    Ok(())
}

fn lock_dictionary(dictionary: &SharedDictionary) -> AppResult<MutexGuard<'_, Option<Dictionary>>> {
    dictionary
        .lock()
        .map_err(|_| spellcheck_error("dictionary state lock was poisoned"))
}

async fn run_blocking<T>(task: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| AppError::Worker(error.to_string()))?
}

fn spellcheck_error(message: impl Into<String>) -> AppError {
    AppError::Spellcheck(message.into())
}

#[cfg(test)]
mod tests {
    use super::{read_dictionary_files, validate_language, validate_word, MAX_SUGGESTIONS};
    use spellbook::Dictionary;
    use std::path::PathBuf;

    #[test]
    fn rejects_path_like_languages_and_dictionary_syntax_words() {
        assert!(validate_language("en-US").is_ok());
        assert!(validate_language("../en-US").is_err());
        assert!(validate_word("researcher's").is_ok());
        assert!(validate_word("custom/G").is_err());
    }

    #[tokio::test]
    async fn bundled_dictionary_checks_suggests_and_adds_words() {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("resources")
            .join("dictionaries");
        let (aff, dic) = read_dictionary_files(&directory, "en-US").await.unwrap();
        let mut dictionary = Dictionary::new(&aff, &dic).unwrap();

        assert!(dictionary.check("editor"));
        assert!(!dictionary.check("mispellled"));

        let mut suggestions = Vec::new();
        dictionary.suggest("mispellled", &mut suggestions);
        suggestions.truncate(MAX_SUGGESTIONS);
        assert!(suggestions.len() <= MAX_SUGGESTIONS);

        dictionary.add("textexword").unwrap();
        assert!(dictionary.check("textexword"));
    }
}
