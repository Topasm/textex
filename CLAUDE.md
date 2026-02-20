# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TextEx — a self-contained desktop LaTeX editor built on Electron. Split-pane interface (Monaco code editor + react-pdf preview) with a bundled Tectonic engine. No external TeX installation required.

## Commands

- `npm run dev` — Start development with HMR (electron-vite)
- `npm run build` — Compile main/preload/renderer to `out/`
- `npm run typecheck` — Run TypeScript type checking (`tsc --noEmit`)
- `npm run package:linux` / `package:mac` / `package:win` — Build + create platform installer via electron-builder
- `npm run test` — Run Vitest unit tests (133 tests, 9 files)
- `npm run test:watch` — Run tests in watch mode
- `npm run lint` — Run ESLint on `src/`
- `npm run lint:fix` — Auto-fix ESLint issues
- `npm run format` — Format code with Prettier
- `npm run format:check` — Check formatting without modifying files
- `npm run build:cli` — Compile the CLI to `out/cli/`
- `npm run build:mcp` — Compile the MCP server to `out/mcp/`
- `npm run mcp` — Start the MCP server (stdio transport)
- `textex compile <file.tex>` — Headless LaTeX compilation via CLI
- `textex read <file.tex>` — Read and display a .tex file
- `textex edit <file.tex>` — Edit a .tex file
- `textex inspect <file.tex>` — Inspect document structure and metadata
- `textex outline <file.tex>` — Show document outline (sections, labels)

## Architecture

Three-process Electron app with strict context isolation:

```
Main Process (src/main/)             Preload (src/preload/)       Renderer (src/renderer/)
  main.ts     — window setup          index.ts — contextBridge      main.tsx — ErrorBoundary + App
  ipc.ts      — legacy IPC init          exposes window.api          App.tsx — layout shell + sidebar
  ipc/        — domain IPC handlers                                  components/
    index.ts, ai, bibliography,                                        ├── HomeScreen
    compiler, fileSystem, git,                                         ├── Toolbar
    lsp, misc, projectData,                                            ├── UpdateNotification
    settings, spellcheck,                                              ├── TabBar
    synctex, templates                                                 ├── EditorPane (Monaco + snippets)
  services/   — compileCache,                                          ├── PreviewPane (react-pdf)
                compileQueue,                                          ├── Sidebar (FileTree/GitPanel/
                fileCache                                              │    BibPanel/OutlinePanel/
  workers/    — logParserWorker,                                       │    HistoryPanel/TimelinePanel/
                spellWorker                                            │    TodoPanel)
  utils/      — syncTexMath,                                           ├── OmniSearch + panels
                logParseUtils,                                         ├── LogPanel
                pathValidation                                         ├── StatusBar
  compiler.ts — Tectonic spawn                                         ├── SettingsModal + tabs
  texlab.ts   — TexLab LSP manager                                     ├── TemplateGallery
  settings.ts — user settings                                          ├── DraftModal (AI)
  ai.ts, git.ts, pandoc.ts,                                            ├── TableEditorModal
  bibparser.ts, spellcheck.ts,                                         ├── MathPreviewWidget
  synctex.ts, logparser.ts,                                            ├── CitationTooltip
  history.ts, citgroups.ts,                                            └── ImagePreviewTooltip
  projectData.ts, templateStore.ts,
  labelscanner.ts, packageloader.ts,                                 store/ (6 Zustand stores)
  zotero.ts                                                            useProjectStore, useEditorStore,
                                                                       useCompileStore, usePdfStore,
CLI (src/cli/)                  MCP Server (src/mcp/)                  useSettingsStore, useUiStore,
  index.ts — commander setup      server.ts — stdio MCP server         selectors.ts
  commands/compile.ts               compile_latex tool
  commands/init.ts                  get_compile_log tool             i18n/ — 7 languages
  commands/export.ts                   |                             lsp/  — LSP client + providers
  commands/templates.ts                +----> src/shared/            services/ — aiService,
  commands/read.ts                             compiler.ts                      commandRegistry
  commands/edit.ts                             pandoc.ts
  commands/inspect.ts                          bibparser.ts
  commands/outline.ts                          + 8 more modules
       |
       +-------> src/shared/
```

