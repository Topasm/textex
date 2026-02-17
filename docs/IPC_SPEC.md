# TextEx — IPC Specification

## Overview

All communication between the Renderer (React) and Main (Node.js) processes uses
Electron's IPC mechanism. `nodeIntegration` is disabled; the preload script exposes
a strictly typed API via `contextBridge.exposeInMainWorld`.

---

## Preload API Surface

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

let compileLogHandler: ((_event: IpcRendererEvent, log: string) => void) | null = null

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('fs:open'),
  saveFile: (content: string, filePath: string) =>
    ipcRenderer.invoke('fs:save', content, filePath),
  saveFileAs: (content: string) => ipcRenderer.invoke('fs:save-as', content),
  compile: (filePath: string) => ipcRenderer.invoke('latex:compile', filePath),
  onCompileLog: (cb: (log: string) => void) => {
    if (compileLogHandler) {
      ipcRenderer.removeListener('latex:log', compileLogHandler)
    }
    compileLogHandler = (_event: IpcRendererEvent, log: string) => cb(log)
    ipcRenderer.on('latex:log', compileLogHandler)
  },
  removeCompileLogListener: () => {
    if (compileLogHandler) {
      ipcRenderer.removeListener('latex:log', compileLogHandler)
      compileLogHandler = null
    }
  }
})
```

**Note:** The preload script tracks a single `compileLogHandler` reference and
removes the previous listener before attaching a new one. This prevents listener
leaks when `onCompileLog` is called multiple times (e.g., across React strict
mode re-renders).

---

## Channel Reference

### `fs:open`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | -- (none; Main opens a native file dialog) |
| Response | `{ content: string, filePath: string }` |
| Errors | User cancels dialog -> returns `null` |

**Main handler logic:**
1. Show `dialog.showOpenDialog` with filter `*.tex`.
2. Read selected file with `fs.promises.readFile(path, 'utf-8')`.
3. Return content and path.

---

### `fs:save`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Request payload | `(content: string, filePath: string)` |
| Response | `{ success: boolean }` |
| Errors | Invalid path -> throw. Write failure -> throw. |

**Main handler logic:**
1. Validate `filePath` via `validateFilePath()` (must be non-empty absolute path).
2. Write `content` to `filePath` with `fs.promises.writeFile`.

---

### `fs:save-as`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Request payload | `(content: string)` |
| Response | `{ filePath: string }` |
| Errors | User cancels -> returns `null` |

**Main handler logic:**
1. Show `dialog.showSaveDialog` with default extension `.tex`.
2. Write `content` to chosen path.
3. Return the new path.

---

### `latex:compile`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Request payload | `(filePath: string)` |
| Response | `{ pdfBase64: string }` |
| Errors | Invalid path -> throw. Non-zero exit code -> reject with combined stdout+stderr logs. Signal (cancelled) -> reject with "Compilation was cancelled". |

**Main handler logic:**
1. Validate `filePath` via `validateFilePath()` (must be non-empty absolute path).
2. Resolve tectonic binary path (see `compiler.ts`).
3. Verify binary exists with `fs.access`.
4. Kill any running compilation via `cancelCompilation()`.
5. Spawn `tectonic -X compile <filePath>`.
6. Stream both `stdout` and `stderr` lines to renderer via `latex:log` channel.
7. On exit code 0: read `.pdf`, convert to Base64, resolve.
8. On signal (killed): reject with cancellation message.
9. On non-zero exit: reject with accumulated output.

---

### `latex:cancel`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | -- (none) |
| Response | `boolean` (true if a running process was killed) |

**Main handler logic:**
1. If `activeProcess` exists, kill it and return `true`.
2. Otherwise return `false`.

---

### `latex:log`

| Field | Value |
|---|---|
| Direction | Main -> Renderer |
| Method | `webContents.send` |
| Payload | `string` (one or more stdout/stderr lines) |

This channel streams compilation output in real time so the LogPanel can display
progress during long compilations. Both stdout and stderr are sent through this
channel.

---

---

### `lsp:start`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | `(workspaceRoot: string)` |
| Response | `{ success: boolean }` |

**Main handler logic:**
1. Validate `workspaceRoot` via `validateFilePath()`.
2. Call `texLabManager.start()` with callbacks for message and status forwarding.
3. TexLab process spawns with `stdio: ['pipe', 'pipe', 'pipe']`, cwd = workspace root.
4. Messages from TexLab stdout are parsed (Content-Length header protocol) and forwarded via `lsp:message`.
5. Status changes are forwarded via `lsp:status-change`.

---

### `lsp:stop`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | -- (none) |
| Response | `{ success: boolean }` |

**Main handler logic:**
1. Call `texLabManager.stop()` — kills the TexLab child process.

---

### `lsp:send`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | `(message: object)` — a JSON-RPC message |
| Response | `{ success: boolean }` |

**Main handler logic:**
1. Serialize `message` to JSON, prepend `Content-Length` header, write to TexLab stdin.

---

### `lsp:status`

| Field | Value |
|---|---|
| Direction | Renderer -> Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | -- (none) |
| Response | `{ status: 'stopped' \| 'starting' \| 'running' \| 'error' }` |

---

### `lsp:message`

| Field | Value |
|---|---|
| Direction | Main -> Renderer |
| Method | `webContents.send` |
| Payload | `object` (JSON-RPC response or notification from TexLab) |

This channel forwards parsed LSP messages from the TexLab process to the renderer's
LSP client, which routes them to Monaco providers (diagnostics, completions, etc.).

---

### `lsp:status-change`

| Field | Value |
|---|---|
| Direction | Main -> Renderer |
| Method | `webContents.send` |
| Payload | `(status: string, error?: string)` |

Pushed when TexLab process status changes (starting, running, error, stopped).
The renderer updates the StatusBar LSP indicator accordingly.

---

## Type Declarations (Renderer Side)

```typescript
// src/renderer/types/api.d.ts

interface OpenFileResult {
  content: string
  filePath: string
}

interface SaveResult {
  success: boolean
}

interface SaveAsResult {
  filePath: string
}

interface CompileResult {
  pdfBase64: string
}

interface ElectronAPI {
  openFile(): Promise<OpenFileResult | null>
  saveFile(content: string, filePath: string): Promise<SaveResult>
  saveFileAs(content: string): Promise<SaveAsResult | null>
  compile(filePath: string): Promise<CompileResult>
  onCompileLog(cb: (log: string) => void): void
  removeCompileLogListener(): void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
```
