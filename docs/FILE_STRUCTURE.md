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
|   +-- bin/                       # *** Sidecar binaries (per-platform) ***
|   |   +-- win/
|   |   |   +-- tectonic.exe       # Tectonic LaTeX compiler
|   |   |   +-- texlab.exe         # TexLab language server (GPL-3.0)
|   |   +-- mac/
|   |   |   +-- tectonic
|   |   |   +-- texlab
|   |   +-- linux/
|   |       +-- tectonic
|   |       +-- texlab
|   +-- licenses/                  # Third-party license files
|   |   +-- TEXLAB-GPL-3.0.txt    # Full GPL-3.0 license text
|   |   +-- TEXLAB-NOTICE.txt     # Attribution & aggregate notice
|   +-- dictionaries/             # Spell check dictionaries
|   +-- data/packages/            # LaTeX package metadata (macros, envs)
|
+-- src/
|   +-- main/                      # Electron Main process
|   |   +-- main.ts                # App entry: BrowserWindow creation, IPC init
|   |   +-- ipc.ts                 # IPC handler registration (fs, compile, lsp, etc.)
|   |   +-- compiler.ts            # Tectonic binary resolution, spawn, cancellation, PDF read
|   |   +-- texlab.ts              # TexLab process manager (singleton, stdio LSP, auto-restart)
|   |   +-- settings.ts            # User settings (theme, font, lspEnabled, texlabPath, etc.)
|   |   +-- bibparser.ts           # BibTeX file parsing
|   |   +-- spellcheck.ts          # Dictionary-based spell checking
|   |   +-- git.ts                 # Git CLI wrapper
|   |   +-- pandoc.ts              # Pandoc export
|   |   +-- synctex.ts             # SyncTeX forward/inverse navigation
|   |   +-- logparser.ts           # LaTeX compile log parsing
|   |   +-- labelscanner.ts        # \label{} extraction from project
|   |   +-- packageloader.ts       # LaTeX package data loading
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
|       |   +-- SettingsModal.tsx  # Tabbed settings (General/Appearance/Editor/Integrations/Automation)
|       |   +-- ErrorBoundary.tsx  # React error boundary with reload UI
|       +-- lsp/                   # Language Server Protocol client
|       |   +-- lspClient.ts       # LSP client (initialize, providers, notifications)
|       |   +-- ipcTransport.ts    # vscode-jsonrpc MessageReader/Writer over IPC
|       +-- store/
|       |   +-- useAppStore.ts     # Zustand store (file, compile, lsp, UI state)
|       +-- hooks/
|       |   +-- useAutoCompile.ts  # 1s debounced auto-compile on content change
|       |   +-- useFileOps.ts      # Open / save / save-as wrappers
|       |   +-- editor/
|       |       +-- useEditorDiagnostics.ts  # Monaco marker integration
|       |       +-- usePendingJump.ts        # Jump to line + flash animation
|       |       +-- useClickNavigation.ts    # Ctrl+Click navigation
|       |       +-- useCompletion.ts         # Monaco completion providers
|       |       +-- useSpelling.ts           # Spell check integration
|       |       +-- useDocumentSymbols.ts    # LSP symbols request
|       |       +-- usePackageDetection.ts   # Package extraction
|       +-- providers/
|       |   +-- hoverProvider.ts   # Math preview (KaTeX) & citation hover
|       +-- data/
|       |   +-- snippets.ts        # ~50 LaTeX snippets for completion
|       |   +-- environments.ts    # LaTeX environments list
|       |   +-- templates.ts       # Document templates
|       +-- types/
|       |   +-- api.d.ts           # Type declarations for window.api (ElectronAPI)
|       +-- styles/
|           +-- index.css          # Plain CSS -- theme variables, flexbox layout,
|                                  #   modal classes, settings-* component styles
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
|   +-- __tests__/                   # Unit tests (Vitest)
|   |   +-- shared/
|   |   |   +-- structure.test.ts
|   |   |   +-- magicComments.test.ts
|   |   +-- store/
|   |   |   +-- useAppStore.test.ts
|   |   +-- components/
|   |       +-- StatusBar.test.tsx
|   |       +-- Toolbar.test.tsx
|   |
|   +-- shared/                      # Shared logic, no Electron deps
|       +-- compiler.ts              # Tectonic binary resolution + spawn
|       +-- pandoc.ts                # Pandoc export
|       +-- magicComments.ts         # %! TeX root magic comment parser
|       +-- bibparser.ts             # BibTeX file parsing
|       +-- structure.ts             # Document structure analysis
|       +-- templates.ts             # Template management
|       +-- types.ts                 # Shared type definitions
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

- **`src/shared/`** -- Pure Node.js logic with no Electron imports
  (`app`, `BrowserWindow`, `ipcMain`). Shared by `src/main/`, `src/cli/`,
  and `src/mcp/`. Contains compiler, pandoc, bibparser, magic comments,
  document structure, templates, and shared types.

## Deviations from Original Plan

- **No Tailwind CSS** -- Tailwind v4 changed its PostCSS plugin to a separate
  `@tailwindcss/postcss` package with breaking config changes. Plain CSS with
  VS Code dark theme colors is used instead. All styling is in `index.css`.

- **No `vite.config.ts`** -- Replaced by `electron.vite.config.ts` which handles
  all three build targets (main, preload, renderer) in one config.

- **`tsconfig.web.json`** added -- Separate TypeScript config for the renderer
  (with DOM lib and JSX support), referenced from the root `tsconfig.json`.
