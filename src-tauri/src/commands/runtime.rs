use tauri::State;

use crate::{
    error::AppResult,
    models::{PerformanceMemorySample, SuccessResult},
    services::runtime::{self, PerformanceState},
};

#[tauri::command]
pub async fn open_external(url: String) -> AppResult<SuccessResult> {
    runtime::open_external(url.trim()).await
}

#[tauri::command]
pub async fn get_performance_memory(
    state: State<'_, PerformanceState>,
) -> AppResult<PerformanceMemorySample> {
    runtime::performance_memory(state.inner()).await
}
