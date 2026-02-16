# NeuroTeX — Implementation TODO

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
- [x] **1.4** Verify binary works standalone: `./tectonic -X compile test.tex` → success
- [x] **1.5** Smoke test verified — Tectonic compiled a minimal `.tex` to PDF

---

## Phase 2: Main Process — Compiler Service

- [x] **2.1** Create `src/main/compiler.ts`
  - `getTectonicPath()` with dev/prod and per-platform resolution
  - `compileLatex(filePath, win)` → spawns tectonic, streams stderr, returns PDF Base64
  - Binary existence check with `fs.access` before spawn
- [x] **2.2** Create `src/main/ipc.ts`
  - `ipcMain.handle('fs:open')` — native file dialog, reads `.tex` file
  - `ipcMain.handle('fs:save')` — writes content to path
  - `ipcMain.handle('fs:save-as')` — save dialog + write
  - `ipcMain.handle('latex:compile')` — delegates to `compileLatex()`
- [x] **2.3** Create `src/main/main.ts`
  - BrowserWindow with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`
  - Preload script path configured
  - IPC handlers registered via `registerIpcHandlers()`
  - Dev: loads `ELECTRON_RENDERER_URL`; Prod: loads `out/renderer/index.html`

---

## Phase 3: Preload / Context Bridge

- [x] **3.1** Create `src/preload/index.ts`
  - Exposes: `openFile`, `saveFile`, `saveFileAs`, `compile`, `onCompileLog`,
    `removeCompileLogListener` via `contextBridge.exposeInMainWorld`
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

- [x] **5.1** `App.tsx` — Main layout
  - Horizontal split: left (editor 50%) + right (preview 50%)
  - Bottom: collapsible log panel
  - Bottom bar: status bar
  - Pure CSS layout (flexbox)

- [x] **5.2** `Toolbar.tsx`
  - Buttons: Open, Save, Save As, Compile, Log toggle
  - Compile button disabled during compilation, shows "Compiling..." state
  - Displays current file name + dirty indicator (`*`)

- [x] **5.3** `EditorPane.tsx`
  - `@monaco-editor/react` with `language="latex"`, `theme="vs-dark"`
  - `onChange` → updates store content + marks dirty
  - Cursor position tracked via `onDidChangeCursorPosition`
  - Config: word wrap on, minimap off, font size 14, auto layout

- [x] **5.4** `PreviewPane.tsx`
  - `react-pdf` `<Document>` + `<Page>` components
  - Base64 → Uint8Array conversion for PDF.js
  - PDF.js worker configured via `import.meta.url`
  - Spinner during compilation, error message on failure, empty state placeholder
  - Multi-page support with dynamic page count

- [x] **5.5** `LogPanel.tsx`
  - Monospace `<pre>` showing logs from store
  - Auto-scrolls to bottom on new content
  - Clear and Close buttons
  - Collapsible (controlled by `isLogPanelOpen`)
  - Auto-opens on compile error (triggered from App.tsx)

- [x] **5.6** `StatusBar.tsx`
  - Left: compile status dot (green/yellow/red) + label
  - Right: cursor position (Ln, Col) from Monaco

---

## Phase 6: Auto-Compile & Keyboard Shortcuts

- [x] **6.1** Create `src/renderer/hooks/useAutoCompile.ts`
  - Watches `content` changes in store
  - 1000ms debounce, saves file first, then compiles
  - Updates `compileStatus` and `pdfBase64` on success
  - Opens log panel and appends error on failure

- [x] **6.2** Create `src/renderer/hooks/useFileOps.ts`
  - `handleOpen()` → native dialog, loads content into store
  - `handleSave()` → saves to disk, falls back to Save As if no path
  - `handleSaveAs()` → save dialog, updates path in store

- [x] **6.3** Register keyboard shortcuts (in App.tsx via `keydown` listener)
  - `Ctrl/Cmd+O` → Open
  - `Ctrl/Cmd+S` → Save
  - `Ctrl/Cmd+Shift+S` → Save As
  - `Ctrl/Cmd+Enter` → Manual compile
  - `Ctrl/Cmd+L` → Toggle log panel

---

## Phase 7: Integration Testing

- [ ] **7.1** End-to-end: open a .tex file, verify content loads in editor
- [ ] **7.2** End-to-end: type in editor, wait for auto-compile, verify PDF appears
- [ ] **7.3** End-to-end: introduce a LaTeX error, verify stderr shows in log panel
- [ ] **7.4** End-to-end: save file, close and reopen, verify content persists
- [ ] **7.5** Test with multi-page document, verify scroll in preview

> **Note:** Integration testing requires a display server (X11/Wayland) to run
> Electron. These tests should be performed on a desktop environment.

---

## Phase 8: Packaging

- [x] **8.1** Create `electron-builder.yml` per `docs/PACKAGING.md`
  - `extraResources` configured to bundle `resources/bin/${os}` → `bin/`
  - Targets: NSIS (Win), DMG (Mac), AppImage (Linux)
- [ ] **8.2** Download Tectonic binaries for all target platforms
  - Only Linux (musl) binary is currently downloaded
  - Need: Windows (x86_64-pc-windows-msvc) and macOS (x86_64-apple-darwin)
- [ ] **8.3** Build for current platform: `npm run package:linux`
- [ ] **8.4** Smoke test the packaged app on a clean machine
- [ ] **8.5** Verify binary path resolution works in production mode

---

## Phase 9: Polish (Post-MVP)

- [ ] **9.1** Draggable split-pane divider
- [ ] **9.2** PDF zoom controls (+/- buttons)
- [ ] **9.3** Dark/light theme toggle
- [ ] **9.4** SyncTeX support (click-to-jump between source and PDF)
- [ ] **9.5** Multi-file project support (file tree sidebar)
- [ ] **9.6** LaTeX snippet/template gallery
- [ ] **9.7** Auto-update via electron-updater
- [ ] **9.8** CI/CD pipeline (GitHub Actions) for automated builds
- [ ] **9.9** App icons and branding
- [ ] **9.10** ESLint + Prettier setup
- [ ] **9.11** Vitest + @testing-library/react unit tests
- [ ] **9.12** PDF scroll position preservation across recompiles

---

## Dependency Install Checklist

```bash
# All dependencies (run from project root)
npm install electron react react-dom @monaco-editor/react react-pdf zustand \
  pdfjs-dist electron-vite electron-builder typescript @types/react \
  @types/react-dom @vitejs/plugin-react vite
```
