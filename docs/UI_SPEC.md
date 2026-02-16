# NeuroTeX — UI Specification

## Layout

The application uses a horizontal split-pane layout:

```
┌──────────────────────────────────────────────────────────┐
│  Toolbar: [Open] [Save] [Compile] [Toggle Log]   file.tex │
├────────────────────────────┬─────────────────────────────┤
│                            │                             │
│                            │                             │
│     EditorPane             │      PreviewPane            │
│     (Monaco Editor)        │      (react-pdf)            │
│                            │                             │
│                            │                             │
│                            │                             │
│                            │                             │
├────────────────────────────┴─────────────────────────────┤
│  LogPanel (collapsible): compilation output / errors      │
├──────────────────────────────────────────────────────────┤
│  StatusBar: Ready | Compiling... | Error   line:col       │
└──────────────────────────────────────────────────────────┘
```

---

## Component Tree

```
App
├── Toolbar
├── SplitContainer
│   ├── EditorPane
│   └── PreviewPane
├── LogPanel
└── StatusBar
```

---

## Component Specifications

### `App.tsx`
- Root layout using CSS Grid or Flexbox.
- Manages the split ratio (default 50/50, draggable divider is a stretch goal).
- Mounts all top-level components.

### `Toolbar.tsx`
| Button | Action | Shortcut |
|---|---|---|
| Open | Calls `window.api.openFile()`, loads content into editor | `Ctrl/Cmd+O` |
| Save | Calls `window.api.saveFile(content, path)` | `Ctrl/Cmd+S` |
| Save As | Calls `window.api.saveFileAs(content)` | `Ctrl/Cmd+Shift+S` |
| Compile | Triggers manual compilation | `Ctrl/Cmd+Enter` |
| Toggle Log | Shows/hides the LogPanel | `Ctrl/Cmd+L` |

Displays the current file name (or "Untitled") and a dirty indicator (`*`).

### `EditorPane.tsx`
- Wraps `@monaco-editor/react`.
- Language: `latex` (Monaco does not have built-in LaTeX; register a basic
  TextMate grammar or use a community grammar).
- Theme: VS Code dark (default), with option to switch to light.
- `onChange` handler updates Zustand store and triggers debounced auto-compile.
- Config:
  - `wordWrap: 'on'`
  - `minimap: { enabled: false }` (save space)
  - `fontSize: 14`
  - `lineNumbers: 'on'`

### `PreviewPane.tsx`
- Wraps `react-pdf`'s `<Document>` and `<Page>` components.
- Accepts `pdfBase64` from the store; converts to a data URL or Blob for display.
- Features:
  - Scroll through pages continuously.
  - Zoom controls (+/- buttons or Ctrl+scroll).
  - **Preserve scroll position** on recompile (store `scrollTop` before update,
    restore after render).
- Loading state: spinner while compilation is in progress.
- Error state: "Compilation failed. Check the log panel."

### `LogPanel.tsx`
- Collapsible panel at the bottom (default: hidden).
- Auto-opens when a compilation error occurs.
- Displays stderr output from Tectonic, streamed in real time.
- Monospace font, dark background.
- "Clear" button to reset log content.
- Auto-scrolls to bottom on new output.

### `StatusBar.tsx`
- Fixed bar at the very bottom.
- Left side: compilation status indicator.
  - `Ready` (green dot)
  - `Compiling...` (yellow spinner)
  - `Error` (red dot)
- Right side: cursor position (`Ln X, Col Y`) from Monaco's `onDidChangeCursorPosition`.

---

## Zustand Store Shape

```typescript
interface AppState {
  // File
  filePath: string | null;
  content: string;
  isDirty: boolean;

  // Compilation
  compileStatus: 'idle' | 'compiling' | 'success' | 'error';
  pdfBase64: string | null;
  logs: string;

  // UI
  isLogPanelOpen: boolean;

  // Actions
  setContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setCompileStatus: (status: AppState['compileStatus']) => void;
  setPdfBase64: (data: string | null) => void;
  appendLog: (text: string) => void;
  clearLogs: () => void;
  toggleLogPanel: () => void;
}
```

---

## Auto-Compile Hook (`useAutoCompile.ts`)

```typescript
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useAutoCompile() {
  const content = useAppStore((s) => s.content);
  const filePath = useAppStore((s) => s.filePath);
  const setCompileStatus = useAppStore((s) => s.setCompileStatus);
  const setPdfBase64 = useAppStore((s) => s.setPdfBase64);
  const appendLog = useAppStore((s) => s.appendLog);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!filePath) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setCompileStatus('compiling');
      try {
        const result = await window.api.compile(filePath);
        setPdfBase64(result.pdfBase64);
        setCompileStatus('success');
      } catch (err: any) {
        appendLog(err.message);
        setCompileStatus('error');
      }
    }, 1000); // 1-second debounce

    return () => clearTimeout(timerRef.current);
  }, [content]);
}
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save file |
| `Ctrl/Cmd + Shift + S` | Save as |
| `Ctrl/Cmd + Enter` | Manual compile |
| `Ctrl/Cmd + L` | Toggle log panel |
| `Ctrl/Cmd + +` | Zoom in PDF |
| `Ctrl/Cmd + -` | Zoom out PDF |

---

## Styling Notes

- Use Tailwind CSS utility classes.
- Dark theme by default (matches Monaco dark theme).
- Color palette:
  - Background: `#1e1e1e` (VS Code dark)
  - Editor gutter: `#252526`
  - Toolbar: `#333333`
  - Accent: `#007acc` (VS Code blue)
  - Error: `#f44747`
  - Success: `#6a9955`
