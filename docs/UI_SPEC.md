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
    |   +-- SearchBar + Dropdown (slash workflows, app commands, project/template search)
    |   +-- ActionButtons (Open Folder, New from Template)
    |   +-- RecentProjectsGrid (tiles)
    +-- Workspace (when project open)
    |   +-- SplitContainer
    |   |   +-- EditorPane
    |   |   +-- PreviewPane
    +-- LogPanel
    +-- StatusBar
    +-- SettingsModal (Full-workspace page)
    +-- HelpCenter (Full-workspace page)
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
- Left and right panels use short enter/exit presence transitions, remain mounted only for the
  exit duration, and disable motion when the operating system requests reduced motion. Resize
  gestures bypass width transitions so the panel continues to track the pointer directly.
- Panel separators support arrow-key resizing, Shift+Arrow acceleration, and Home/End bounds.
  Below the narrow-layout breakpoint, the left Navigator becomes a drawer with backdrop-click
  and Escape dismissal.
- Mounts all top-level components.
- Registers manifest-backed keyboard shortcuts through `useKeyboardShortcuts`.
- Uses domain Zustand stores and fine-grained selectors rather than a monolithic app store.
- Accesses native functionality only through the typed `window.api` Tauri adapter.
- Routes AI Draft and Claude Code/Codex CLI entry points through the Research panel's Chat tab.
- Owns the searchable in-app Help Center as an exclusive lazy-loaded overlay. Native Help, F1,
  Home, Settings, the command palette, and contextual hints all open the same surface and may
  request a specific guide section.
- Presents updater availability, download progress, errors, and restart actions in a compact
  bottom-centered dock above the status bar. The dock is viewport-fixed, expands upward for
  release notes, and never changes the editor or preview layout.
- On macOS, closing the main window hides it without tearing down the active project or dirty
  editor buffers. Clicking the Dock icon restores and focuses that same window. `Cmd+Q` and the
  native Quit item remain explicit application-exit paths and run dirty-document confirmation plus
  native project cleanup before terminating. Windows and Linux retain close-to-exit behavior.

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
- **Chat** contains AI Draft and Claude Code/Codex CLI entry points. In-flight research requests expose
  a Stop control backed by native cancellation, and approved source edits can apply and compile in
  one reviewable action.
- **References** is a unified current-paper manager: it cross-checks citations in project `.tex`
  files, bibliography entries, and Zotero items instead of separating Project and Zotero into
  peer tabs. Cited, missing, unused, linked, and Zotero-only states share one filterable list.
- Citation counts expand to bounded file-and-line provenance links. Possible project bibliography
  duplicates are detected by normalized DOI, arXiv ID, citekey, then title/year and are always
  presented for review without automatic merging.
- The Current Paper card includes live compile-problem status and opens the deterministic
  **Submission Check** as a secondary References view. Findings navigate through the same bounded,
  project-contained source path as compiler diagnostics.
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
  `/zotero`, `/online`, and `/find-sources` open the corresponding reference workflow with an
  optional prefilled query; `/submission-check`, `/todo`, `/outline`, and `/draft` reuse existing
  workspace surfaces without sending local commands to the AI.
- Zotero search and mutation intent are separate: `/zotero` navigates to library search, while
  `/zotero-plan <request>` enters the existing review-and-approve change workflow.
- The existing editor selection toolbar links selected `.tex` text to the workspace without a new
  popup: **Ask Chat** attaches an in-memory selection context, while **Find Sources** opens the
  unified Project + Zotero reference search with a reviewable prefilled query. Crossref/arXiv
  remains available as a secondary fallback after a completed local search has no matches.
  Selection bodies are not persisted in the per-project Chat session.

### `Toolbar.tsx`
- Acts as the primary document command surface at the top of the application.
- Keeps Terminal and compilation-log controls in the Research panel so the title bar remains
  focused on document and preview actions.
- Left group:
  - `Home` closes the current project and returns to the home screen.
  - The left-panel toggle mirrors the right-panel affordance, exposes `aria-expanded`, and pins an
    auto-hidden Navigator when invoked.
  - `Save` calls `window.api.saveFile(...)` / `saveFileAs(...)` through shared app commands.
  - `Compile` triggers manual compilation.
- Center group:
  - `OmniSearch` stays visible as the primary command/search surface.
  - `/` selects research/search workflows; `>` searches the same translated, context-aware
    `APP_COMMAND_MANIFEST` catalog used by the command palette.
  - Unavailable app commands remain discoverable and explain which document, PDF, or project
    context is required instead of silently doing nothing.
- Right group:
  - SyncTeX buttons (`PDF → Code`, `Code → PDF`)
  - PDF page jump input + total page count
  - Zoom dropdown with presets and fit actions
  - Current file badge (`Untitled` fallback, dirty dot when unsaved)
  - `Log` toggle button
- Other commands (`Open`, `Open Folder`, `Save As`, `New from Template`, `Export`,
  `Settings`) are reached through the home screen, OmniSearch, or keyboard shortcuts.
