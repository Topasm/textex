# TextEx — Implementation TODO

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done

---

## Phase 0: Project Bootstrap

- [x] **0.1** Initialize Electron project with React + TypeScript
  - Set up manually with `npm init`, electron, electron-vite, react, typescript
- [x] **0.2** Configure TypeScript
  - `tsconfig.json` (references), `tsconfig.node.json` (main/preload), `tsconfig.web.json` (renderer)
- [x] **0.3** Install core dependencies
  - `electron`, `react`, `react-dom`, `@monaco-editor/react`, `react-pdf`,
    `zustand`, `pdfjs-dist`
- [x] **0.4** Install dev dependencies
  - `electron-builder`, `electron-vite`, `typescript`, `vite`,
    `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`
- [x] **0.5** Set up styling
  - Plain CSS approach (VS Code dark theme colors) in `src/renderer/styles/index.css`
  - **Note:** Tailwind CSS was dropped in favor of plain CSS due to Tailwind v4
    breaking changes with PostCSS plugin configuration
- [x] **0.6** Set up folder structure per `docs/FILE_STRUCTURE.md`
- [x] **0.7** Verify build succeeds: `electron-vite build` compiles all three targets
  - Main: `out/main/index.js`
  - Preload: `out/preload/index.js`
  - Renderer: `out/renderer/` (HTML + JS + CSS + PDF worker)

---

## Phase 1: Tectonic Binary Setup

- [x] **1.1** Create `resources/bin/{win,mac,linux}/` directories
- [x] **1.2** Download Tectonic binary for Linux (musl variant for compatibility)
  - Source: `tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz`
  - **Note:** The glibc variant required GLIBC_2.35; musl is statically linked
- [x] **1.3** Set execute permission (`chmod +x`) on linux binary
- [x] **1.4** Verify binary works standalone: `./tectonic -X compile test.tex` -> success
- [x] **1.5** Smoke test verified -- Tectonic compiled a minimal `.tex` to PDF

---

## Phase 2: Main Process — Compiler Service

- [x] **2.1** Create `src/main/compiler.ts`
  - `getTectonicPath()` with dev/prod and per-platform resolution
  - `compileLatex(filePath, win)` -> spawns tectonic, streams stdout+stderr, returns PDF Base64
  - Binary existence check with `fs.access` before spawn
  - `cancelCompilation()` kills active process and tracks via `activeProcess` module variable
  - `close` handler distinguishes signal (cancellation) from normal exit
- [x] **2.2** Create `src/main/ipc.ts`
  - `ipcMain.handle('fs:open')` -- native file dialog, reads `.tex` file
  - `ipcMain.handle('fs:save')` -- writes content to path
  - `ipcMain.handle('fs:save-as')` -- save dialog + write
  - `ipcMain.handle('latex:compile')` -- delegates to `compileLatex()`
  - `ipcMain.handle('latex:cancel')` -- delegates to `cancelCompilation()`
  - `validateFilePath()` validates IPC input on `fs:save` and `latex:compile` (non-empty, absolute)
