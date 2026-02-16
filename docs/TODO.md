# NeuroTeX — Implementation TODO

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done

---

## Phase 0: Project Bootstrap

- [ ] **0.1** Initialize Electron project with React + TypeScript
  - Run `npm create @quick-start/electron@latest textex -- --template react-ts`
  - Or set up manually: `npm init`, install electron, vite, react, typescript
- [ ] **0.2** Configure TypeScript
  - `tsconfig.json` for renderer (DOM lib, JSX)
  - `tsconfig.node.json` for main/preload (Node lib, no DOM)
- [ ] **0.3** Install core dependencies
  - `electron`, `react`, `react-dom`, `@monaco-editor/react`, `react-pdf`,
    `zustand`, `tailwindcss`, `postcss`, `autoprefixer`
- [ ] **0.4** Install dev dependencies
  - `electron-builder`, `electron-vite`, `typescript`,
    `@types/react`, `@types/react-dom`, `eslint`, `prettier`
- [ ] **0.5** Set up Tailwind CSS
  - `tailwind.config.js`, `postcss.config.js`
  - Add directives to `src/renderer/styles/index.css`
- [ ] **0.6** Set up folder structure per `docs/FILE_STRUCTURE.md`
- [ ] **0.7** Verify dev server starts: `npm run dev` opens an Electron window

---

## Phase 1: Tectonic Binary Setup

- [ ] **1.1** Create `resources/bin/{win,mac,linux}/` directories
- [ ] **1.2** Download Tectonic binary for current dev platform
  - Source: https://github.com/tectonic-typesetting/tectonic/releases
- [ ] **1.3** Set execute permission (`chmod +x`) on mac/linux binary
- [ ] **1.4** Verify binary works standalone: `./tectonic -X compile test.tex`
- [ ] **1.5** Create a minimal `test.tex` for smoke testing:
  ```latex
  \documentclass{article}
  \begin{document}
  Hello, NeuroTeX!
  \end{document}
  ```

---

## Phase 2: Main Process — Compiler Service

- [ ] **2.1** Create `src/main/compiler.ts`
  - Implement `getTectonicPath()` (dev vs. prod, per-platform)
  - Implement `compileLatex(filePath, win)` → spawns tectonic, streams stderr,
    returns PDF as Base64
- [ ] **2.2** Create `src/main/ipc.ts`
  - Register `ipcMain.handle('fs:open', ...)`
  - Register `ipcMain.handle('fs:save', ...)`
  - Register `ipcMain.handle('fs:save-as', ...)`
  - Register `ipcMain.handle('latex:compile', ...)`
- [ ] **2.3** Update `src/main/main.ts`
  - Create BrowserWindow with `nodeIntegration: false`, `contextIsolation: true`
  - Point preload to `src/preload/index.ts`
  - Call IPC registration from `ipc.ts`
- [ ] **2.4** Test: trigger compile from Main process directly (temporary test)
  - Spawn tectonic on the test.tex file, verify .pdf is generated

---

## Phase 3: Preload / Context Bridge

- [ ] **3.1** Create `src/preload/index.ts`
  - Expose `openFile`, `saveFile`, `saveFileAs`, `compile`, `onCompileLog`
    via `contextBridge.exposeInMainWorld`
- [ ] **3.2** Create `src/renderer/types/api.d.ts`
  - Type declarations for `window.api` (ElectronAPI interface)
- [ ] **3.3** Verify: renderer can call `window.api.compile(...)` and get result

---

## Phase 4: Zustand Store

- [ ] **4.1** Create `src/renderer/store/useAppStore.ts`
  - State: `filePath`, `content`, `isDirty`, `compileStatus`, `pdfBase64`,
    `logs`, `isLogPanelOpen`
  - Actions: `setContent`, `setFilePath`, `setDirty`, `setCompileStatus`,
    `setPdfBase64`, `appendLog`, `clearLogs`, `toggleLogPanel`

---

## Phase 5: UI Components

