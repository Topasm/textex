use std::collections::HashMap;

use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::{SuccessResult, Template, TemplateProjectResult},
    services::templates::{self, TemplateState},
    state::AppState,
};

#[tauri::command]
pub async fn list_custom_templates(
    app: AppHandle,
    state: State<'_, TemplateState>,
) -> AppResult<Vec<Template>> {
    templates::list_custom(&app, state.inner()).await
}

#[tauri::command]
pub async fn add_custom_template(
    app: AppHandle,
    state: State<'_, TemplateState>,
    name: String,
    description: String,
    content: String,
) -> AppResult<Template> {
    templates::add_custom(
        &app,
        state.inner(),
        name.trim().to_owned(),
        description.trim().to_owned(),
        content,
    )
    .await
}

#[tauri::command]
pub async fn remove_custom_template(
    app: AppHandle,
    state: State<'_, TemplateState>,
    id: String,
) -> AppResult<SuccessResult> {
    templates::remove_custom(&app, state.inner(), id.trim()).await
}

#[tauri::command]
pub async fn import_template_zip(
    app: AppHandle,
    state: State<'_, TemplateState>,
) -> AppResult<Option<Template>> {
    templates::import_zip(&app, state.inner()).await
}

#[tauri::command]
pub async fn create_template_project(
    app: AppHandle,
    project_state: State<'_, AppState>,
    template_name: String,
    content: String,
    files: Option<HashMap<String, String>>,
) -> AppResult<Option<TemplateProjectResult>> {
    templates::create_project(&app, project_state.inner(), &template_name, content, files).await
}