- [x] **2.3** Create `src/main/main.ts`
  - BrowserWindow with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`
  - Preload script path configured
  - IPC handlers registered via `registerIpcHandlers()`
  - `setWindowOpenHandler` restricts `shell.openExternal` to http/https URLs only
  - Dev: loads `ELECTRON_RENDERER_URL`; Prod: loads `out/renderer/index.html`

---

## Phase 3: Preload / Context Bridge

- [x] **3.1** Create `src/preload/index.ts`
  - Exposes: `openFile`, `saveFile`, `saveFileAs`, `compile`, `onCompileLog`,
    `removeCompileLogListener` via `contextBridge.exposeInMainWorld`
  - Tracks single `compileLogHandler` reference to prevent listener leaks
- [x] **3.2** Create `src/renderer/types/api.d.ts`
  - Full type declarations for `ElectronAPI` interface on `window.api`

---

## Phase 4: Zustand Store

- [x] **4.1** Create `src/renderer/store/useAppStore.ts`
  - State: `filePath`, `content`, `isDirty`, `compileStatus`, `pdfBase64`,
    `logs`, `isLogPanelOpen`, `cursorLine`, `cursorColumn`
  - Actions: `setContent`, `setFilePath`, `setDirty`, `setCompileStatus`,
    `setPdfBase64`, `appendLog`, `clearLogs`, `toggleLogPanel`, `setLogPanelOpen`,
    `setCursorPosition`

---

## Phase 5: UI Components

- [x] **5.1** `App.tsx` -- Main layout
  - Horizontal split: left (editor 50%) + right (preview 50%)
  - Bottom: collapsible log panel
  - Bottom bar: status bar
  - Pure CSS layout (flexbox)
  - Keyboard shortcuts via `keydown` listener
  - IPC log listener using `useAppStore.getState()` to avoid stale closures

- [x] **5.2** `Toolbar.tsx`
  - Buttons: Open, Save, Save As, Compile, Log toggle
  - Each button shows keyboard shortcut as `<kbd>` element
  - Compile button disabled during compilation, shows "Compiling..." state
  - Displays current file name + dirty indicator (yellow dot)
  - Save button highlights yellow when file is dirty

- [x] **5.3** `EditorPane.tsx`
  - `@monaco-editor/react` with `language="latex"`, `theme="vs-dark"`
  - `onChange` -> updates store content + marks dirty
  - Cursor position tracked via `onDidChangeCursorPosition` (disposable cleaned up on unmount)
  - Config: word wrap on, minimap off, font size 14, auto layout

- [x] **5.4** `PreviewPane.tsx`
  - `react-pdf` `<Document>` + `<Page>` components
  - Base64 -> Uint8Array conversion for PDF.js
  - PDF.js worker configured via `import.meta.url`
  - Spinner overlay during compilation (over existing PDF)
  - Error message on failure (only when no PDF exists), empty state placeholder
  - Multi-page support with dynamic page count
  - Scroll position preservation via ref + `requestAnimationFrame`
  - Responsive width via `ResizeObserver`

- [x] **5.5** `LogPanel.tsx`
  - Monospace `<pre>` showing logs from store (stdout+stderr)
  - Auto-scrolls to bottom on new content
  - Clear and Close buttons
  - Collapsible (controlled by `isLogPanelOpen`)
  - Auto-opens on compile error (triggered from App.tsx and useAutoCompile)
  - 200px fixed height

- [x] **5.6** `StatusBar.tsx`
  - Left: compile status dot (green/yellow/red) + label
  - Right: cursor position (Ln, Col) from Monaco
  - Blue accent background with white text

- [x] **5.7** `ErrorBoundary.tsx`
  - Class component wrapping `<App>` in `main.tsx`
  - Catches rendering errors via `getDerivedStateFromError`
  - Displays error message and "Reload" button

---

## Phase 6: Auto-Compile & Keyboard Shortcuts

- [x] **6.1** Create `src/renderer/hooks/useAutoCompile.ts`
  - Watches `content` and `filePath` changes in store
  - 1000ms debounce, saves file first (reports save failures), then compiles
  - Clears dirty flag on successful save
  - Silently ignores "Compilation was cancelled" errors
  - Full dependency array for `useEffect`
  - Updates `compileStatus` and `pdfBase64` on success
  - Opens log panel and appends error on failure

- [x] **6.2** Create `src/renderer/hooks/useFileOps.ts`
  - `handleOpen()` -> native dialog, loads content into store
  - `handleSave()` -> saves to disk, uses `getState()` for fresh content, falls back to Save As if no path
  - `handleSaveAs()` -> save dialog, updates path in store

- [x] **6.3** Register keyboard shortcuts (in App.tsx via `keydown` listener)
  - `Ctrl/Cmd+O` -> Open
  - `Ctrl/Cmd+S` -> Save
  - `Ctrl/Cmd+Shift+S` -> Save As
  - `Ctrl/Cmd+Enter` -> Manual compile
  - `Ctrl/Cmd+L` -> Toggle log panel

---

## Phase 7: Integration Testing

- [ ] **7.1** End-to-end: open a .tex file, verify content loads in editor
- [ ] **7.2** End-to-end: type in editor, wait for auto-compile, verify PDF appears
- [ ] **7.3** End-to-end: introduce a LaTeX error, verify stderr shows in log panel
- [ ] **7.4** End-to-end: save file, close and reopen, verify content persists
- [ ] **7.5** Test with multi-page document, verify scroll in preview

> **Note:** Integration testing requires a display server (X11/Wayland) to run
> Electron. These tests should be performed on a desktop environment.
> **See Phase 10 (CLI)** — the CLI enables headless compilation testing without
> a display server, partially unblocking this phase.

---

## Phase 8: Packaging

- [x] **8.1** Create `electron-builder.yml` per `docs/PACKAGING.md`
  - `extraResources` configured to bundle `resources/bin/${os}` -> `bin/`
  - Targets: NSIS (Win), DMG (Mac), AppImage (Linux)
  - Updated with icon paths (`build/icon.{ico,icns,png}`) and macOS entitlements
- [x] **8.2** Download Tectonic binaries for all target platforms
  - All three platforms now have Tectonic 0.15.0 binaries:
  - Linux: `x86_64-unknown-linux-musl` (36 MB, statically linked)
  - macOS: `x86_64-apple-darwin` (50 MB, Mach-O 64-bit)
  - Windows: `x86_64-pc-windows-msvc` (48 MB, PE32+ x86-64)
- [x] **8.3** Build for current platform: `npm run package:linux`
  - Linux AppImage built successfully: `dist/TextEx-1.0.0.AppImage` (155 MB)
  - Tectonic binary correctly bundled at `resources/bin/tectonic` inside packaged app
- [ ] **8.4** Smoke test the packaged app on a clean machine
  - **Blocked:** Cannot run AppImage on headless server (no display server).
    Requires a desktop environment with X11/Wayland to launch and test.
  - **See Phase 10 (CLI)** — the CLI enables headless smoke testing of
    compilation without launching the GUI.
- [x] **8.5** Verify binary path resolution works in production mode
  - `getTectonicPath()` in `src/main/compiler.ts` confirmed correct:
    dev mode uses `__dirname/../../resources/bin/{platform}/tectonic`,
    prod mode uses `process.resourcesPath/bin/tectonic`
  - Packaged app verified: binary present at `dist/linux-unpacked/resources/bin/tectonic`
  - `extraResources` correctly copies platform-specific binary to `bin/` in app resources

---

## Phase 9: Polish (Post-MVP)

- [x] **9.1** Draggable split-pane divider
  - `splitRatio` state in Zustand store (default 0.5, range 0.2–0.8)
  - Vertical divider bar between editor and preview panes in `App.tsx`
  - Mouse drag to resize, double-click to reset to 50/50
  - CSS: 4px wide, `col-resize` cursor, highlights `#007acc` on hover
