mod commands;
mod error;
mod models;
mod services;
mod state;

use services::ai::AiState;
use services::filesystem::FileSaveState;
use services::history::HistoryState;
use services::lsp::LspState;
use services::package_data::PackageDataState;
use services::project_data::ProjectDataState;
use services::project_index::ProjectIndexState;
use services::pty::PtyState;
use services::recovery::RecoveryState;
use services::references::ReferenceIndexState;
use services::research::ResearchState;
use services::research_source::ResearchSourceState;
use services::runtime::PerformanceState;
use services::settings::SettingsState;
use services::spellcheck::SpellcheckState;
use services::synctex::SyncTexState;
use services::templates::TemplateState;
use services::updater::AppUpdaterState;
use services::watcher::DirectoryWatcherState;
use services::zotero::ZoteroSyncState;
use state::AppState;

const PACKAGE_SMOKE_ENV: &str = "TEXTEX_PACKAGE_SMOKE";
const EMBEDDED_TAURI_CONFIG: &str = include_str!("../tauri.conf.json");

fn package_smoke_requested() -> bool {
    std::env::var_os(PACKAGE_SMOKE_ENV).is_some_and(|value| value == "1")
}

fn validate_embedded_package_config(config: &str) -> Result<(), String> {
    let config: serde_json::Value = serde_json::from_str(config)
        .map_err(|error| format!("embedded tauri.conf.json is invalid: {error}"))?;
    if config.get("identifier").and_then(serde_json::Value::as_str) != Some("com.topasm.textex") {
        return Err("embedded application identifier is invalid".to_owned());
    }
    let updater = config
        .pointer("/plugins/updater")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "embedded updater configuration is missing".to_owned())?;
    if !updater
        .get("pubkey")
        .is_some_and(serde_json::Value::is_string)
    {
        return Err("embedded updater public-key field is missing".to_owned());
    }
    let external_bins = config
        .pointer("/bundle/externalBin")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "embedded externalBin configuration is missing".to_owned())?;
    if !external_bins
        .iter()
        .any(|value| value.as_str() == Some("binaries/tectonic"))
    {
        return Err("embedded Tectonic sidecar configuration is missing".to_owned());
    }
    let resources = config
        .pointer("/bundle/resources")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "embedded resource configuration is missing".to_owned())?;
    if !resources
        .iter()
        .any(|(source, target)| source.contains("tectonic-cache") || target == "tectonic-cache/")
    {
        return Err("embedded Tectonic cache resource configuration is missing".to_owned());
    }
    Ok(())
}

fn validate_packaged_sidecar() -> Result<(), String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("cannot resolve packaged executable: {error}"))?;
    let directory = executable
        .parent()
        .ok_or_else(|| "packaged executable has no parent directory".to_owned())?;
    let sidecar = directory.join(if cfg!(windows) {
        "tectonic.exe"
    } else {
        "tectonic"
    });
    let metadata = std::fs::symlink_metadata(&sidecar).map_err(|error| {
        format!(
            "packaged Tectonic sidecar is missing at {}: {error}",
            sidecar.to_string_lossy()
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "packaged Tectonic sidecar is not a regular file: {}",
            sidecar.to_string_lossy()
        ));
    }
    Ok(())
}

