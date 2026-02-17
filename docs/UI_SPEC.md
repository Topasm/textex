# TextEx — UI Specification

## Layout

The application uses a horizontal split-pane layout:

```
+----------------------------------------------------------+
|  Toolbar: [Open Ctrl+O] [Save Ctrl+S] [Compile] [Log] [Settings] |
|           file.tex (dot = dirty)                         |
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
    +-- DraftModal (Overlay, supports initialPrompt prefill)
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
- Manages the split ratio (default 50/50, draggable divider is a stretch goal).
- Mounts all top-level components.
- Registers keyboard shortcuts via a `keydown` event listener.
- Sets up the `latex:log` IPC listener on mount (using `useAppStore.getState()` to
  avoid stale closure issues).
- Manages `draftPrefill` state alongside `isDraftModalOpen` so the `/draft` slash
  command can pre-fill the DraftModal prompt. `handleAiDraft(prefill?)` sets both
  and is passed to HomeScreen and Toolbar.

### `Toolbar.tsx`
| Button | Action | Shortcut |
|---|---|---|
| Open | Calls `window.api.openFile()`, loads content into editor | `Ctrl/Cmd+O` |
| Save | Calls `window.api.saveFile(content, path)` | `Ctrl/Cmd+S` |
| Save As | Calls `window.api.saveFileAs(content)` | `Ctrl/Cmd+Shift+S` |
| Compile | Triggers manual compilation | `Ctrl/Cmd+Enter` |
| Toggle Log | Shows/hides the LogPanel | `Ctrl/Cmd+L` |
| Settings | Opens Settings Modal | -- |

Each button displays its keyboard shortcut as a `<kbd>` element.

Displays the current file name (or "Untitled"). The dirty indicator is a yellow
dot next to the file name (replacing the previous `*` suffix). The Save button
highlights with a yellow background when the file is dirty.

### `EditorPane.tsx`
- Wraps `@monaco-editor/react`.
- Language: `latex` (Monaco built-in recognition).
- Theme: VS Code dark (default), ivory-light (light), hc-black (high-contrast).
- `onChange` handler updates Zustand store and triggers debounced auto-compile.
- Cursor position tracked via `onDidChangeCursorPosition` (disposable stored
  in a ref and cleaned up on unmount).
- **Code folding:** LSP-powered via `textDocument/foldingRange` — fold arrows appear
  in the gutter for sections, environments, and comment blocks.
- **Inverse search flash:** When jumping to a line (from PDF click or Problems panel),
  a yellow fade-out highlight draws attention to the target line (1s animation).
- Config:
  - `wordWrap: 'on'`
  - `minimap: { enabled: false }` (save space)
  - `fontSize: from store (8–32px)`
  - `lineNumbers: 'on'`
  - `scrollBeyondLastLine: false`
  - `automaticLayout: true`
  - `padding: { top: 8 }`

### `PreviewPane.tsx`
- Wraps `react-pdf`'s `<Document>` and `<Page>` components.
- Accepts `pdfBase64` from the store; converts to `Uint8Array` for PDF.js.
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
- Collapsible panel at the bottom (default: hidden).
- Auto-opens when a compilation error occurs.
- Two tabs: **Problems** (structured) and **Output** (raw).
- **Output tab:** stdout+stderr from Tectonic, streamed in real time, auto-scroll.
- **Problems tab:**
  - Diagnostics grouped by file with collapsible headers and per-file error/warning counts.
  - Severity filter buttons (errors/warnings/info) to toggle visibility.
  - Problem count shown in tab label: `Problems (5)`.
  - Click any diagnostic to jump editor to that line.
- Monospace font, 200px height.
- "Clear" button to reset log content. "Close" button to collapse.

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
  - LSP status: `Connected` / `Starting...` / `Error` / `Off` (shown when LSP enabled)
  - Spell check toggle: `Spell: On/Off` (clickable)
  - Cursor position (`Ln X, Col Y`) from Monaco's `onDidChangeCursorPosition`.

### `SettingsModal.tsx`
- Modal overlay (800×500) for application settings, using shared `.modal-overlay` /
  `.modal-content` / `.modal-header` / `.modal-footer` CSS classes.
- Left sidebar with five icon tabs; right scrollable content area.
- **General**: User information card (Name, Email, Affiliation) for templates/metadata.
- **Appearance**: Theme selector cards (Light/Dark/System) with checkmark, PDF Night Mode toggle.
- **Editor**: Font Size range slider with monospace badge, behavior toggles (Word Wrap,
  Format on Save, Auto-hide Sidebar).
- **Integrations**: Zotero card (enable/disable toggle, port input, live connection probe),
  AI Draft card (provider select, model input, API key with save button).
- **Automation**: Compiler & Tools toggles (Auto Compile, Spell Check, Language Server).
- All styling uses `settings-*` CSS classes referencing CSS custom properties
  (`--accent`, `--bg-input`, `--card-bg`, etc.) — fully themed across dark/light/high-contrast.
- Toggle component uses `aria-checked` attribute with CSS-only animation (no JS class toggling).
- Persistence: Updates `settings` slice in Zustand store, saved to `localStorage`.

### `HomeScreen.tsx`
Displayed when no project is open (browser new-tab style landing page).

**Layout (top to bottom):**
1. **Brand** — "TextEx" title + "LaTeX Editor" subtitle.
2. **Search bar** — auto-focused on mount, with a Search icon and clear button.
   - Typing a project name or template name filters recent projects and templates
     in a dropdown below the search bar.
   - Typing `/` shows slash commands in the dropdown.
   - Arrow keys navigate the dropdown, Enter selects, Escape dismisses.
3. **Action buttons** — "Open Folder" (primary) and "New from Template".
4. **Recent projects grid** — responsive CSS grid of tiles (`minmax(200px, 1fr)`),
   each tile shows a folder icon, project name, path, and relative date. A remove
   button appears on hover (top-right corner).

**Slash commands:**

| Command | Action |
|---------|--------|
| `/draft [prompt]` | Opens DraftModal, optionally pre-filled with the text after `/draft` |
| `/template` | Opens TemplateGallery modal |
| `/open` | Opens native folder picker dialog |
| `/help` | Opens SettingsModal |

**Props:** `onOpenFolder`, `onNewFromTemplate`, `onAiDraft(prefill?)`, `onOpenSettings`.

**Search result types:** Each dropdown item shows an icon, label, detail text, and a
badge pill ("Recent", "Template", or "Command").

### `DraftModal.tsx`
- Modal overlay for AI-powered LaTeX document generation.
- Three phases: `input` → `generating` → `preview`.
- Accepts an optional `initialPrompt` prop to pre-fill the input textarea
  (used by the `/draft` slash command from the home screen search bar).
- Input phase: textarea with placeholder, Generate button (Ctrl+Enter).
- Preview phase: editable generated LaTeX, Insert into Editor button.

---

## Zustand Store Shape

```typescript
export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'

