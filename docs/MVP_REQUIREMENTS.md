# TextEx — MVP Requirements

## Definition

The MVP is the smallest functional version of TextEx that delivers the core
value proposition: **edit LaTeX and see a PDF preview, with no external TeX
installation required**.

---

## Must-Have Features (MVP)

### 1. File Operations
- [x] Open a `.tex` file from disk via native file dialog.
- [x] Save the current file (`Ctrl/Cmd+S`).
- [x] Save As to a new location (`Ctrl/Cmd+Shift+S`).
- [x] Track unsaved changes (dirty indicator in toolbar).

### 2. Code Editor
- [x] Monaco Editor embedded in the left pane.
- [x] Basic LaTeX syntax highlighting (Monaco `latex` language).
- [x] Word wrap enabled by default.
- [x] Standard editor features (undo, redo, find/replace via Monaco built-ins).

### 3. Compilation
- [x] Bundled Tectonic binary resolved per platform (win/mac/linux).
- [x] Manual compile via button or `Ctrl/Cmd+Enter`.
- [x] Auto-compile on 1-second idle after typing.
- [x] Compilation stdout+stderr streamed to a log panel in real time.
- [x] Compile cancellation: new compiles kill any running process.

### 4. PDF Preview
- [x] Display compiled PDF in the right pane using react-pdf.
- [x] Scroll through multi-page documents.
- [x] Re-render on successful recompile without losing scroll position.

### 5. Error Display
- [x] Log panel shows Tectonic stdout+stderr output.
- [x] Log panel auto-opens on compilation failure.
- [x] Status bar shows current compile state (idle / compiling / success / error).
- [x] Save failures during auto-compile are reported in the log panel.

### 6. Error Recovery
- [x] React ErrorBoundary wraps the app to catch rendering crashes.
- [x] ErrorBoundary shows error details and a "Reload" button.

### 7. Packaging
- [~] Builds to a distributable installer for at least one platform.
  - **Status:** `electron-builder.yml` is configured. Actual packaging build
    has not been run yet (requires desktop environment for testing).
- [x] Tectonic binary is included in the packaged app (via `extraResources`).

---

## Implementation Status

**Code complete:** All MVP features have been implemented in code (Phases 0-6).

**Pending:**
- Integration testing on a desktop environment (Phase 7)
- Packaging build + smoke test (Phase 8.3-8.5)
- Download Tectonic binaries for Windows and macOS (Phase 8.2)
- App icons and build assets (icons, entitlements)

---

## Nice-to-Have (Post-MVP)

These are explicitly **out of scope** for the first release:

- [x] Draggable split-pane divider.
- [x] PDF zoom controls.
- [x] SyncTeX (click source <-> PDF jump).
- [x] Multi-file project support.
- [x] LaTeX snippet insertion / template gallery.
- [x] Dark/light theme toggle.
- [x] Custom font size setting.
- [x] Auto-update mechanism.
- [x] BibTeX / bibliography support UI.
- [x] Git integration.
- [x] Spell checker.
- [x] Export to other formats (HTML, DOCX via Pandoc).
- [x] ESLint + Prettier setup.
- [x] Unit tests (Vitest + @testing-library/react).
- [x] CLI tools (compile, init, export, templates) for headless operation and testing.
- [x] MCP server (compile_latex, get_compile_log) for AI tool integration.
- [x] TexLab LSP integration (diagnostics, completions, hover, definition, symbols, rename, formatting, folding).
- [x] Multi-file project support via magic comments (`%! TeX root = ...`).
- [x] Code folding for LaTeX sections, environments, and comments.
- [x] Inverse search flash animation (yellow highlight on jump-to-line).
- [x] Enhanced Problems Panel (file grouping, severity filters, counts).
- [x] Smart Image Drop (drag & drop images into editor).

---

## Prerequisites Before Coding

All prerequisites have been satisfied:

1. **Tectonic binary** -- Downloaded v0.15.0 (musl) for Linux.
   Located at `resources/bin/linux/tectonic`. Verified working.

2. **Node.js >= 18** -- v20.20.0 installed via nvm.

3. **Internet access** -- Required for first compilation (Tectonic downloads
   LaTeX packages to `~/.cache/Tectonic/`). Verified working.

---

## Acceptance Criteria

The MVP is complete when:

1. ~~A user can install the app on their OS without any prior TeX installation.~~
   **Pending:** packaging build needed.
2. [x] They can open or create a `.tex` file.
3. [x] They can type LaTeX and see a PDF preview update within a few seconds.
4. [x] Compilation errors are displayed clearly.
5. [x] They can save their work.
