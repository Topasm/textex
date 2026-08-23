mod commands;
mod error;
mod models;
mod services;
mod state;

use services::history::HistoryState;
use services::package_data::PackageDataState;
use services::project_index::ProjectIndexState;
use services::references::ReferenceIndexState;
use services::settings::SettingsState;
use services::synctex::SyncTexState;
use services::updater::AppUpdaterState;
use services::watcher::DirectoryWatcherState;
use services::zotero::ZoteroSyncState;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let updater_plugin = tauri_plugin_updater::Builder::new()
        .pubkey(services::updater::updater_public_key())
        .build();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(updater_plugin)
        .manage(AppState::default())
        .manage(DirectoryWatcherState::default())
        .manage(SettingsState::default())
        .manage(PackageDataState::default())
        .manage(HistoryState::default())
        .manage(ProjectIndexState::default())
        .manage(ReferenceIndexState::default())
        .manage(SyncTexState::default())
        .manage(AppUpdaterState::default())
        .manage(ZoteroSyncState::default())
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
            commands::history::save_history_snapshot,
            commands::history::get_history_list,
            commands::history::load_history_snapshot,
            commands::package_data::load_package_data,
            commands::project_index::get_project_index,
            commands::references::parse_bib_file,
            commands::references::find_bib_in_project,
            commands::references::scan_labels,
            commands::zotero::zotero_probe,
            commands::zotero::zotero_search,
            commands::zotero::zotero_cite_cayw,
            commands::zotero::zotero_export_bibtex,
            commands::zotero::zotero_sync_collection,
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
            commands::synctex::synctex_forward,
            commands::synctex::synctex_inverse,
            commands::synctex::synctex_build_line_map,
            commands::updater::check_app_update,
            commands::updater::download_and_install_update,
            commands::updater::restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TextEx Tauri application");
}
