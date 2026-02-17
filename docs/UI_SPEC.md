# TextEx — UI Specification

## Layout

The application uses a horizontal split-pane layout:

```
+----------------------------------------------------------+
|  Toolbar: [Open Ctrl+O] [Save Ctrl+S] [Compile] [Log]   |
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
    +-- SplitContainer
    |   +-- EditorPane
    |   +-- PreviewPane
    +-- LogPanel
    +-- StatusBar
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

### `Toolbar.tsx`
| Button | Action | Shortcut |
|---|---|---|
| Open | Calls `window.api.openFile()`, loads content into editor | `Ctrl/Cmd+O` |
| Save | Calls `window.api.saveFile(content, path)` | `Ctrl/Cmd+S` |
| Save As | Calls `window.api.saveFileAs(content)` | `Ctrl/Cmd+Shift+S` |
| Compile | Triggers manual compilation | `Ctrl/Cmd+Enter` |
| Toggle Log | Shows/hides the LogPanel | `Ctrl/Cmd+L` |

Each button displays its keyboard shortcut as a `<kbd>` element.

Displays the current file name (or "Untitled"). The dirty indicator is a yellow
dot next to the file name (replacing the previous `*` suffix). The Save button
highlights with a yellow background when the file is dirty.

### `EditorPane.tsx`
- Wraps `@monaco-editor/react`.
- Language: `latex` (Monaco built-in recognition).
- Theme: VS Code dark (default).
- `onChange` handler updates Zustand store and triggers debounced auto-compile.
- Cursor position tracked via `onDidChangeCursorPosition` (disposable stored
  in a ref and cleaned up on unmount).
- Config:
  - `wordWrap: 'on'`
  - `minimap: { enabled: false }` (save space)
  - `fontSize: 14`
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
- Displays stdout+stderr output from Tectonic, streamed in real time.
- Monospace font, dark background, 200px height.
- "Clear" button to reset log content. "Close" button to collapse.
- Auto-scrolls to bottom on new output.

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
- Dark theme by default (matches Monaco dark theme).
- Color palette:
  - Background: `#1e1e1e` (VS Code dark)
  - Editor gutter: `#252526`
  - Toolbar: `#333333`
  - Accent: `#007acc` (VS Code blue)
  - Error: `#f44747`
  - Success: `#6a9955`
  - Dirty indicator: `#cca700` (yellow dot + save button highlight)
  - Status bar: `#007acc` (blue bar with white text)
