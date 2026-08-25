# TextEx — UI Specification

## Layout

The application uses a horizontal split-pane layout:

```
+----------------------------------------------------------+
|  Toolbar: [Home] [Save] [Compile]  [OmniSearch]          |
|           [Sync] [Page] [Zoom]   file.tex (dot = dirty) [Log] |
+----------------------------+-----------------------------+
|                            |                             |
|                            |                             |
|     EditorPane             |      PreviewPane            |
|     (Monaco Editor)        |      (react-pdf)            |
|                            |                             |
|                            |                             |
|                            |                             |
|                            |                             |
+----------------------------+-----------------------------+
|  LogPanel (collapsible): compilation output / errors      |
+----------------------------------------------------------+
|  StatusBar: Ready | Compiling... | Error   Ln X, Col Y    |
+----------------------------------------------------------+
```

---

## Component Tree

```
ErrorBoundary
+-- App
    +-- Toolbar
    +-- HomeScreen (when no project open)
    |   +-- Brand
    |   +-- SearchBar + Dropdown (slash commands, project/template search)
    |   +-- ActionButtons (Open Folder, New from Template)
    |   +-- RecentProjectsGrid (tiles)
    +-- Workspace (when project open)
    |   +-- SplitContainer
    |   |   +-- EditorPane
    |   |   +-- PreviewPane
    +-- LogPanel
    +-- StatusBar
    +-- SettingsModal (Overlay)
    +-- TemplateGallery (Overlay)
```

---

## Component Specifications

### `ErrorBoundary.tsx`
- Class component wrapping the entire app (in `main.tsx`).
- Catches render errors via `getDerivedStateFromError`.
- Displays error message and a "Reload" button that calls `window.location.reload()`.

### `App.tsx`
- Root layout using Flexbox.
- Composes the workspace, resizable split panes, left Navigator, independent right Research panel,
  overlays, and status surfaces.
- Mounts all top-level components.
- Registers manifest-backed keyboard shortcuts through `useKeyboardShortcuts`.
- Uses domain Zustand stores and fine-grained selectors rather than a monolithic app store.
- Accesses native functionality only through the typed `window.api` Tauri adapter.
- Routes AI Draft and Claude/Codex CLI entry points through the Research panel's Chat tab.

### `ResearchPanel.tsx`

- Resizable and collapsible right-side panel, persisted per project and closed by default.
- On desktop its navigation rail occupies the right end of the 40 px title-bar row, while the
  document page/zoom controls retain their existing toolbar group to the left. Below 1200 px the
  panel returns below the title bar as a compact overlay so window controls remain reachable.
- Left Navigator and right Research navigation are both icon-only. Every icon remains a named
  button/tab through `aria-label` and `title`; active state uses the same accent underline rather
  than mixing labelled and unlabelled top-level navigation.
- Uses an overlay with backdrop and Escape dismissal below 1200 px.
- Visited tabs remain mounted while the panel is open, so Chat requests, queued prompts, draft
  text, and the Zotero inventory survive tab switches without repeating native work.
- **Chat** contains AI Draft and Claude/Codex CLI entry points. In-flight research requests expose
  a Stop control backed by native cancellation, and approved source edits can apply and compile in
  one reviewable action.
- **References** is a unified current-paper manager: it cross-checks citations in project `.tex`
  files, bibliography entries, and Zotero items instead of separating Project and Zotero into
  peer tabs. Cited, missing, unused, linked, and Zotero-only states share one filterable list.
- Icon-only Terminal and compilation-log controls live beside the Research tabs, including active
  state and a problem-count badge. Their full-width workspace surfaces remain unchanged.
- Zotero opens at a **My Library** root with a nested collection tree. Counts load lazily, selecting
  a collection loads its papers progressively, and cards distinguish project citekeys from
  Zotero-only items. Manual `zotero.bib` sync requires a new/removed/unchanged preview; individual
  additions and Crossref/arXiv results merge into `references.bib` before citation insertion.
- Reference health follows editor revisions and overlays unsaved `.tex` content on the native
  project scan. Whole-library Zotero inventory is cached briefly and invalidated after writes.
