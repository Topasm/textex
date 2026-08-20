/**
 * Renderer-side names for the Rust commands available during the incremental
 * Tauri migration. Keep this map aligned with `src-tauri/build.rs` and the
 * handler list in `src-tauri/src/lib.rs`.
 */
export const TAURI_COMMANDS = {
  openFile: 'open_file',
  openDirectory: 'open_directory',
  activateProject: 'activate_project',
  readDirectory: 'read_directory',
  readFile: 'read_file',
  saveFile: 'save_file',
  saveFileAs: 'save_file_as',
  saveFileBatch: 'save_file_batch',
  createFile: 'create_file',
  createDirectory: 'create_directory',
  copyFile: 'copy_file',
  readFileBase64: 'read_file_base64',
  readFileBinary: 'read_file_binary',
  watchDirectory: 'watch_directory',
  unwatchDirectory: 'unwatch_directory',
  loadSettings: 'load_settings',
  saveSettings: 'save_settings',
  addRecentProject: 'add_recent_project',
  removeRecentProject: 'remove_recent_project',
  updateRecentProject: 'update_recent_project',
  compile: 'compile_latex',
  cancelCompile: 'cancel_compile'
} as const