interface AppState {
  // File
  filePath: string | null
  content: string
  isDirty: boolean

  // Compilation
  compileStatus: CompileStatus
  pdfBase64: string | null
  logs: string

  // UI
  isLogPanelOpen: boolean
  cursorLine: number
  cursorColumn: number

  // Settings
  settings: UserSettings

  // Actions
  setContent: (content: string) => void
  setFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  setCompileStatus: (status: CompileStatus) => void
  setPdfBase64: (data: string | null) => void
  appendLog: (text: string) => void
  clearLogs: () => void
  toggleLogPanel: () => void
  setLogPanelOpen: (open: boolean) => void
  setCursorPosition: (line: number, column: number) => void
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void
}
```

---

## Auto-Compile Hook (`useAutoCompile.ts`)

- Watches `content` and `filePath` changes in store.
- 1000ms debounce timer.
- Saves file first; if save fails, logs the error and aborts (does not compile).
- On save success, clears dirty flag.
- Triggers compilation via `window.api.compile(filePath)`.
- Silently ignores "Compilation was cancelled" errors (from compile cancellation).
- Updates `compileStatus` and `pdfBase64` on success, opens log panel on error.
- Full dependency array includes all store selectors used in the effect.

---

## File Operations Hook (`useFileOps.ts`)

- `handleOpen()` -- native dialog, loads content into store, clears dirty flag.
- `handleSave()` -- saves to disk using `useAppStore.getState()` for fresh content.
  Falls back to Save As if no file path exists.
- `handleSaveAs()` -- save dialog, updates path in store, clears dirty flag.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save file |
| `Ctrl/Cmd + Shift + S` | Save as |
| `Ctrl/Cmd + Enter` | Manual compile |
| `Ctrl/Cmd + L` | Toggle log panel |

---

## Styling Notes

- Plain CSS (no Tailwind) in `src/renderer/styles/index.css`.
- Three themes via CSS custom properties: dark (default), light, high-contrast.
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
