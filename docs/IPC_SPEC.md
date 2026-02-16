# NeuroTeX — IPC Specification

## Overview

All communication between the Renderer (React) and Main (Node.js) processes uses
Electron's IPC mechanism. `nodeIntegration` is disabled; the preload script exposes
a strictly typed API via `contextBridge.exposeInMainWorld`.

---

## Preload API Surface

```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('api', {
  // File operations
  openFile:    ()                                  => ipcRenderer.invoke('fs:open'),
  saveFile:    (content: string, filePath: string) => ipcRenderer.invoke('fs:save', content, filePath),
  saveFileAs:  (content: string)                   => ipcRenderer.invoke('fs:save-as', content),

  // Compilation
  compile:     (filePath: string)                  => ipcRenderer.invoke('latex:compile', filePath),

  // Event listeners (Main → Renderer)
  onCompileLog: (cb: (log: string) => void)        => ipcRenderer.on('latex:log', (_event, log) => cb(log)),
  removeCompileLogListener: ()                      => ipcRenderer.removeAllListeners('latex:log'),
});
```

---

## Channel Reference

### `fs:open`

| Field | Value |
|---|---|
| Direction | Renderer → Main |
| Method | `ipcRenderer.invoke` / `ipcMain.handle` |
| Request payload | — (none; Main opens a native file dialog) |
| Response | `{ content: string, filePath: string }` |
| Errors | User cancels dialog → returns `null` |

**Main handler logic:**
1. Show `dialog.showOpenDialog` with filter `*.tex`.
2. Read selected file with `fs.promises.readFile(path, 'utf-8')`.
3. Return content and path.

---

### `fs:save`

| Field | Value |
|---|---|
| Direction | Renderer → Main |
| Request payload | `(content: string, filePath: string)` |
| Response | `{ success: boolean }` |
| Errors | Write failure → throw |

**Main handler logic:**
1. Write `content` to `filePath` with `fs.promises.writeFile`.

---

### `fs:save-as`

| Field | Value |
|---|---|
| Direction | Renderer → Main |
| Request payload | `(content: string)` |
| Response | `{ filePath: string }` |
| Errors | User cancels → returns `null` |

**Main handler logic:**
1. Show `dialog.showSaveDialog` with default extension `.tex`.
2. Write `content` to chosen path.
3. Return the new path.

---

### `latex:compile`

| Field | Value |
|---|---|
| Direction | Renderer → Main |
| Request payload | `(filePath: string)` |
| Response | `{ pdfBase64: string }` |
| Errors | Non-zero exit code → reject with stderr logs |

**Main handler logic:**
1. Resolve tectonic binary path (see `compiler.ts`).
2. Spawn `tectonic -X compile <filePath>`.
3. Stream `stderr` lines to renderer via `latex:log` channel.
4. On exit code 0: read `.pdf`, convert to Base64, resolve.
5. On non-zero exit: reject with accumulated stderr.

---

### `latex:log`

| Field | Value |
|---|---|
| Direction | Main → Renderer |
| Method | `webContents.send` |
| Payload | `string` (one or more stderr lines) |

This channel streams compilation output in real time so the LogPanel can display
progress during long compilations.

---

## Type Declarations (Renderer Side)

```typescript
// src/renderer/types/api.d.ts

interface OpenFileResult {
  content: string;
  filePath: string;
}

interface SaveResult {
  success: boolean;
}

interface SaveAsResult {
  filePath: string;
}

interface CompileResult {
  pdfBase64: string;
}

interface ElectronAPI {
  openFile():                                  Promise<OpenFileResult | null>;
  saveFile(content: string, filePath: string): Promise<SaveResult>;
  saveFileAs(content: string):                 Promise<SaveAsResult | null>;
  compile(filePath: string):                   Promise<CompileResult>;
  onCompileLog(cb: (log: string) => void):     void;
  removeCompileLogListener():                  void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {}
```
