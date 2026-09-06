use tauri::{AppHandle, Emitter, Runtime};

// Mirrored by src/shared/contextMenu.ts; checked by the renderer contract test.
pub const CONTEXT_MENU_EVENT: &str = "context-menu-selection";
pub const CONTEXT_MENU_ID_PREFIX: &str = "textex.context.";

/// Relay presentation choices only. Actions keep their existing validated commands.
/// One listener avoids accumulating a native callback registry for transient menus.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    if id.starts_with(CONTEXT_MENU_ID_PREFIX) {
        let _ = app.emit_to("main", CONTEXT_MENU_EVENT, id);
    }
}
