use tauri::{
    menu::{AboutMetadata, Menu, MenuEvent, MenuItem, Submenu, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};

use super::runtime;

pub const APP_COMMAND_EVENT: &str = "app-command";

const DOCUMENTATION_URL: &str = "https://github.com/Topasm/textex#readme";
const REPOSITORY_URL: &str = "https://github.com/Topasm/textex";
const ISSUE_URL: &str = "https://github.com/Topasm/textex/issues/new";

const RENDERER_COMMANDS: &[&str] = &[
    "file.open",
    "file.openFolder",
    "project.openTerminal",
    "file.save",
    "file.saveAs",
    "file.newTemplate",
    "file.export.html",
    "file.export.docx",
    "file.export.odt",
    "file.export.epub",
    "compile.run",
    "compile.submissionCheck",
    "ai.draft",
    "edit.find",
    "view.toggleSidebar",
    "view.toggleResearchPanel",
    "view.toggleLog",
    "view.search.citations",
    "view.search.pdf",
    "pdf.zoomIn",
    "pdf.zoomOut",
    "pdf.zoomReset",
    "pdf.fitWidth",
    "pdf.fitHeight",
    "app.settings",
    "app.checkUpdates",
    "window.close",
    "app.quit",
];

#[derive(Clone, Copy)]
struct NativeMenuCapabilities {
    ai: bool,
    document_export: bool,
    templates: bool,
}

const CAPABILITIES: NativeMenuCapabilities = NativeMenuCapabilities {
    ai: true,
    document_export: true,
    templates: true,
};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;

    #[cfg(target_os = "macos")]
    menu.append(&application_menu(app)?)?;
    menu.append(&file_menu(app)?)?;
    menu.append(&edit_menu(app)?)?;
    menu.append(&view_menu(app)?)?;
    menu.append(&pdf_menu(app)?)?;
    menu.append(&compile_menu(app)?)?;
    if CAPABILITIES.ai {
        menu.append(&ai_menu(app)?)?;
    }
    menu.append(&window_menu(app)?)?;
    menu.append(&help_menu(app)?)?;

    Ok(menu)
}

#[cfg(target_os = "macos")]
fn application_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "TextEx")
        .about(Some(AboutMetadata {
            name: Some("TextEx".to_owned()),
            version: Some(env!("CARGO_PKG_VERSION").to_owned()),
            website: Some(REPOSITORY_URL.to_owned()),
            website_label: Some("TextEx on GitHub".to_owned()),
            ..Default::default()
        }))
        .separator()
        .item(&command_item(
            app,
            "app.settings",
            "Settings…",
            Some("CmdOrCtrl+,"),
        )?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()
}

fn file_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let mut menu = SubmenuBuilder::new(app, "File")
        .item(&command_item(
            app,
            "file.open",
            "Open File…",
            Some("CmdOrCtrl+O"),
        )?)
        .item(&command_item(
            app,
            "file.openFolder",
            "Open Folder…",
            Some("CmdOrCtrl+Shift+O"),
        )?)
        .item(&command_item(
            app,
            "project.openTerminal",
            "Open Project in Terminal",
            None,
        )?);
    if CAPABILITIES.templates {
        menu = menu.item(&command_item(
            app,
            "file.newTemplate",
            "New From Template…",
            Some("CmdOrCtrl+Shift+N"),
        )?);
    }
    menu = menu
        .separator()
        .item(&command_item(
            app,
            "file.save",
            "Save",
            Some("CmdOrCtrl+S"),
        )?)
        .item(&command_item(
            app,
            "file.saveAs",
            "Save As…",
            Some("CmdOrCtrl+Shift+S"),
        )?);
    if CAPABILITIES.document_export {
        menu = menu.separator().item(&export_menu(app)?);
    }

    #[cfg(not(target_os = "macos"))]
    {
        menu = menu
            .separator()
            .item(&command_item(
                app,
                "app.settings",
                "Settings…",
                Some("CmdOrCtrl+,"),
            )?)
            .separator()
            .item(&command_item(app, "window.close", "Close Window", None)?)
            .item(&command_item(
                app,
                "app.quit",
                "Quit TextEx",
                Some("CmdOrCtrl+Q"),
            )?);
    }

    menu.build()
}

fn export_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "Export")
        .item(&command_item(app, "file.export.html", "HTML", None)?)
        .item(&command_item(app, "file.export.docx", "Word (DOCX)", None)?)
        .item(&command_item(
            app,
            "file.export.odt",
            "OpenDocument (ODT)",
            None,
        )?)
        .item(&command_item(app, "file.export.epub", "EPUB", None)?)
        .build()
}

fn edit_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&command_item(
            app,
            "edit.find",
            "Find in Project…",
            Some("CmdOrCtrl+F"),
        )?)
        .build()
}