- Reference matching uses exact DOI, arXiv identifier, then Better BibTeX citekey. A normalized
  title-and-year match is shown only as a reviewable possibility and is never linked automatically.
  Crossref/arXiv is a secondary fallback shown after local Project + Zotero search has no result;
  power-user `/online` and `/paper` commands can still open it directly. Existing custom citation
  groups remain available from a compact secondary action rather than another top-level tab.
- Explicit Zotero collection/tag requests in Chat open a bounded change preview with Cancel and
  Approve actions. Planning is read-only; approval invokes the native Local API write path.
- Paper classification requests can add/remove matching Zotero items from nested collections.
  A single preview row combines that paper's tag and collection-membership changes.
- Typing `/` in the Chat composer opens a searchable, keyboard-accessible command menu. `/refs`,
  `/zotero`, and `/online` open the corresponding reference source with an optional prefilled
  query; `/todo`, `/outline`, and `/draft` reuse the existing workspace surfaces.
- Zotero search and mutation intent are separate: `/zotero` navigates to library search, while
  `/zotero-plan <request>` enters the existing review-and-approve change workflow.
- The existing editor selection toolbar links selected `.tex` text to the workspace without a new
  popup: **Ask Chat** attaches an in-memory selection context, while **Find Sources** opens the
  Online reference search with a reviewable prefilled query. Selection bodies are not persisted in
  the per-project Chat session.

### `Toolbar.tsx`
- Acts as the primary document command surface at the top of the application.
- Keeps Terminal and compilation-log controls in the Research panel so the title bar remains
  focused on document and preview actions.
- Left group:
  - `Home` closes the current project and returns to the home screen.
  - `Save` calls `window.api.saveFile(...)` / `saveFileAs(...)` through shared app commands.
  - `Compile` triggers manual compilation.
- Center group:
  - `OmniSearch` stays visible as the primary command/search surface.
- Right group:
  - SyncTeX buttons (`PDF → Code`, `Code → PDF`)
  - PDF page jump input + total page count
  - Zoom dropdown with presets and fit actions
  - Current file badge (`Untitled` fallback, dirty dot when unsaved)
  - `Log` toggle button
- Other commands (`Open`, `Open Folder`, `Save As`, `New from Template`, `Export`,
  `Settings`) are reached through the home screen, OmniSearch, or keyboard shortcuts.
- AI/Research and terminal controls are capability-gated and rendered by the Tauri runtime.

### `EditorPane.tsx`
- Wraps `@monaco-editor/react`.
- Language: custom `latex` registration with a local Monarch tokenizer.
- Theme: VS Code dark (default), ivory-light (light), hc-black (high-contrast).
- Monaco models own editable text. Change events update document revision metadata and
  trigger debounced auto-compile without copying the full document into Zustand.
- Cursor position tracked via `onDidChangeCursorPosition` (disposable stored
  in a ref and cleaned up on unmount).
- Syntax highlighting always has a local LaTeX Monarch fallback. When optional TexLab is
  available, its negotiated capabilities add diagnostics, folding, and semantic tokens.
- **Inverse search flash:** When jumping to a line (from PDF click or Problems panel),
  a yellow fade-out highlight draws attention to the target line (1s animation).
- Config:
  - `wordWrap: 'on'`
  - `fontSize: from store (10–32px)`
  - `lineNumbers: 'on'`
  - `scrollBeyondLastLine: false`
  - `automaticLayout: true`
  - `padding: { top: 8 }`

### `PreviewPane.tsx`
- Wraps `react-pdf`'s `<Document>` and `<Page>` components.
- Consumes a revision-qualified `pdfPath`, reads bytes through the typed Tauri API,
  and stages each generation as `Uint8Array` data for PDF.js.
- Features:
  - Scroll through pages continuously.
  - Multi-page support with dynamic page count via `onDocumentLoadSuccess`.
  - **Scroll position preservation** on recompile: tracks `scrollTop` via a ref
    and restores it in `requestAnimationFrame` after the new PDF loads.
  - Container width measured via `ResizeObserver` for responsive page sizing.