- Save, compile, and SyncTeX controls are disabled until their required document or PDF exists,
  avoiding controls that appear actionable but can only return without doing work.
- The file tree and command palette can open the trusted project root in the system terminal.

### `EditorPane.tsx`
- Wraps `@monaco-editor/react`.
- Language: custom `latex` registration with a local Monarch tokenizer.
- Theme: VS Code dark (default), ivory-light (light), hc-black (high-contrast).
- Monaco models own editable text. Change events update document revision metadata and
  trigger debounced auto-compile without copying the full document into Zustand.
- Cursor position tracked via `onDidChangeCursorPosition` (disposable stored
  in a ref and cleaned up on unmount).
- Syntax highlighting uses the local LaTeX Monarch tokenizer. Native outline parsing,
  package/reference completion, and compiler diagnostics provide the language workflow.
- **Inverse search flash:** When jumping to a line (from PDF click or Problems panel),
  a yellow fade-out highlight draws attention to the target line (1s animation).
- Config:
  - `wordWrap: 'on'`
  - `fontSize: from store (10–32px)`
  - `lineNumbers: 'on'`
  - `scrollBeyondLastLine: false`
  - `automaticLayout: true`
  - `padding: { top: 8 }`

### `ProsePane.tsx` / `ProsePreview.tsx`

- The paired writing workspace replaces TeX/PDF together with editable Markdown/rendered prose;
  the `.tex` document remains the only canonical buffer and no shadow `.md` file is created.
- The source pane uses a bounded reading measure, native spellcheck, compact bold/italic/code
  controls, familiar bold/italic shortcuts, word/line counts, and an explicit pending/synced/error
  indicator. Formatting is disabled for protected equations, figures, tables, and raw declarations
  that must be edited in TeX.
- Source edits are attributed to projected blocks and written back as revision-qualified ranged
  edits. Preamble, labels, comments, and unsupported LaTeX constructs are never re-serialized.
- The rendered pane has matching sticky chrome, visible citation/reference chips, KaTeX equations,
  bounded project figures, and a subtle active-block treatment. Hovering or focusing a rendered
  block exposes an Edit action that moves editable prose to the Markdown caret and protected
  equations, figures, tables, or declarations to their canonical TeX source.
- Caret movement, rendered-block clicks, and scrolling share source-line anchors. Direct
  navigation moves focus; passive scroll following does not, and programmatic following is
  suppressed briefly so the two panes cannot echo-scroll each other.
- A horizontal trackpad gesture still changes the complete TeX/PDF ⇄ Markdown/render pair, and all
  motion respects the operating system's reduced-motion preference.
- The paired-view gesture is observed during wheel capture so Monaco and the rendered Markdown
  surface cannot swallow one side of the transition. The PDF keeps ownership of horizontal
  gestures while TeX/PDF is visible, preserving single-page navigation.

### `FileTree.tsx`

- Uses the native project index when available and falls back to lazy directory
  reads, while keeping the same source-file filtering in both paths.
- Hides LaTeX-generated files (`.aux`, `.log`, `.toc`, `.bbl`, SyncTeX,
  latexmk state, and similar outputs) by default. A header eye control toggles
  legacy generated files that already exist inside the project.
- Keeps source PDF assets visible; a PDF is treated as generated only when a
  same-directory, same-stem `.tex` source exists.
- Provides an **Export for Overleaf** archive action. Native code prompts for a
  destination and creates a bounded source-only ZIP without generated files,
  VCS/application metadata, or `.latexmkrc`.

### `PreviewPane.tsx`
- Wraps `react-pdf`'s `<Document>` and `<Page>` components.
- Consumes a revision-qualified `pdfPath` from the current project's
  engine-specific application build cache, reads bytes through the dedicated
  typed Tauri compiled-PDF API, and stages each generation as `Uint8Array` data
  for PDF.js.
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
- Header actions can prefill Research Chat or launch the configured Claude Code/Codex CLI with bounded,
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
- Route-like application page that replaces the workspace below the native title bar. It uses the
  shared backdrop-free `AppPageFrame`; there is no floating card or outside-click dismissal.
- Persistent header with title, localized settings search, and close action. `Cmd/Ctrl+F` focuses
  search; the first `Escape` clears a query and the next closes the page.
- Left sidebar with six icon tabs and package-derived version; the centered right content column
  scrolls independently. Search indexes the localized copy for every category and filters the
  navigation to matching settings.
- **General**: Interface language, update policy, and package-derived application version.
  It also opens the in-app guide and resets previously dismissed feature hints.
- **Appearance**: Theme selector cards (Light/Dark/Glass/System), independently controlled
  PDF Night Mode, PDF layout controls, and scroll sync.
- **Editor**: Font Size range slider with monospace badge, behavior toggles (Word Wrap,
  Format on Save, Auto-hide Sidebar).
- **AI**: A default execution target, independent API/CLI connection cards,
  model selection, reasoning, credential, and prompt controls. Research Chat
  may keep a conversation-local provider/model override.
- **Integrations**: Zotero and Git cards.
- **Automation**: Tectonic/system pdfLaTeX engine selector, Auto Compile,
  external-file watching, and Spell Check. Tectonic cache controls
  are shown while the bundled engine is selected.