fn view_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let menu = SubmenuBuilder::new(app, "View")
        .item(&command_item(
            app,
            "view.toggleSidebar",
            "Toggle Sidebar",
            Some("CmdOrCtrl+B"),
        )?)
        .item(&command_item(
            app,
            "view.toggleResearchPanel",
            "Toggle Research Panel",
            Some("CmdOrCtrl+Shift+B"),
        )?)
        .item(&command_item(
            app,
            "view.toggleLog",
            "Toggle Problems Panel",
            Some("CmdOrCtrl+L"),
        )?);
    menu.separator()
        .item(&command_item(
            app,
            "view.search.citations",
            "Search Citations…",
            Some("CmdOrCtrl+Shift+C"),
        )?)
        .item(&command_item(
            app,
            "view.search.pdf",
            "Search PDF…",
            Some("CmdOrCtrl+Shift+F"),
        )?)
        .build()
}

fn pdf_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "PDF")
        .item(&command_item(
            app,
            "pdf.zoomIn",
            "Zoom In",
            Some("CmdOrCtrl+="),
        )?)
        .item(&command_item(
            app,
            "pdf.zoomOut",
            "Zoom Out",
            Some("CmdOrCtrl+-"),
        )?)
        .item(&command_item(app, "pdf.zoomReset", "Actual Size", None)?)
        .separator()
        .item(&command_item(
            app,
            "pdf.fitWidth",
            "Fit Width",
            Some("CmdOrCtrl+0"),
        )?)
        .item(&command_item(
            app,
            "pdf.fitHeight",
            "Fit Height",
            Some("CmdOrCtrl+9"),
        )?)
        .build()
}

fn compile_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "Compile")
        .item(&command_item(
            app,
            "compile.run",
            "Compile Document",
            Some("CmdOrCtrl+Enter"),
        )?)
        .item(&command_item(
            app,
            "compile.submissionCheck",
            "Run Submission Check",
            None,
        )?)
        .item(&command_item(app, "view.toggleLog", "Show Problems", None)?)
        .build()
}

fn ai_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "AI")
        .item(&command_item(
            app,
            "ai.draft",
            "Generate Draft…",
            Some("CmdOrCtrl+Shift+D"),
        )?)
        .build()
}

fn window_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    #[cfg(target_os = "macos")]
    let menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .fullscreen();
    #[cfg(not(target_os = "macos"))]
    let menu = SubmenuBuilder::new(app, "Window")
        .item(&command_item(app, "window.minimize", "Minimize", None)?)
        .item(&command_item(
            app,
            "window.toggleMaximize",
            "Maximize / Restore",
            None,
        )?)
        .item(&command_item(
            app,
            "window.toggleFullscreen",
            "Toggle Full Screen",
            Some("F11"),
        )?);
    menu.build()
}

fn help_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let menu = SubmenuBuilder::new(app, "Help")
        .item(&command_item(
            app,
            "help.documentation",
            "Documentation",
            None,
        )?)
        .item(&command_item(
            app,
            "help.repository",
            "GitHub Repository",
            None,
        )?)
        .item(&command_item(
            app,
            "help.reportIssue",
            "Report an Issue…",
            None,
        )?)
        .separator()
        .item(&command_item(
            app,
            "app.checkUpdates",
            "Check for Updates…",
            None,
        )?);
    #[cfg(not(target_os = "macos"))]
    let menu = menu.separator().about(Some(AboutMetadata {
        name: Some("TextEx".to_owned()),
        version: Some(env!("CARGO_PKG_VERSION").to_owned()),
        website: Some(REPOSITORY_URL.to_owned()),
        website_label: Some("TextEx on GitHub".to_owned()),
        ..Default::default()
    }));
    menu.build()
}

fn command_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accelerator)
}

pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if RENDERER_COMMANDS.contains(&id) {
        let _ = app.emit_to("main", APP_COMMAND_EVENT, id);
        return;
    }
    match id {
        "help.documentation" => open_external(DOCUMENTATION_URL),
        "help.repository" => open_external(REPOSITORY_URL),
        "help.reportIssue" => open_external(ISSUE_URL),
        "window.minimize" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.minimize();
            }
        }
        "window.toggleMaximize" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(maximized) = window.is_maximized() {
                    if maximized {
                        let _ = window.unmaximize();
                    } else {
                        let _ = window.maximize();
                    }
                }
            }
        }
        "window.toggleFullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(fullscreen) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!fullscreen);
                }
            }
        }
        _ => {}
    }
}

fn open_external(url: &'static str) {
    tauri::async_runtime::spawn(async move {
        let _ = runtime::open_external(url).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn renderer_command_ids_are_unique_and_scoped() {
        let unique: HashSet<_> = RENDERER_COMMANDS.iter().copied().collect();
        assert_eq!(unique.len(), RENDERER_COMMANDS.len());
        assert!(RENDERER_COMMANDS.iter().all(|id| id.contains('.')));
        assert!(RENDERER_COMMANDS.contains(&"window.close"));
        assert!(RENDERER_COMMANDS.contains(&"app.quit"));
    }

    #[test]
    fn help_urls_use_the_existing_external_url_allowlist() {
        for url in [DOCUMENTATION_URL, REPOSITORY_URL, ISSUE_URL] {
            assert!(url.starts_with("https://"));
        }
    }
}
