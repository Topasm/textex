# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TextEx — a self-contained desktop LaTeX editor built on Electron. Split-pane interface (Monaco code editor + react-pdf preview) with a bundled Tectonic engine. No external TeX installation required.

## Commands

- `npm run dev` — Start development with HMR (electron-vite)
- `npm run build` — Compile main/preload/renderer to `out/`
- `npm run package:linux` / `package:mac` / `package:win` — Build + create platform installer via electron-builder
- `npm run test` — Run Vitest unit tests (53 tests)
- `npm run test:watch` — Run tests in watch mode
- `npm run lint` — Run ESLint on `src/`
- `npm run lint:fix` — Auto-fix ESLint issues
- `npm run format` — Format code with Prettier
- `npm run format:check` — Check formatting without modifying files

## Architecture

Three-process Electron app with strict context isolation:

```
Main Process (src/main/)          Preload (src/preload/)       Renderer (src/renderer/)
  main.ts   — window setup         index.ts — contextBridge      main.tsx — ErrorBoundary + App
  ipc.ts    — IPC handlers            exposes window.api          App.tsx — layout shell + sidebar
  compiler.ts — Tectonic spawn                                    ├── Toolbar (theme, export, template)
  settings.ts — user settings                                     ├── UpdateNotification
  bibparser.ts — .bib parser                                      ├── Sidebar (FileTree/GitPanel/BibPanel)
  spellcheck.ts — dictionary                                      ├── TabBar
  git.ts    — git CLI wrapper                                     ├── EditorPane (Monaco + snippets + spellcheck)
  pandoc.ts — Pandoc export                                       ├── PreviewPane (react-pdf)
                                                                  ├── LogPanel
                                                                  ├── StatusBar (git branch, spell toggle)
                                                                  └── TemplateGallery (modal)
```

**IPC flow:** Renderer calls `window.api.*` → preload forwards via `ipcRenderer.invoke` → main process handles in `ipc.ts`. Compile logs stream back via `latex:log` channel.

**State:** Single Zustand store (`src/renderer/store/useAppStore.ts`) with `subscribeWithSelector` middleware. Holds file/multi-file state, compile status, PDF data, logs, cursor, split ratio, zoom, theme, font size, sidebar, git status, bib entries, spell check, update status, and export status.

**Auto-compile:** `useAutoCompile` hook debounces content changes by 1000ms, auto-saves (with error reporting), then triggers Tectonic compilation. Cancellation errors from overlapping compiles are silently ignored.

**Tectonic binary resolution** (`src/main/compiler.ts`): In dev mode, uses `resources/bin/{platform}/tectonic`. In packaged mode, uses `process.resourcesPath/bin/tectonic`. The binary is invoked as `tectonic -X compile <filePath>`. Binary existence is verified before spawning. Active compilations are killed before starting new ones.

## Key Conventions

- `nodeIntegration: false`, `contextIsolation: true` — all Node access goes through the preload bridge
- IPC channels: `fs:*`, `latex:*`, `synctex:*`, `settings:*`, `bib:*`, `spell:*`, `git:*`, `update:*`, `export:*`
- Renderer types for the API bridge live in `src/renderer/types/api.d.ts`
- Styling: CSS custom properties for theming (dark/light/high-contrast) in `src/renderer/styles/index.css`
- Build outputs land in `out/main/`, `out/preload/`, `out/renderer/`
- Detailed design docs are in `docs/` (architecture, IPC spec, compiler service, UI spec, packaging)
