# TextEx — System Architecture

## Overview

TextEx is a self-contained desktop LaTeX editor built on Electron. It provides a
split-pane interface (code left, PDF preview right) and bundles the Tectonic LaTeX
engine so users never need to install TeX Live, MiKTeX, or any other distribution.

---

## Process Model

Electron applications run two kinds of processes. TextEx uses them as follows:

### Main Process (Node.js)

Runs in a Node.js environment with full OS access.

| Responsibility | Detail |
|---|---|
| Window lifecycle | Create, resize, close the BrowserWindow |
| File I/O | Read/write `.tex` files via `fs` / `dialog` |
| Child process management | Spawn the bundled `tectonic` binary |
| IPC hub | Handle `invoke` / `send` messages from the renderer |

Security constraint: `nodeIntegration` is **disabled** in the renderer.
All renderer <-> main communication goes through a Context Bridge (preload script).

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

### CLI Process (Planned)

A standalone Node.js entry point (`src/cli/index.ts`) that reuses shared compiler
and pandoc logic without any Electron dependencies.

| Responsibility | Detail |
|---|---|
| Argument parsing | `commander` routes subcommands (compile, init, export, templates) |
| Compilation | Delegates to `src/shared/compiler.ts` (no `BrowserWindow`, no `app`) |
| File watching | `chokidar` for `--watch` mode |
| Export | Delegates to `src/shared/pandoc.ts` |

### MCP Server (Planned)

A stdio-based [Model Context Protocol](https://modelcontextprotocol.io/) server
(`src/mcp/server.ts`) that exposes TextEx compilation as AI-callable tools.

| Responsibility | Detail |
|---|---|
| Transport | stdio (stdin/stdout JSON-RPC) via `@modelcontextprotocol/sdk` |
| `compile_latex` tool | Accepts file path, returns `{ success, pdfPath?, error? }` |
| `get_compile_log` tool | Returns last compile's stdout/stderr |
| Compilation | Delegates to `src/shared/compiler.ts` |

---

## IPC Contract

All IPC channels and their payloads:

| Channel | Direction | Payload | Response |
|---|---|---|---|
| `fs:open` | Renderer -> Main | -- | `{ content: string, filePath: string }` |
| `fs:save` | Renderer -> Main | `{ content: string, filePath: string }` | `{ success: boolean }` |
| `fs:save-as` | Renderer -> Main | `{ content: string }` | `{ filePath: string }` |
| `latex:compile` | Renderer -> Main | `{ filePath: string }` | `{ pdfBase64: string }` or error |
| `latex:cancel` | Renderer -> Main | -- | `boolean` (true if a process was killed) |
| `latex:log` | Main -> Renderer | `string` (streamed stdout/stderr lines) | -- |

---

## Data Flow: Auto-Compile Loop

```
 User types in Monaco
        |
        v
 Debounce timer (1 000 ms idle)
        |
        v
 Auto-save file to disk
        |
        +-- Save fails --> Log error, abort compile
        |
        v
 Renderer sends `latex:compile` via IPC
        |
        v
 Main kills any active compile, spawns `tectonic -X compile <file>`
        |                                        |
        |                  +---------------------+
        |                  v                     v
        |           stdout/stderr           exit code / signal
        |           streamed to             checked
        |           `latex:log`
        |                                        |
        v                                        v
 On exit code 0:                          On non-zero exit:
  Read .pdf -> Base64 -> send              Send error + logs
  `latex:compile` result                   `latex:compile` rejection
        |                                        |
        v                                        v
 react-pdf re-renders                    Error panel shows output
 (preserves scroll position)             On signal (cancelled):
                                          Silently ignored
```

### CLI Compile (Planned)

```
 textex compile <file.tex>
        |
        v
 Resolve Tectonic binary (src/shared/compiler.ts)
   - No app.isPackaged — uses env var or CLI flag for dev/prod detection
        |
        v
 Spawn tectonic -X compile <file>
        |                       |
        v                       v
 stdout/stderr              exit code
 printed to terminal        0 = success, non-zero = error
 (unless --quiet)
        |
        v
 --watch? Re-run on file change (chokidar)
```

### MCP Compile (Planned)

```
 AI client sends JSON-RPC request
        |
        v
 MCP server (src/mcp/server.ts) receives tool call
        |
        +-- compile_latex: file path
        |       |
        |       v
        |   src/shared/compiler.ts — spawn Tectonic
        |       |
        |       v
        |   Return { success: true, pdfPath } or { success: false, error }
        |
        +-- get_compile_log:
                |
                v
            Return buffered stdout/stderr from last compile
```

---

## Security Model

1. **Renderer sandbox** -- `nodeIntegration: false`, `contextIsolation: true`.
2. **Preload Context Bridge** -- only the explicitly exposed API surface is
   available to renderer code. No raw `require('child_process')` access.
3. **IPC input validation** -- `validateFilePath()` in `ipc.ts` rejects
   non-string, empty, and relative file paths on `fs:save` and `latex:compile`
   handlers, preventing path traversal from the renderer.
4. **External URL restriction** -- `setWindowOpenHandler` in `main.ts` only
   allows `shell.openExternal` for `http:` and `https:` protocols, blocking
   `file:`, `javascript:`, and other potentially dangerous schemes.
5. **Listener management** -- The preload script tracks the current `latex:log`
   listener and removes the previous one before attaching a new one, preventing
   listener leaks.
6. **Binary integrity** -- Tectonic binary is shipped inside `extraResources`
   and is not user-writable at runtime on macOS/Linux (packaged app is
   read-only).
7. **Error boundary** -- A React `ErrorBoundary` component wraps the entire app
   to catch rendering errors and display a recovery UI.

---

## Platform Binary Resolution

```
isDev?
  +- yes -> <project-root>/resources/bin/<platformDir>/<binary>
  +- no  -> process.resourcesPath/bin/<binary>

process.platform
  +- win32  -> platformDir: win, binary: tectonic.exe
  +- darwin -> platformDir: mac, binary: tectonic
  +- linux  -> platformDir: linux, binary: tectonic
```

**CLI / MCP note (planned):** The shared compiler (`src/shared/compiler.ts`) needs
a third resolution mode that does not depend on `app.isPackaged` (which requires
Electron). The dev/prod flag will be passed in as a parameter or resolved from an
environment variable, allowing the same binary resolution logic to work in
Electron, CLI, and MCP contexts.
