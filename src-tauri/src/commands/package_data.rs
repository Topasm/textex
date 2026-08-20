use tauri::{AppHandle, State};

use crate::{
    error::AppResult,
    models::PackageDataMap,
    services::package_data::{self, PackageDataState},
};

#[tauri::command]
pub async fn load_package_data(
    app: AppHandle,
    state: State<'_, PackageDataState>,
    package_names: Vec<String>,
) -> AppResult<PackageDataMap> {
    package_data::load_package_data(&app, state.inner(), package_names).await
}