- Loading state: semi-transparent overlay with spinner during compilation
  (shown over the existing PDF so the previous output remains visible).
- Error state: "Compilation failed. Check the log panel." (only when no PDF exists).
- Empty state: "No PDF to display" placeholder.

### `LogPanel.tsx`
- Embedded in the right Research panel's Problems tab.
- Two tabs: **Problems** (structured) and **Output** (raw).
- **Output tab:** stdout+stderr from the selected LaTeX compiler, streamed in real time,
  auto-scroll.
- **Problems tab:**
  - Diagnostics grouped by file with collapsible headers and per-file error/warning counts.
  - Severity filter buttons (errors/warnings/info) to toggle visibility.
  - Problem count shown in tab label: `Problems (5)`.
  - Click any diagnostic to jump editor to that line.
- Header actions can prefill Research Chat or launch the configured Claude/Codex CLI with bounded,
  shell-safe diagnostic and raw-log context.
- "Clear" resets the bounded log content.

### `StatusBar.tsx`
- Fixed bar at the very bottom, styled with the VS Code blue accent color.
- Left side: compilation status indicator.
  - `Ready` (green dot) -- idle state
  - `Compiling...` (yellow dot) -- compilation in progress
  - `Success` (green dot) -- last compile succeeded
  - `Error` (red dot) -- last compile failed
  - Diagnostic counts (error/warning) from compilation
  - Git branch indicator when in a git repo
- Right side:
  - Spell check toggle: `Spell: On/Off` (clickable)
  - Section highlighting toggle
  - Cursor position (`Ln X, Col Y`) from Monaco's `onDidChangeCursorPosition`.

### `SettingsModal.tsx`
- Modal overlay (800×500) for application settings, using shared `.modal-overlay` /
  `.modal-content` / `.modal-header` / `.modal-footer` CSS classes.
- Left sidebar with six visible icon tabs; right scrollable content area.
- **General**: User information card (Name, Email, Affiliation) for templates/metadata.
- **Appearance**: Theme selector cards (Light/Dark/Glass/System), PDF Night Mode,
  PDF layout controls, and scroll sync.
- **Editor**: Font Size range slider with monospace badge, behavior toggles (Word Wrap,
  Format on Save, Auto-hide Sidebar).
- **AI**: Native HTTP/CLI provider, model, credential, and prompt controls.
- **Integrations**: Zotero and Git cards.
- **Automation**: Tectonic/system pdfLaTeX engine selector, Auto Compile,
  external-file watching, Spell Check, and TexLab toggles. Tectonic cache controls
  are shown while the bundled engine is selected.
- All styling uses `settings-*` CSS classes referencing CSS custom properties
  (`--accent`, `--bg-input`, `--card-bg`, etc.) — fully themed across dark/light/high-contrast.
- Toggle component uses `aria-checked` attribute with CSS-only animation (no JS class toggling).
- Persistence: Updates `settings` slice in Zustand store, saved to `localStorage`.

### `HomeScreen.tsx`
Displayed when no project is open.

**Layout (top to bottom):**
1. **Brand** — "TextEx" title + "LaTeX Editor" subtitle.
2. **Action buttons** — "Open Folder" (primary), "New Blank Project", and
   "New from Template".
3. **Recent projects list** — pinned and recent entries with open, rename/tag, pin,
   and remove actions.

**Props:** `onOpenFolder`, `onNewBlankProject`, `onNewFromTemplate`.

### Capability-gated UI

The Tauri runtime reports native AI, PTY, and LSP capabilities. `DraftModal`, Research
chat, `TerminalPane`, and TexLab lifecycle surfaces remain gated through the capability
map so a future target can omit a domain without bypassing `DesktopApi`.

---

## Zustand Store Boundaries

- `useEditorStore` — active/open document IDs, dirty/revision metadata, cursor, and
  pending editor actions. Monaco models own the canonical text through `DocumentRegistry`.
- `useCompileStore` — compile status, bounded logs, diagnostics, and revision-qualified
  PDF paths.
