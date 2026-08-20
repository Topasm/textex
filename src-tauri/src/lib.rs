mod commands;
mod error;
mod models;
mod services;
mod state;

use services::package_data::PackageDataState;
use services::settings::SettingsState;
use services::watcher::DirectoryWatcherState;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .manage(DirectoryWatcherState::default())
        .manage(SettingsState::default())
        .manage(PackageDataState::default())
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::open_file,
            commands::filesystem::open_directory,
            commands::filesystem::read_directory,
            commands::filesystem::read_file,
            commands::filesystem::save_file,
            commands::filesystem::save_file_as,
            commands::filesystem::save_file_batch,
            commands::filesystem::create_file,
            commands::filesystem::create_directory,
            commands::filesystem::copy_file,
            commands::filesystem::rename_path,
            commands::filesystem::delete_path,
            commands::filesystem::read_file_base64,
            commands::filesystem::read_file_binary,
            commands::git::git_is_repo,
            commands::git::git_init,
            commands::git::git_status,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_commit,
            commands::git::git_diff,
            commands::git::git_log,
            commands::git::git_file_log,
            commands::package_data::load_package_data,
            commands::watcher::watch_directory,
            commands::watcher::unwatch_directory,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::activate_project,
            commands::settings::add_recent_project,
            commands::settings::remove_recent_project,
            commands::settings::update_recent_project,
            commands::compiler::compile_latex,
            commands::compiler::cancel_compile,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TextEx Tauri application");
}
