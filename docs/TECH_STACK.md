# TextEx — Technology Stack

## Core Dependencies (Installed)

| Layer | Package | Version | Role |
|---|---|---|---|
| Runtime | **Tauri** | 2.11.5 | Default desktop shell (Rust + system WebView) |
| Legacy Runtime | **Electron** | 41.10.6 | Temporary feature-parity and public-release fallback |
| Native Core | **Rust / Tokio** | 1.97.1 / 1.53.1 | Filesystem, settings, watcher, Git, Tectonic, and updater services |
| Tooling | **electron-vite** | 5.0.0 | Build / HMR for main, preload, renderer |
| Bundler | **Vite** | 7.3.6 | Fast dev builds + production bundling |
| Language | **TypeScript** | 6.0.3 | Type safety across all processes |
| UI | **React** | 19.2.8 | Component model (functional + hooks) |
| Editor | **@monaco-editor/react** | 4.7.0 | VS Code editor engine, LaTeX mode |
| PDF | **react-pdf** | 10.4.1 | PDF display (wraps PDF.js) |
| PDF Engine | **pdfjs-dist** | 6.2.108 | PDF rendering engine (Web Worker) |
| State | **Zustand** | 5.0.15 | Global state management |
| Styling | **Plain CSS** | -- | VS Code dark theme, flexbox layout |
| LaTeX | **Tectonic** | 0.17.0 | Compilation (sidecar binary) |
| LSP | **TexLab** | 5.25.1 | LaTeX language server (GPL-3.0, separate process) |
| Packaging | **Tauri CLI** | 2.11.4 | Default installers (NSIS / DMG / DEB / AppImage) |
| Legacy Packaging | **electron-builder** | 26.15.3 | Current public-release fallback |
| CLI | **commander** | 14.0.3 | CLI argument parsing |
| File Watch | **chokidar** | 5.0.0 | File watching for CLI `--watch` mode |
| MCP | **@modelcontextprotocol/sdk** | 1.30.0 | MCP server framework (stdio transport) |
| Spell Check | **nspell** | 2.1.5 | Dictionary-based spell checking |
| Git | **system Git** | -- | Rust-managed CLI with project-root/pathspec validation |
| Math | **katex** | 0.16.47 | Math formula rendering for hover preview |
| Validation | **zod** | 4.4.3 | Runtime schema validation |
| Auto-update | **tauri-plugin-updater** | 2.10.1 | Rust-owned signed update check/install path |
| Legacy Auto-update | **electron-updater** | 6.8.9 | Current public Electron release updater |

## Dev Dependencies (Installed)

| Package | Version | Purpose |
|---|---|---|
| `@vitejs/plugin-react` | 5.2.0 | React fast refresh for Vite |
| `@types/react` | 19.2.18 | TypeScript types for React |
| `@types/react-dom` | 19.2.4 | TypeScript types for ReactDOM |
| `eslint` | 9.39.5 | Linting |
| `prettier` | 3.9.6 | Code formatting |
| `vitest` | 4.1.11 | Unit testing framework |
| `@testing-library/react` | 16.3.2 | React component testing |
| `jsdom` | 29.1.1 | DOM environment for tests |

## Version Constraints

- Node.js: >= 22.13
- Tectonic: 0.17.0

## Why These Choices

### Tectonic over TeX Live
- Single ~10 MB binary (musl) vs. multi-GB installation.
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
- Monaco remains the TextEx 2.0 migration engine. CodeMirror 6 is considered only after the
  runtime-neutral adapter and the reproducible A/B gate in
  [EDITOR_ARCHITECTURE.md](EDITOR_ARCHITECTURE.md) are complete.

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