- [ ] **5.1** `App.tsx` — Main layout
  - Horizontal split: left (editor) + right (preview)
  - Bottom: log panel (collapsible)
  - Bottom bar: status bar
  - Use Tailwind for layout (`flex`, `h-screen`, etc.)

- [ ] **5.2** `Toolbar.tsx`
  - Buttons: Open, Save, Save As, Compile, Toggle Log
  - Display current file name + dirty indicator
  - Wire buttons to `window.api` calls and store actions

- [ ] **5.3** `EditorPane.tsx`
  - Mount `@monaco-editor/react` with `language="latex"`
  - Register basic LaTeX TextMate grammar (or use plain text as fallback)
  - `onChange` → update store `content` + mark dirty
  - Config: word wrap on, minimap off, font size 14

- [ ] **5.4** `PreviewPane.tsx`
  - Mount `react-pdf` `<Document>` + `<Page>` components
  - Source: convert `pdfBase64` from store to Blob URL
  - Show spinner when `compileStatus === 'compiling'`
  - Show error message when `compileStatus === 'error'`
  - Preserve scroll position on re-render

- [ ] **5.5** `LogPanel.tsx`
  - Monospace text area showing `logs` from store
  - Auto-scroll to bottom on new content
  - Clear button
  - Collapsible (controlled by `isLogPanelOpen`)
  - Auto-open on compile error

- [ ] **5.6** `StatusBar.tsx`
  - Left: compile status dot (green/yellow/red) + label
  - Right: cursor position (Ln, Col) from Monaco API

---

## Phase 6: Auto-Compile & Keyboard Shortcuts

- [ ] **6.1** Create `src/renderer/hooks/useAutoCompile.ts`
  - Watch `content` changes in store
  - Debounce 1000ms, then call `window.api.compile(filePath)`
  - Update `compileStatus` and `pdfBase64` in store
  - Save file before compiling (write content to disk first)

- [ ] **6.2** Create `src/renderer/hooks/useFileOps.ts`
  - `handleOpen()` → call `window.api.openFile()`, update store
  - `handleSave()` → call `window.api.saveFile(content, filePath)`
  - `handleSaveAs()` → call `window.api.saveFileAs(content)`, update filePath

- [ ] **6.3** Register keyboard shortcuts
  - `Ctrl/Cmd+O` → Open
  - `Ctrl/Cmd+S` → Save
  - `Ctrl/Cmd+Shift+S` → Save As
  - `Ctrl/Cmd+Enter` → Manual compile
  - `Ctrl/Cmd+L` → Toggle log panel
  - Use Electron `globalShortcut` or Monaco's `addAction` API

---

## Phase 7: Integration Testing

- [ ] **7.1** End-to-end: open a .tex file, verify content loads in editor
- [ ] **7.2** End-to-end: type in editor, wait for auto-compile, verify PDF appears
- [ ] **7.3** End-to-end: introduce a LaTeX error, verify stderr shows in log panel
- [ ] **7.4** End-to-end: save file, close and reopen, verify content persists
- [ ] **7.5** Test with multi-page document, verify scroll in preview

---

## Phase 8: Packaging

- [ ] **8.1** Create `electron-builder.yml` per `docs/PACKAGING.md`
  - Configure `extraResources` to bundle tectonic binary
- [ ] **8.2** Download Tectonic binaries for all target platforms
- [ ] **8.3** Build for current platform: `npm run package:{platform}`
- [ ] **8.4** Smoke test the packaged app:
  - Install on a clean machine (no TeX installed)
  - Open a .tex file, compile, verify PDF renders
- [ ] **8.5** Verify binary path resolution works in production mode
  (`process.resourcesPath` instead of project-root)

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

---

## Dependency Install Checklist

```bash
# Core
npm install electron react react-dom
npm install @monaco-editor/react react-pdf zustand
npm install tailwindcss postcss autoprefixer

# Dev
npm install -D electron-builder electron-vite
npm install -D typescript @types/react @types/react-dom
npm install -D eslint prettier
```