**IPC flow:** Renderer calls `window.api.*` → preload forwards via `ipcRenderer.invoke` → main process handles in domain-specific `ipc/*.ts` handlers. Compile logs stream back via `latex:log` channel.

**State:** Six split Zustand stores in `src/renderer/store/`:
- `useProjectStore` — file paths, project root, open files, tabs, dirty flags
- `useEditorStore` — cursor, content, decorations, pending jumps/inserts
- `useCompileStore` — compile status, logs, errors
- `usePdfStore` — PDF data, page, zoom, scroll position
- `useSettingsStore` — theme, font size, editor preferences, integrations
- `useUiStore` — sidebar, panels, modals, split ratio, layout state
- `selectors.ts` — derived/composed selectors across stores

**Auto-compile:** `useAutoCompile` hook debounces content changes by 1000ms, auto-saves (with error reporting), then triggers Tectonic compilation. Cancellation errors from overlapping compiles are silently ignored.

**Tectonic binary resolution** (`src/main/compiler.ts`): In dev mode, uses `resources/bin/{platform}/tectonic`. In packaged mode, uses `process.resourcesPath/bin/tectonic`. The binary is invoked as `tectonic -X compile <filePath>`. Binary existence is verified before spawning. Active compilations are killed before starting new ones.

## Conventions

### Naming
- IPC handlers: one file per domain in `src/main/ipc/` (e.g., `compiler.ts`, `git.ts`, `bibliography.ts`)
- Stores: `use<Domain>Store.ts` (e.g., `useProjectStore.ts`, `useUiStore.ts`)
- Hooks: `use<Feature>.ts`, organized into `hooks/editor/` and `hooks/preview/` subdirectories
- Components: PascalCase `.tsx` files; subdirectories for logical groups (`bib/`, `editor/`, `home/`, `settings/`, `omnisearch-panels/`)

### IPC Patterns
- Channel namespaces: `fs:*`, `latex:*`, `lsp:*`, `synctex:*`, `settings:*`, `bib:*`, `spell:*`, `git:*`, `update:*`, `export:*`, `zotero:*`, `ai:*`, `project:*`, `history:*`, `template:*`
- All channels defined in `src/shared/ipcChannels.ts` — always import from there, never use string literals
- Handlers use `ipcMain.handle` for request/response, `webContents.send` for push events

### Store Patterns
- Never import from the old monolithic `useAppStore` — it has been deleted
- Each store is independent; use `selectors.ts` for cross-store derived state
- Prefer fine-grained selectors to avoid unnecessary re-renders: `useProjectStore(s => s.filePath)` not `useProjectStore()`

### Shared Code
- `src/shared/` — pure Node.js logic with no Electron imports; shared by `src/main/`, `src/cli/`, and `src/mcp/`
- Never import from `src/main/` or `src/renderer/` in shared code

## Gotchas and Pitfalls

### Windows Case Sensitivity
Windows has a case-insensitive filesystem. Never create a directory with the same name (case-insensitive) as an existing file in the same parent. Vite/esbuild cannot distinguish them.
- **Example:** Creating `omnisearch/` alongside `OmniSearch.tsx` broke barrel imports. Fix: use a distinct name like `omnisearch-panels/`.

### Electron Cache Locks
When multiple Electron instances run, the GPU cache gets locked ("Unable to move cache: Access denied").
- **Fix:** `taskkill //F //IM electron.exe` before restarting dev. Do **not** kill `node.exe` as it kills the dev server too.

### Store Split Migration
The original monolithic `useAppStore.ts` was deleted and split into 6 domain stores. Any remaining test file that imports `useAppStore` (e.g., `src/__tests__/store/useAppStore.test.ts`) tests the split stores, not a single store.

### Build Targets
- `nodeIntegration: false`, `contextIsolation: true` — all Node access goes through the preload bridge
- Renderer types for the API bridge live in `src/renderer/types/api.d.ts`
- Styling: CSS custom properties for theming (dark/light/high-contrast) in `src/renderer/styles/index.css`
- Build outputs land in `out/main/`, `out/preload/`, `out/renderer/`
- Detailed design docs are in `docs/` (architecture, IPC spec, compiler service, UI spec, packaging, file structure, CLI, MCP, settings, Zotero, tech stack, licenses, TODO)
