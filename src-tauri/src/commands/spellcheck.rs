use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{SpellInitResult, SuccessResult},
    services::spellcheck::{self, SpellcheckState},
};

#[tauri::command]
pub async fn spell_init(
    app: AppHandle,
    state: State<'_, SpellcheckState>,
    language: String,
) -> AppResult<SpellInitResult> {
    Ok(spellcheck::initialize(&app, state.inner(), &language).await)
}

#[tauri::command]
pub async fn spell_check(
    state: State<'_, SpellcheckState>,
    words: Vec<String>,
) -> AppResult<Vec<String>> {
    spellcheck::check_words(state.inner(), words).await
}

#[tauri::command]
pub async fn spell_suggest(
    state: State<'_, SpellcheckState>,
    word: String,
) -> AppResult<Vec<String>> {
    spellcheck::suggestions(state.inner(), word).await
}

#[tauri::command]
pub async fn spell_add_word(
    state: State<'_, SpellcheckState>,
    word: String,
) -> AppResult<SuccessResult> {
    spellcheck::add_word(state.inner(), word).await
}

#[tauri::command]
pub async fn spell_set_language(
    app: AppHandle,
    state: State<'_, SpellcheckState>,
    language: String,
) -> AppResult<SpellInitResult> {
    Ok(spellcheck::initialize(&app, state.inner(), &language).await)
}