fn run_package_smoke() -> Result<(), String> {
    validate_embedded_package_config(EMBEDDED_TAURI_CONFIG)?;
    validate_packaged_sidecar()
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn setup_custom_window_chrome(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        window.set_decorations(false)?;
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn setup_custom_window_chrome(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if package_smoke_requested() {
        match run_package_smoke() {
            Ok(()) => println!("TextEx package smoke: ok"),
            Err(error) => {
                eprintln!("TextEx package smoke: failed: {error}");
                std::process::exit(2);
            }
        }
        return;
    }
    let updater_plugin = tauri_plugin_updater::Builder::new()
        .pubkey(services::updater::updater_public_key())
        .build();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(updater_plugin);

    // macOS keeps its native application menu and traffic-light controls. On
    // Windows and Linux the renderer supplies one-row custom chrome instead.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(services::menu::build)
        .on_menu_event(services::menu::handle_event);

    builder
        .manage(AppState::default())
        .manage(FileSaveState::default())
        .manage(AiState::default())
        .manage(DirectoryWatcherState::default())
        .manage(SettingsState::default())
        .manage(PackageDataState::default())
        .manage(HistoryState::default())
        .manage(RecoveryState::default())
        .manage(LspState::default())
        .manage(ProjectIndexState::default())
        .manage(PtyState::default())
        .manage(ProjectDataState::default())
        .manage(ReferenceIndexState::default())
        .manage(ResearchState::default())
        .manage(ResearchSourceState::default())
        .manage(PerformanceState::default())
        .manage(SpellcheckState::default())
        .manage(TemplateState::default())
        .manage(SyncTexState::default())
        .manage(AppUpdaterState::default())
        .manage(ZoteroSyncState::default())
        .invoke_handler(tauri::generate_handler![
            commands::ai::ai_generate,
            commands::ai::ai_process,
            commands::ai::ai_process_custom,
            commands::ai::ai_research_chat,
            commands::ai::ai_plan_zotero,
            commands::ai::ai_update_context,
            commands::ai::ai_save_api_key,
            commands::ai::ai_has_api_key,
            commands::ai::ai_check_cli,
            commands::ai::ai_check_codex_cli,
            commands::ai::ai_open_claude_terminal,
            commands::ai::ai_open_codex_terminal,
            commands::filesystem::open_file,
            commands::filesystem::open_directory,
            commands::filesystem::read_directory,
            commands::filesystem::read_file,
            commands::filesystem::save_file,
            commands::filesystem::write_file_binary,
            commands::filesystem::save_file_as,
            commands::filesystem::save_file_batch,
            commands::filesystem::create_file,
            commands::filesystem::create_directory,
            commands::filesystem::copy_file,
            commands::filesystem::rename_path,
            commands::filesystem::delete_path,
            commands::filesystem::read_file_base64,
            commands::filesystem::read_file_binary,
            commands::templates::create_template_project,
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
            commands::recovery::save_recovery_snapshot,
            commands::recovery::list_recovery_snapshots,
            commands::recovery::load_recovery_snapshot,
            commands::recovery::discard_recovery_snapshot,
            commands::recovery::clear_recovery_snapshot,
            commands::package_data::load_package_data,
            commands::project_index::get_project_index,
            commands::project_data::project_init,
            commands::project_data::project_exists,
            commands::project_data::project_load,
            commands::project_data::project_save,
            commands::project_data::project_touch,
            commands::project_data::project_compile_load,
            commands::project_data::project_compile_save,
            commands::project_data::project_compile_clear,
            commands::project_data::project_compile_log_save,
            commands::project_data::project_compile_log_load,
            commands::project_data::project_snippets_load,
            commands::project_data::project_snippets_add,
            commands::project_data::project_snippets_remove,
            commands::project_data::project_bookmarks_load,
            commands::project_data::project_bookmarks_add,
            commands::project_data::project_bookmarks_remove,
            commands::project_data::load_citation_groups,
            commands::project_data::save_citation_groups,
            commands::references::parse_bib_file,
            commands::references::find_bib_in_project,
            commands::references::scan_labels,
            commands::references::scan_citations,
            commands::spellcheck::spell_init,
            commands::spellcheck::spell_check,
            commands::spellcheck::spell_suggest,
            commands::spellcheck::spell_add_word,
            commands::spellcheck::spell_set_language,
            commands::templates::list_custom_templates,
            commands::templates::add_custom_template,
            commands::templates::remove_custom_template,
            commands::templates::import_template_zip,
            commands::zotero::zotero_probe,
            commands::zotero::zotero_search,
            commands::zotero::zotero_cite_cayw,
            commands::zotero::zotero_export_bibtex,
            commands::zotero::zotero_sync_collection,
            commands::zotero::zotero_collections,
            commands::zotero::zotero_library_tree,
            commands::zotero::zotero_collection_items,
            commands::zotero::zotero_add_to_project,
            commands::zotero::zotero_save_online,
            commands::zotero::zotero_apply_mutation_plan,
            commands::research::research_search_online,
            commands::research::research_add_online,
            commands::research::research_load_config,
            commands::research::research_save_config,
            commands::research::research_profile_load,
            commands::research::research_profile_save,
            commands::research::research_chat_session_load,
            commands::research::research_chat_session_save,
            commands::research::research_chat_session_clear,
            commands::research::research_resource_snapshot,
            commands::research_source::research_source_index,
            commands::research_source::research_source_search,
            commands::research_source::research_source_clone,
            commands::research_source::research_source_fetch,
            commands::pty::pty_create,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_dispose,
            commands::lsp::lsp_start,
            commands::lsp::lsp_stop,
            commands::lsp::lsp_send,
            commands::lsp::lsp_status,
            commands::watcher::watch_directory,
            commands::watcher::unwatch_directory,
            commands::watcher::deactivate_project,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::activate_project,
            commands::settings::get_active_project,
            commands::settings::add_recent_project,
            commands::settings::remove_recent_project,
            commands::settings::update_recent_project,
            commands::compiler::compile_latex,
            commands::compiler::cancel_compile,
            commands::compiler::tectonic_cache_status,
            commands::compiler::tectonic_cache_reset,
            commands::synctex::synctex_forward,
            commands::synctex::synctex_inverse,
            commands::synctex::synctex_build_line_map,
            commands::export::export_document,
            commands::export::get_export_formats,
            commands::runtime::open_external,
            commands::runtime::exit_app,
            commands::runtime::get_performance_memory,
            commands::updater::check_app_update,
            commands::updater::download_and_install_update,
            commands::updater::restart_app,
        ])
        .setup(setup_custom_window_chrome)
        .run(tauri::generate_context!())
        .expect("failed to run TextEx Tauri application");
}

#[cfg(test)]
mod package_smoke_tests {
    use super::*;

    #[test]
    fn embedded_package_config_passes_smoke_validation() {
        validate_embedded_package_config(EMBEDDED_TAURI_CONFIG).unwrap();
    }

    #[test]
    fn package_config_requires_updater_sidecar_and_cache() {
        let missing_updater = EMBEDDED_TAURI_CONFIG.replace("\"updater\"", "\"removed\"");
        assert!(validate_embedded_package_config(&missing_updater).is_err());

        let missing_sidecar = EMBEDDED_TAURI_CONFIG.replace("binaries/tectonic", "binaries/other");
        assert!(validate_embedded_package_config(&missing_sidecar).is_err());

        let missing_cache = EMBEDDED_TAURI_CONFIG.replace("tectonic-cache", "other-cache");
        assert!(validate_embedded_package_config(&missing_cache).is_err());
    }
}
