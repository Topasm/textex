# TextEx — Technology Stack

## Core Dependencies (Installed)

| Layer | Package | Version | Role |
|---|---|---|---|
| Runtime | **Electron** | 40.4.1 | Desktop shell (Chromium + Node.js) |
| Tooling | **electron-vite** | 5.0.0 | Build / HMR for main, preload, renderer |
| Bundler | **Vite** | 7.3.1 | Fast dev builds + production bundling |
| Language | **TypeScript** | 5.9.3 | Type safety across all processes |
| UI | **React** | 19.2.4 | Component model (functional + hooks) |
| Editor | **@monaco-editor/react** | 4.7.0 | VS Code editor engine, LaTeX mode |
| PDF | **react-pdf** | 10.3.0 | PDF display (wraps PDF.js) |
| PDF Engine | **pdfjs-dist** | 5.4.296 | PDF rendering engine (Web Worker) |
| State | **Zustand** | 5.0.11 | Global state management |
| Styling | **Plain CSS** | -- | VS Code dark theme, flexbox layout |
| LaTeX | **Tectonic** | latest | Compilation (sidecar binary) |
| LSP | **TexLab** | latest | LaTeX language server (GPL-3.0, separate process) |
| LSP Transport | **vscode-jsonrpc** | latest | JSON-RPC message types for LSP IPC bridge |
| Packaging | **electron-builder** | 26.7.0 | Installers (NSIS / DMG / AppImage) |
| CLI | **commander** | 14.0.3 | CLI argument parsing |
| File Watch | **chokidar** | 5.0.0 | File watching for CLI `--watch` mode |
| MCP | **@modelcontextprotocol/sdk** | 1.26.0 | MCP server framework (stdio transport) |
| Spell Check | **nspell** | 2.1.5 | Dictionary-based spell checking |
| Git | **simple-git** | 3.27.0 | Git CLI wrapper |
| Math | **katex** | 0.16.28 | Math formula rendering for hover preview |
| Validation | **zod** | 4.3.6 | Runtime schema validation |
| Auto-update | **electron-updater** | 6.3.9 | GitHub-based auto-update |

## Dev Dependencies (Installed)

| Package | Version | Purpose |
|---|---|---|
| `@vitejs/plugin-react` | 5.1.4 | React fast refresh for Vite |
| `@types/react` | 19.2.14 | TypeScript types for React |
| `@types/react-dom` | 19.2.3 | TypeScript types for ReactDOM |
| `eslint` | 9.28.0 | Linting |
| `prettier` | 3.5.3 | Code formatting |
| `vitest` | 4.0.18 | Unit testing framework |
| `@testing-library/react` | 16.3.2 | React component testing |
| `jsdom` | 28.1.0 | DOM environment for tests |

## Version Constraints

- Node.js: >= 18 (v20.20.0 used in development, installed via nvm)
- Tectonic: 0.15.0 (musl variant for Linux compatibility)

## Why These Choices

### Tectonic over TeX Live
- Single ~14 MB binary (musl) vs. multi-GB installation.
- Auto-downloads only needed packages on first use.
- Deterministic builds (pinned bundle versions).
- **Note:** The glibc variant required GLIBC_2.35 which was not available
  on the build server. The musl variant is statically linked and portable.

### TexLab over Custom-Only Intelligence
- Full LSP implementation: diagnostics, completions, hover, definition, rename,
  formatting, and document symbols — without requiring a full compile cycle.
- Runs as a separate process via stdio, preserving TextEx's MIT license.
- Coexists with custom providers (snippets, cite, ref, env, math hover) —
  Monaco merges suggestions from all providers naturally.

### Monaco over CodeMirror
- Identical editing experience to VS Code.
- Built-in language service infrastructure; now used with TexLab LSP integration.
- Rich API for decorations, markers, and diagnostics.

### Zustand over Redux / Context
- < 1 kB, zero boilerplate.
- No providers needed in the component tree.
- Works outside React (useful for IPC callbacks via `getState()`).

### react-pdf over iframe / embed
- Programmatic page navigation and zoom.
- Scroll-position preservation across re-renders.
- No reliance on browser's native PDF plugin.

### Plain CSS over Tailwind CSS
- Tailwind CSS v4 introduced breaking changes -- the PostCSS plugin moved
  to `@tailwindcss/postcss` and the v3 `@tailwind` directives are removed.
- Plain CSS with VS Code color tokens keeps the styling simple and
  dependency-free, matching the editor's dark theme natively.
