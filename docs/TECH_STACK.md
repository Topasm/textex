# NeuroTeX — Technology Stack

## Core Dependencies

| Layer | Package | Role | Notes |
|---|---|---|---|
| Runtime | **Electron** (latest stable) | Desktop shell | Chromium + Node.js |
| Tooling | **electron-vite** or **Vite** | Build / HMR | Fast dev rebuilds |
| Language | **TypeScript** (strict) | Type safety | Covers main, preload, and renderer |
| UI | **React 18+** | Component model | Functional components + hooks |
| Editor | **@monaco-editor/react** | Code editing | VS Code engine, LaTeX grammar |
| PDF | **react-pdf** (PDF.js) | PDF display | Render compiled output |
| State | **Zustand** | Global state | Minimal boilerplate |
| Styling | **Tailwind CSS** | Utility-first CSS | Rapid UI prototyping |
| LaTeX | **Tectonic** (sidecar binary) | Compilation | No TeX Live dependency |
| Packaging | **electron-builder** | Installers | NSIS / DMG / AppImage |

## Dev Dependencies

| Package | Purpose |
|---|---|
| `eslint` + `@typescript-eslint/*` | Linting |
| `prettier` | Code formatting |
| `vitest` | Unit tests (Vite-native) |
| `@testing-library/react` | Component tests |
| `electron-builder` | Packaging & signing |

## Version Constraints

- Node.js: ≥ 18 (Electron's bundled Node)
- npm / yarn / pnpm: any (pnpm recommended for speed)
- Tectonic: latest release binary from GitHub Releases

## Why These Choices

### Tectonic over TeX Live
- Single ~25 MB binary vs. multi-GB installation.
- Auto-downloads only needed packages on first use.
- Deterministic builds (pinned bundle versions).

### Monaco over CodeMirror
- Identical editing experience to VS Code.
- Built-in language service infrastructure for future LSP integration.
- Rich API for decorations, markers, and diagnostics.

### Zustand over Redux / Context
- < 1 kB, zero boilerplate.
- No providers needed in the component tree.
- Works outside React (useful for IPC callbacks).

### react-pdf over iframe / embed
- Programmatic page navigation and zoom.
- Scroll-position preservation across re-renders.
- No reliance on browser's native PDF plugin.
