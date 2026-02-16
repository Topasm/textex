# TextEx — File & Directory Structure

```
/textex (project root)
|
+-- docs/                          # Project documentation
|   +-- ARCHITECTURE.md            # System architecture & data flow
|   +-- TECH_STACK.md              # Technology choices & rationale
|   +-- FILE_STRUCTURE.md          # This file
|   +-- IPC_SPEC.md                # IPC channels, payloads, type definitions
|   +-- COMPILER_SERVICE.md        # Tectonic integration details
|   +-- UI_SPEC.md                 # Component layout & behavior
|   +-- PACKAGING.md               # Build & distribution config
|   +-- MVP_REQUIREMENTS.md        # Feature scope & acceptance criteria
|   +-- TODO.md                    # Implementation task list with phases
|
+-- resources/
|   +-- bin/                       # *** Tectonic binaries (per-platform) ***
|       +-- win/                   # (empty -- needs Windows binary)
|       |   +-- tectonic.exe
|       +-- mac/                   # (empty -- needs macOS binary)
|       |   +-- tectonic
|       +-- linux/
|           +-- tectonic           # v0.15.0 (musl, statically linked)
|
+-- src/
|   +-- main/                      # Electron Main process
|   |   +-- main.ts                # App entry: BrowserWindow creation, IPC init
|   |   +-- ipc.ts                 # IPC handler registration (fs + compile + cancel)
|   |   +-- compiler.ts            # Tectonic binary resolution, spawn, cancellation, PDF read
|   |
|   +-- preload/                   # Context Bridge
|   |   +-- index.ts               # exposeInMainWorld: openFile, saveFile, compile, etc.
|   |
|   +-- renderer/                  # React application
|       +-- index.html             # Vite HTML entry (with CSP headers)
|       +-- main.tsx               # React root mount (wraps App in ErrorBoundary)
|       +-- App.tsx                # Top-level layout, keyboard shortcuts, compile logic
|       +-- components/
|       |   +-- EditorPane.tsx     # Monaco Editor wrapper (LaTeX, vs-dark theme)
|       |   +-- PreviewPane.tsx    # react-pdf viewer (Base64 -> Uint8Array -> PDF.js)
|       |   +-- Toolbar.tsx        # File actions + compile button + keyboard hints
|       |   +-- LogPanel.tsx       # Collapsible compilation output (stdout+stderr)
|       |   +-- StatusBar.tsx      # Compile status dot + cursor position
|       |   +-- ErrorBoundary.tsx  # React error boundary with reload UI
|       +-- store/
|       |   +-- useAppStore.ts     # Zustand store (file, compile, UI state)
|       +-- hooks/
|       |   +-- useAutoCompile.ts  # 1s debounced auto-compile on content change
|       |   +-- useFileOps.ts      # Open / save / save-as wrappers
|       +-- types/
|       |   +-- api.d.ts           # Type declarations for window.api (ElectronAPI)
|       +-- styles/
|           +-- index.css          # Plain CSS -- VS Code dark theme, flexbox layout
|
|   +-- cli/                         # CLI entry point (planned)
|   |   +-- index.ts                 # commander setup, command routing
|   |   +-- commands/
|   |       +-- compile.ts           # textex compile <file.tex>
|   |       +-- init.ts              # textex init [template]
|   |       +-- export.ts            # textex export <file.tex> --format <fmt>
|   |       +-- templates.ts         # textex templates
|   |
|   +-- mcp/                         # MCP server (planned)
|   |   +-- server.ts                # stdio MCP server, tool definitions
|   |
|   +-- shared/                      # Shared logic, no Electron deps (planned)
|       +-- compiler.ts              # Tectonic binary resolution + spawn
|       +-- pandoc.ts                # Pandoc export
|
+-- out/                           # Build output (gitignored)
|   +-- main/index.js              # Compiled main process
|   +-- preload/index.js           # Compiled preload script
|   +-- renderer/                  # Compiled React app + assets
|
+-- electron.vite.config.ts        # electron-vite config (main, preload, renderer)
+-- electron-builder.yml           # Packaging config (extraResources, targets)
+-- package.json
+-- tsconfig.json                  # References tsconfig.node.json + tsconfig.web.json
+-- tsconfig.node.json             # Main + preload (Node target, ESNext)
+-- tsconfig.web.json              # Renderer (DOM + JSX, ESNext)
+-- CLAUDE.md                      # Claude Code guidance
+-- .gitignore
+-- README.md
```

## Key Conventions

- **`resources/bin/`** -- Platform binaries are organized into `win/`, `mac/`, `linux/`
  sub-folders. `electron-builder` copies the correct folder at package time via
  `extraResources` with `${os}` interpolation.

- **`src/main/`** -- Pure Node.js / Electron code. No DOM, no React. Built as SSR
  environment by electron-vite.

- **`src/preload/`** -- Runs in a special context with access to both `ipcRenderer`
  and a limited DOM environment. Must not import React or renderer code.

- **`src/renderer/`** -- Standard Vite + React app. Cannot access Node.js APIs
  directly; must go through `window.api` (defined by the preload script).

- **`store/`** -- Single Zustand store. If the store grows large, split into
  slices (e.g., `createFileSlice`, `createCompilerSlice`).

- **`src/cli/`** (planned) -- Standalone CLI entry point. Uses `commander` for
  arg parsing. Imports only from `src/shared/`, never from `src/main/` or
  `src/renderer/`. No Electron dependencies.

- **`src/mcp/`** (planned) -- MCP server entry point. Uses
  `@modelcontextprotocol/sdk` with stdio transport. Imports only from
  `src/shared/`.

- **`src/shared/`** (planned) -- Pure Node.js logic extracted from `src/main/`.
  No Electron imports (`app`, `BrowserWindow`, `ipcMain`). Shared by
  `src/main/`, `src/cli/`, and `src/mcp/`.

## Deviations from Original Plan

- **No Tailwind CSS** -- Tailwind v4 changed its PostCSS plugin to a separate
  `@tailwindcss/postcss` package with breaking config changes. Plain CSS with
  VS Code dark theme colors is used instead. All styling is in `index.css`.

- **No `vite.config.ts`** -- Replaced by `electron.vite.config.ts` which handles
  all three build targets (main, preload, renderer) in one config.

- **`tsconfig.web.json`** added -- Separate TypeScript config for the renderer
  (with DOM lib and JSX support), referenced from the root `tsconfig.json`.