- `usePdfStore` — split/zoom/page/search/SyncTeX UI state and persisted layout.
- `useProjectStore` — project root/index, sidebar, bibliography, package, and Git state.
- `useUiStore` — transient overlays, update/export state, search focus, and conflicts.
- `useSettingsStore` — persisted `UserSettings` and the native settings mirror.

Components subscribe with fine-grained selectors; there is no monolithic `useAppStore`.

---

## Auto-Compile Hook (`useAutoCompile.ts`)

- Subscribes to active document revision and file-path changes.
- 1000ms debounce timer.
- Snapshots and batch-saves dirty document models first; a save error aborts compilation.
- Marks only the exact saved revision clean, preserving edits made during an in-flight save.
- Submits a typed revision-qualified request through `window.api.compile(...)`.
- Silently ignores "Compilation was cancelled" errors (from compile cancellation).
- Publishes only the latest matching response to `useCompileStore`.

---

## File Operations Hook (`useFileOps.ts`)

- `handleOpen()` -- opens the native dialog, activates the parent project, and registers
  the selected file's Monaco-backed document model.
- `handleSave()` -- snapshots the active `DocumentModel`, optionally formats it, and marks
  only the saved revision clean.
- `handleSaveAs()` -- saves the active snapshot, opens the returned path, and closes the
  old tab when the path changes.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + Shift + O` | Open folder |
| `Ctrl/Cmd + S` | Save file |
| `Ctrl/Cmd + Shift + S` | Save as |
| `Ctrl/Cmd + Enter` | Manual compile |
| `Ctrl/Cmd + L` | Toggle log panel |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + Shift + B` | Toggle Research panel |
| `Ctrl/Cmd + F` | Find in editor |
| `Ctrl/Cmd + Shift + C` | Search citations |
| `Ctrl/Cmd + Shift + F` | Search PDF text |
| `Ctrl/Cmd + 0` / `9` | Fit PDF width / height |
| `Ctrl/Cmd + ,` | Open settings |

---

## Styling Notes

- Plain CSS (no Tailwind) in `src/renderer/styles/index.css`.
- Themes use CSS custom properties; the settings UI exposes light, dark, glass,
  and system-following modes.
- Glass uses warm neutral, nearly opaque workspace surfaces for legibility. Blur
  is reserved for floating controls, while blue is limited to selection and
  action accents.
- Color palette (dark defaults shown):
  - Background: `#1e1e1e` (`--bg-primary`)
  - Editor gutter / sidebar: `#252526` (`--bg-secondary`)
  - Toolbar: `#333333`
  - Accent: `#007acc` (`--accent`)
  - Error: `#f44747` (`--error`)
  - Success: `#6a9955` (`--success`)
  - Dirty indicator: `#cca700` (yellow dot + save button highlight)
  - Status bar: `#007acc` (blue bar with white text)
- Shared modal classes: `.modal-overlay`, `.modal-content`, `.modal-header`,
  `.modal-body`, `.modal-footer`, `.close-button`, `.primary-button`.
- Settings-specific classes: `.settings-modal`, `.settings-layout`, `.settings-sidebar`,
  `.settings-tab`, `.settings-content`, `.settings-section`, `.settings-row`,
  `.settings-input`, `.settings-select`, `.settings-toggle-track`, `.settings-theme-card`,
  `.settings-range`, `.settings-badge`, `.settings-status-badge`, etc.
- Home screen classes: `.home-screen`, `.home-brand`, `.home-title`, `.home-subtitle`,
  `.home-search-wrapper`, `.home-search-bar`, `.home-search-input`, `.home-search-clear`,
  `.home-search-dropdown`, `.home-search-result` (`.selected`), `.home-search-result-icon`,
  `.home-search-result-text`, `.home-search-result-badge`, `.home-actions`,
  `.home-action-btn`, `.home-recent`, `.home-recent-grid`, `.home-recent-tile`,
  `.home-recent-tile-icon`, `.home-recent-tile-name`, `.home-recent-tile-path`,
  `.home-recent-tile-date`, `.home-recent-tile-remove`.