- [x] **9.2** PDF zoom controls (+/- buttons)
  - `zoomLevel` state in Zustand store (default 100, range 25–400, step 25)
  - `zoomIn()`, `zoomOut()`, `resetZoom()` actions
  - Sticky zoom toolbar at top of preview pane: [-] [100%] [+] [Fit Width]
  - Keyboard shortcuts: `Ctrl/Cmd+=` zoom in, `Ctrl/Cmd+-` zoom out, `Ctrl/Cmd+0` reset
  - Zoom applies by multiplying base page width by `zoomLevel / 100`
- [x] **9.3** Dark/light theme toggle
  - Three themes (dark/light/high-contrast) with CSS custom properties. Settings persist to userData/settings.json.
- [x] **9.4** SyncTeX support (click-to-jump between source and PDF)
  - Forward sync: `synctexForward` IPC from editor → highlights position in PDF
  - Inverse sync: `Ctrl+Click` on PDF → jumps to source line in editor
  - SyncTeX indicator with fade-out animation in preview pane
  - `synctexHighlight` and `pendingJump` state in Zustand store
- [x] **9.5** Multi-file project support (file tree sidebar)
  - FileTree.tsx with lazy directory loading, TabBar.tsx with multi-tab management, sidebar with 3 views (Files/Git/Bib), resizable width.
- [x] **9.6** LaTeX snippet/template gallery
  - ~50 LaTeX snippets via Monaco CompletionItemProvider, 5 document templates (Article, Report, Beamer, Letter, CV) in TemplateGallery.tsx modal.
- [x] **9.7** Auto-update via electron-updater
  - electron-updater integration in main.ts with UpdateNotification.tsx banner (available/downloading/ready states).
- [x] **9.8** CI/CD pipeline (GitHub Actions) for automated builds
  - `.github/workflows/build.yml` with multi-platform matrix (Linux, macOS x64, macOS arm64, Windows)
  - Triggered on version tags (`v*`) and manual dispatch
  - Downloads Tectonic binary per platform, builds with electron-vite + electron-builder
  - Uploads artifacts (AppImage, DMG, EXE) to GitHub Actions
- [x] **9.9** App icons and branding
  - Created as part of Phase 8 packaging work (see `build/icon.{png,ico,icns}`)
- [x] **9.10** ESLint + Prettier setup
  - ESLint v9 flat config (`eslint.config.mjs`) with `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-config-prettier`
  - Prettier config (`.prettierrc`): no semicolons, single quotes, 100 char width
  - npm scripts: `lint`, `lint:fix`, `format`, `format:check`
