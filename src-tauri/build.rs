fn main() {
    const COMMANDS: &[&str] = &[
        "open_file",
        "open_directory",
        "read_directory",
        "read_file",
        "save_file",
        "save_file_as",
        "save_file_batch",
        "create_file",
        "create_directory",
        "copy_file",
        "rename_path",
        "delete_path",
        "read_file_base64",
        "read_file_binary",
        "git_is_repo",
        "git_init",
        "git_status",
        "git_stage",
        "git_unstage",
        "git_commit",
        "git_diff",
        "git_log",
        "git_file_log",
        "load_package_data",
        "watch_directory",
        "unwatch_directory",
        "load_settings",
        "save_settings",
        "activate_project",
        "add_recent_project",
        "remove_recent_project",
        "update_recent_project",
        "compile_latex",
        "cancel_compile",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to prepare the TextEx Tauri build");
}
