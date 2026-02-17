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

### Sidecar Binary: Tectonic (LaTeX Compiler)

- Rust-compiled, single executable.
- Stored in `resources/bin/{platform}`.
- On first compile, Tectonic downloads any missing LaTeX packages to a local
  cache (`~/.cache/Tectonic` on Linux/macOS, `%LOCALAPPDATA%\Tectonic` on Windows).
- After the initial cache is populated, compilation works fully offline.

### Sidecar Binary: TexLab (Language Server)

- Rust-compiled LaTeX language server implementing the Language Server Protocol.
- **License:** GPL-3.0 — runs as a **separate process** communicating solely via
  the standardized LSP protocol over stdio. This is an "aggregate" distribution;
  TexLab's GPL does not apply to TextEx (MIT).
- Stored in `resources/bin/{platform}` alongside Tectonic.
- Provides: real-time diagnostics, completions, hover documentation, go-to-definition,
  document symbols/outline, formatting, rename, and **code folding** across files.
- Managed by `TexLabManager` singleton (`src/main/texlab.ts`) with auto-restart
  (up to 3 retries with backoff).
- Users can override the bundled binary via the `texlabPath` setting.
- GPL license text and attribution bundled in `resources/licenses/`.

**IPC flow for LSP:**
```
Renderer (Monaco + LSP client)
    ↕ window.api.lsp*  (contextBridge)
Main Process (TexLabManager)
    ↕ stdio (Content-Length headers)
TexLab child process
```

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
| `latex:diagnostics` | Main -> Renderer | `Diagnostic[]` (parsed log diagnostics) | -- |
| `lsp:start` | Renderer -> Main | `{ workspaceRoot: string }` | `{ success: boolean }` |
| `lsp:stop` | Renderer -> Main | -- | `{ success: boolean }` |
| `lsp:send` | Renderer -> Main | `object` (JSON-RPC message) | `{ success: boolean }` |
| `lsp:status` | Renderer -> Main | -- | `{ status: string }` |
| `lsp:message` | Main -> Renderer | `object` (JSON-RPC response/notification) | -- |
| `lsp:status-change` | Main -> Renderer | `(status: string, error?: string)` | -- |

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
 Main reads file, resolves magic comment (%! TeX root = ...)
        |
        v
 Main kills any active compile, spawns `tectonic -X compile <rootFile>`
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
6. **Binary integrity** -- Tectonic and TexLab binaries are shipped inside
   `extraResources` and are not user-writable at runtime on macOS/Linux
   (packaged app is read-only).
7. **Error boundary** -- A React `ErrorBoundary` component wraps the entire app
   to catch rendering errors and display a recovery UI.
8. **LSP isolation** -- TexLab runs as a separate child process communicating
   via stdio. No network ports are opened. The LSP client gracefully degrades
   if TexLab is unavailable.

---

## Platform Binary Resolution

```
isDev?
  +- yes -> <project-root>/resources/bin/<platformDir>/<binary>
  +- no  -> process.resourcesPath/bin/<binary>

process.platform
  +- win32  -> platformDir: win, binary: tectonic.exe / texlab.exe
  +- darwin -> platformDir: mac, binary: tectonic / texlab
  +- linux  -> platformDir: linux, binary: tectonic / texlab
```

**TexLab resolution order:**
1. Custom user path (`texlabPath` setting)
2. Bundled binary (`resources/bin/{platform}/texlab`)
3. Fallback to system PATH (`texlab`)

**CLI / MCP note:** The shared compiler (`src/shared/compiler.ts`) uses a
parameterized dev/prod detection via `isDev`/`resourcesPath`/`devBasePath`
options, allowing the same binary resolution logic to work in Electron, CLI,
and MCP contexts.