- [x] **9.11** Vitest + @testing-library/react unit tests
  - Vitest v4 with jsdom environment (`vitest.config.ts`)
  - 53 tests across 3 test files, all passing
  - `src/__tests__/store/useAppStore.test.ts` — 38 tests covering all state mutations
  - `src/__tests__/components/StatusBar.test.tsx` — 7 render tests
  - `src/__tests__/components/Toolbar.test.tsx` — 8 render + interaction tests
  - Test setup with mocked `window.api` for Electron IPC
  - npm scripts: `test`, `test:watch`
- [x] **9.12** Custom font size setting
  - `Ctrl+Shift+=/-` keyboard shortcuts, persisted to settings.json, range 8-32px
- [x] **9.13** BibTeX / bibliography support
  - bibparser.ts parses .bib files, BibPanel.tsx sidebar panel, citation completion inside \cite{} in editor
- [x] **9.14** Git integration
  - git.ts backend using child_process, GitPanel.tsx with stage/unstage/commit UI, branch in status bar, file tree decorations
- [x] **9.15** Spell checker
  - Dictionary-based spell checker (resources/dictionaries/en-US), Monaco markers + code action provider for suggestions, toggle in status bar
- [x] **9.16** Export to other formats
  - pandoc.ts export backend, toolbar dropdown for HTML/DOCX/ODT/EPUB formats

---

## Phase 10: CLI

- [x] **10.1** Create `src/cli/index.ts` with `commander` for arg parsing
- [x] **10.2** Add `bin` field to `package.json`, add build step for CLI
- [x] **10.3** Extract shared compiler logic to `src/shared/compiler.ts`
  - Removed `app.isPackaged` and `BrowserWindow` deps from `src/main/compiler.ts`
  - Parameterized dev/prod detection via `isDev`/`resourcesPath`/`devBasePath` options
  - Replaced `win.webContents.send('latex:log', text)` with generic `onLog` callback
- [x] **10.4** Extract shared pandoc logic to `src/shared/pandoc.ts`
  - Removed `app` dep from `src/main/pandoc.ts`
- [x] **10.5** `textex compile <file.tex>` — flags: `--output <dir>`, `--watch`, `--quiet`
- [x] **10.6** `textex init [template]` — scaffold from 5 built-in templates (shared via `src/shared/templates.ts`)
- [x] **10.7** `textex export <file.tex> --format <html|docx|odt|epub>` — reuses shared pandoc logic
- [x] **10.8** `textex templates` — list available templates to stdout
- [x] **10.9** Watch mode (`--watch`) via `chokidar`
- [ ] **10.10** CLI unit tests
  - Unblocks headless testing — cross-ref Phase 7 and Phase 8.4

---

## Phase 11: MCP Server

- [x] **11.1** Create `src/mcp/server.ts` with `@modelcontextprotocol/sdk`, stdio transport
- [x] **11.2** `compile_latex` tool — accepts file path, returns `{ success, pdfPath?, error? }`
- [x] **11.3** `get_compile_log` tool — returns last compile's stdout/stderr
- [x] **11.4** Add npm script `mcp` to start the server
- [x] **11.5** Document MCP config for Claude Desktop / other clients
  - MCP usage section added to README.md with Claude Desktop config JSON

---

## Phase 12: TexLab LSP Integration

- [x] **12.1** Create `src/main/texlab.ts` — TexLab process manager
  - Singleton `TexLabManager` with binary resolution (bundled/custom/PATH)
  - stdio LSP parsing (Content-Length header protocol)
  - Auto-restart with up to 3 retries and exponential backoff
  - Lifecycle: `start(workspaceRoot, callbacks)`, `send(message)`, `stop()`
- [x] **12.2** Add LSP IPC handlers in `src/main/ipc.ts`
  - `lsp:start`, `lsp:stop`, `lsp:send`, `lsp:status` (invoke handlers)
  - `lsp:message`, `lsp:status-change` (push channels via `webContents.send`)
- [x] **12.3** Extend preload bridge in `src/preload/index.ts`
  - `lspMessageHandler`, `lspStatusHandler` module-level variables
  - 8 methods: `lspStart`, `lspStop`, `lspSend`, `lspStatus`, `onLspMessage`,
    `removeLspMessageListener`, `onLspStatus`, `removeLspStatusListener`
- [x] **12.4** Add TypeScript declarations in `src/renderer/types/api.d.ts`
  - LSP methods on `ElectronAPI` interface
  - `lspEnabled`, `texlabPath` on `UserSettings` interface
