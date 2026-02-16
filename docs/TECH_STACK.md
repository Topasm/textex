# NeuroTeX — Technology Stack

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
| PDF Engine | **pdfjs-dist** | 5.4.624 | PDF rendering engine (Web Worker) |
| State | **Zustand** | 5.0.11 | Global state management |
| Styling | **Plain CSS** | — | VS Code dark theme, flexbox layout |
| LaTeX | **Tectonic** | 0.15.0 | Compilation (sidecar binary, musl) |
| Packaging | **electron-builder** | 26.7.0 | Installers (NSIS / DMG / AppImage) |

## Dev Dependencies (Installed)

| Package | Version | Purpose |
|---|---|---|
| `@vitejs/plugin-react` | 5.1.4 | React fast refresh for Vite |
| `@types/react` | 19.2.14 | TypeScript types for React |
| `@types/react-dom` | 19.2.3 | TypeScript types for ReactDOM |

## Not Yet Installed (Post-MVP)

| Package | Purpose |
|---|---|
| `eslint` + `@typescript-eslint/*` | Linting |
| `prettier` | Code formatting |
| `vitest` | Unit tests (Vite-native) |
| `@testing-library/react` | Component tests |

## Version Constraints

- Node.js: ≥ 18 (v20.20.0 used in development, installed via nvm)
- Tectonic: 0.15.0 (musl variant for Linux compatibility)

## Why These Choices

### Tectonic over TeX Live
- Single ~14 MB binary (musl) vs. multi-GB installation.
- Auto-downloads only needed packages on first use.
- Deterministic builds (pinned bundle versions).
- **Note:** The glibc variant required GLIBC_2.35 which was not available
  on the build server. The musl variant is statically linked and portable.

### Monaco over CodeMirror
- Identical editing experience to VS Code.
- Built-in language service infrastructure for future LSP integration.
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
- Tailwind CSS v4 introduced breaking changes — the PostCSS plugin moved
  to `@tailwindcss/postcss` and the v3 `@tailwind` directives are removed.
- Plain CSS with VS Code color tokens keeps the styling simple and
  dependency-free, matching the editor's dark theme natively.