- Common rows, sections, selects, toggles, and segmented controls use shared typed
  settings primitives and `styles/settings.css`; specialized integration and AI layouts
  retain feature-specific classes. All reference the theme CSS custom properties.
- Toggle component uses `aria-checked` attribute with CSS-only animation (no JS class toggling).
- Persistence: Updates the settings Zustand store, persists renderer settings
  locally, and mirrors non-secret settings through the typed native API. AI
  credentials are stored separately by Rust and never enter `localStorage`.

### `HomeScreen.tsx`
Displayed when no project is open.

**Layout (top to bottom):**
1. **Brand** — "TextEx" title + "LaTeX Editor" subtitle.
2. **Action buttons** — "Open Folder" (primary), "Guided Demo Paper", "New Blank Project", and
   "New from Template". The guided action creates the same built-in demo available in the template
   gallery, including a citation, tour checklist, and project research profile. A compact
   "Learn TextEx" action opens the guide without creating a project.
3. **Recent projects list** — pinned and recent entries with open, rename/tag, pin,
   and remove actions.

Opening a folder restores a valid saved TeX tab when possible. With no valid
session it opens root-level `main.tex`, root-level `root.tex`, another
root-level `.tex` file, then the first nested `.tex` file in stable tree order.

**Props:** `onOpenFolder`, `onOpenGuidedDemo`, `onOpenHelp`, `onNewBlankProject`,
`onNewFromTemplate`.

### `HelpCenter.tsx`

- Searchable, keyboard-contained full-workspace page for quick start, gestures, writing/PDF, references,
  Research Chat and local agents, projects/export, and the live shortcut catalog.
- Shares `AppPageFrame` and the same header/sidebar/content geometry as Settings. The editor toolbar
  remains as application chrome while the guide replaces the complete workspace below it.
- When Settings opens the guide, a visible back action plus `Alt+Left` / `Cmd+[` returns to the
  same Settings page; closing the guide still exits the full-workspace surface.
- Search spans localized titles, descriptions, section names, gesture alternatives, and live
  accelerators. Results keep feature cards and matching shortcuts visibly grouped, show a live
  count, and can be cleared with the inline control or the first `Escape` press; a second
  `Escape` closes the page. `Cmd/Ctrl+F` returns focus to guide search.
- Generates shortcuts from `APP_COMMAND_MANIFEST` / `RENDERER_SHORTCUT_MANIFEST`; help copy never
  duplicates accelerator definitions.
- Shows an unavailable reason when an action needs a document, compiled PDF, or open project.
  Running an available action closes the guide before dispatching the shared app command.
- The guided demo opens a persistent manual checklist. Checklist progress and dismissed hints live
  in the bounded renderer-only `useLearningStore`; they contain no document or account data.
- `useFeatureHints` queues at most one relevant hint per application session. Hints appear only
  when no exclusive surface or other notification is active, never time out automatically, and
  always point to a visible or keyboard alternative for gesture-driven behavior.
- Gesture documentation distinguishes paired TeX/PDF ⇄ Markdown/render navigation, single-page
  PDF paging, PDF zoom, side-panel tab swipes, and accessible divider resizing.
- Visual treatment uses the shared theme surfaces, focus ring, spacing, radius, icon, and elevation
  tokens. Section counts, contextual requirement labels, a radial tour-progress summary, responsive
  icon navigation, forced-colors support, and reduced-motion fallbacks remain presentation-only.
- `learningIds.ts` and `learningHints.ts` contain only the bounded state vocabulary needed by the
  startup hint hook. The larger translated `learnCatalog.ts`, its derived section indexes, and guide
  icons remain behind the `HelpCenter` lazy boundary. Search text is normalized once per language,
  rather than rebuilding every translated entry on each keystroke.

### `GitPanel.tsx`

- Keeps local staging, unstaging, and commits inside the active-project Git boundary.
- Shows the configured remote/upstream plus ahead/behind counts without exposing remote URLs or
  embedded credentials.
- Fetch updates remote references without confirmation. Pull and Push show explicit previews.
- Native Pull refuses a dirty worktree and always uses `--ff-only`; Push requires an upstream and
  never supplies a force flag.
- Network commands use the user's existing credential helper or SSH agent with terminal prompting
  disabled, and results are discarded if the active project changes while a command is running.

### Native-only UI

Tauri is the only desktop runtime, so supported commands are presented directly without a
static all-true capability manifest. Opening the project in a system terminal uses the native
active-project authority and never accepts a renderer-supplied path.

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
- Shared dialog classes: `.modal-overlay`, `.modal-content`, `.modal-header`,
  `.modal-body`, `.modal-footer`, `.close-button`, `.primary-button`.
- Shared full-workspace page classes: `.app-page`, `.app-page-header`, `.app-page-title`,
  `.app-page-close`. Settings and Guide use this shell below the persistent app toolbar.
- Settings-specific classes: `.settings-page`, `.settings-layout`, `.settings-sidebar`,
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