- [x] **12.5** Extend settings in `src/main/settings.ts`
  - `lspEnabled: true` (on by default), `texlabPath: ''` (auto-detect)
- [x] **12.6** Add LSP state to Zustand store
  - State: `lspStatus`, `lspError`, `lspEnabled`
  - Actions: `setLspStatus`, `setLspError`, `setLspEnabled`
  - Updated `loadUserSettings` to include `lspEnabled`
- [x] **12.7** Create `src/renderer/lsp/ipcTransport.ts`
  - `IpcMessageReader` (extends `AbstractMessageReader`) and `IpcMessageWriter`
    (extends `AbstractMessageWriter`) using `vscode-jsonrpc` base classes
- [x] **12.8** Create `src/renderer/lsp/lspClient.ts`
  - Lightweight LSP client (not `monaco-languageclient` — avoids compatibility
    issues with `@monaco-editor/react`)
  - Handles LSP initialize/initialized handshake
  - Registers Monaco providers based on server capabilities: completions, hover,
    definition, document symbols, rename, formatting
  - Routes `textDocument/publishDiagnostics` to Monaco markers (owner: `texlab`)
  - Exports: `startLspClient`, `stopLspClient`, `isLspRunning`,
    `lspNotifyDidOpen`, `lspNotifyDidChange`, `lspNotifyDidSave`, `lspNotifyDidClose`
- [x] **12.9** Install `vscode-jsonrpc` dependency
- [x] **12.10** Wire up LSP lifecycle in `App.tsx`
  - Effect: start LSP when `projectRoot` is set and `lspEnabled`, stop on cleanup
  - Effect: subscribe to `lsp:status-change` push channel
  - Effect: debounced content change notifications (300ms via store subscription)
  - Effect: file switch notifications (`lspNotifyDidOpen`)
- [x] **12.11** Add LSP cleanup in `EditorPane.tsx`
  - `stopLspClient()` in unmount effect
- [x] **12.12** Add LSP indicator to `StatusBar.tsx`
  - "LSP: Connected / Starting... / Error / Off" in right section
- [x] **12.13** GPL compliance: license files and packaging
  - `resources/licenses/TEXLAB-NOTICE.txt` — attribution, source link, aggregate notice
  - `resources/licenses/TEXLAB-GPL-3.0.txt` — full GPL-3.0 text (to be placed)
  - `electron-builder.yml` updated to include `resources/licenses` in `extraResources`
- [ ] **12.14** Download and place TexLab binaries for all platforms
  - `resources/bin/linux/texlab`
  - `resources/bin/mac/texlab`
  - `resources/bin/win/texlab.exe`
- [ ] **12.15** Place full GPL-3.0 license text
  - `resources/licenses/TEXLAB-GPL-3.0.txt`

### Feature Coexistence

| Feature | Source | Notes |
|---------|--------|-------|
| Snippet completions (~50) | **Custom** | Hand-crafted tab stops, richer than LSP |
| `\cite{}` completions | **Custom** | Uses TextEx's parsed BibTeX entries |
| `\ref{}` completions | **Custom** | Uses TextEx's label scanner |
| `\begin{}` completions | **Custom** | Uses TextEx's env list + snippets |
| Package macro completions | **Custom** | From bundled JSON data |
| General LSP completions | **TexLab** | Additional commands not covered by custom |
| Real-time diagnostics | **TexLab** | Syntax errors without full compile |
| Compilation diagnostics | **Existing** | From Tectonic log parsing (marker owner `'latex'`) |
| Math hover (KaTeX) | **Custom** | TexLab doesn't do this |
| Citation hover | **Custom** | Rich BibTeX display |
| Command documentation hover | **TexLab** | Monaco merges multiple hover providers |
| Go-to-definition | **Hybrid** | Existing Ctrl+Click first, LSP fallback |
| Document symbols/outline | **TexLab** | Not previously available |
| Formatting | **TexLab** | Not previously available |
| Rename across files | **TexLab** | Not previously available |
| Spell check | **Existing** | TexLab doesn't do this |

---

## Dependency Install Checklist

```bash
# All dependencies (run from project root)
npm install electron react react-dom @monaco-editor/react react-pdf zustand \
  pdfjs-dist electron-vite electron-builder typescript @types/react \
  @types/react-dom @vitejs/plugin-react vite nspell simple-git electron-updater \
  commander chokidar @modelcontextprotocol/sdk katex zod vscode-jsonrpc
```
