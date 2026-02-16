# NeuroTeX — System Architecture

## Overview

NeuroTeX is a self-contained desktop LaTeX editor built on Electron. It provides a
split-pane interface (code left, PDF preview right) and bundles the Tectonic LaTeX
engine so users never need to install TeX Live, MiKTeX, or any other distribution.

---

## Process Model

Electron applications run two kinds of processes. NeuroTeX uses them as follows:

### Main Process (Node.js)

Runs in a Node.js environment with full OS access.

| Responsibility | Detail |
|---|---|
| Window lifecycle | Create, resize, close the BrowserWindow |
| File I/O | Read/write `.tex` files via `fs` / `dialog` |
| Child process management | Spawn the bundled `tectonic` binary |
| IPC hub | Handle `invoke` / `send` messages from the renderer |

Security constraint: `nodeIntegration` is **disabled** in the renderer.
All renderer ↔ main communication goes through a Context Bridge (preload script).

### Renderer Process (Chromium + React)

Runs inside a sandboxed Chromium tab.

| Responsibility | Detail |
|---|---|
| UI | React component tree rendered with Vite HMR |
| Code editing | Monaco Editor (`@monaco-editor/react`) |
| PDF display | `react-pdf` (PDF.js wrapper) |
| State | Zustand store: file path, dirty flag, compile status, logs |

### Sidecar Binary (Tectonic)

- Rust-compiled, single executable.
- Stored in `resources/bin/{platform}`.
- On first compile, Tectonic downloads any missing LaTeX packages to a local
  cache (`~/.cache/Tectonic` on Linux/macOS, `%LOCALAPPDATA%\Tectonic` on Windows).
- After the initial cache is populated, compilation works fully offline.

---

## IPC Contract

All IPC channels and their payloads:

| Channel | Direction | Payload | Response |
|---|---|---|---|
| `fs:open` | Renderer → Main | — | `{ content: string, filePath: string }` |
| `fs:save` | Renderer → Main | `{ content: string, filePath: string }` | `{ success: boolean }` |
| `fs:save-as` | Renderer → Main | `{ content: string }` | `{ filePath: string }` |
| `latex:compile` | Renderer → Main | `{ filePath: string }` | `{ pdfBase64: string }` or error |
| `latex:log` | Main → Renderer | `string` (streamed stderr lines) | — |

---

## Data Flow: Auto-Compile Loop

```
 User types in Monaco
        │
        ▼
 Debounce timer (1 000 ms idle)
        │
        ▼
 Renderer sends `latex:compile` via IPC
        │
        ▼
 Main writes buffer to temp .tex   ──►  Spawns `tectonic -X compile <file>`
        │                                        │
        │                  ┌──────────────────────┤
        │                  ▼                      ▼
        │           stdout/stderr            exit code
        │           streamed to              checked
        │           `latex:log`
        │                                        │
        ▼                                        ▼
 On exit code 0:                          On exit code ≠ 0:
  Read .pdf → Base64 → send               Send error + logs
  `latex:compile` result                   `latex:compile` rejection
        │                                        │
        ▼                                        ▼
 react-pdf re-renders blob              Error panel shows stderr
 (preserves scroll position)
```

---

## Security Model

1. **Renderer sandbox** — `nodeIntegration: false`, `contextIsolation: true`.
2. **Preload Context Bridge** — only the explicitly exposed API surface is
   available to renderer code. No raw `require('child_process')` access.
3. **CSP** — Content-Security-Policy header restricts inline scripts and
   external resource loading.
4. **Binary integrity** — Tectonic binary is shipped inside `extraResources`
   and is not user-writable at runtime on macOS/Linux (packaged app is
   read-only).

---

## Platform Binary Resolution

```
isDev?
  ├─ yes → <project-root>/resources/bin/<binary>
  └─ no  → process.resourcesPath/bin/<binary>

process.platform
  ├─ win32  → win/tectonic.exe
  ├─ darwin → mac/tectonic
  └─ linux  → linux/tectonic
```
