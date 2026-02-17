# TextEx — Implementation Status

**74 / 81 tasks complete** across 14 phases.

---

## Completed

### Phase 0: Project Bootstrap (7/7)
Electron + React + TypeScript project with electron-vite, plain CSS theming, full folder structure.

### Phase 1: Tectonic Binary Setup (5/5)
Bundled Tectonic 0.15.0 (musl) for Linux/macOS/Windows. Verified standalone compilation.

### Phase 2: Main Process — Compiler Service (3/3)
`compiler.ts` (Tectonic spawn, cancel, binary resolution), `ipc.ts` (fs/latex IPC handlers with path validation), `main.ts` (BrowserWindow with context isolation).

### Phase 3: Preload / Context Bridge (2/2)
`preload/index.ts` exposing `window.api` via contextBridge. Type declarations in `api.d.ts`.

### Phase 4: Zustand Store (1/1)
Single store with `subscribeWithSelector` middleware. File state, compile status, PDF data, logs, cursor, UI state.

### Phase 5: UI Components (7/7)
- **App.tsx** — flexbox split layout, keyboard shortcuts, IPC log listener
- **Toolbar** — Open/Save/Compile buttons with kbd hints, dirty indicator
- **EditorPane** — Monaco editor (latex language, word wrap, cursor tracking)
- **PreviewPane** — react-pdf with multi-page, zoom, scroll preservation, ResizeObserver
- **LogPanel** — collapsible monospace log with auto-scroll, auto-open on error
- **StatusBar** — compile status dot, cursor position, git branch, LSP indicator, spell toggle
- **ErrorBoundary** — catches render errors with reload button

### Phase 6: Auto-Compile & Keyboard Shortcuts (3/3)
`useAutoCompile` hook (1s debounce, auto-save, cancel handling), `useFileOps` hook, `Ctrl+O/S/Shift+S/Enter/L` shortcuts.

### Phase 8: Packaging (4/5)
electron-builder config (NSIS/DMG/AppImage), Tectonic binaries for all platforms, Linux AppImage verified, binary path resolution confirmed for dev/prod.

### Phase 9: Polish (16/16)
- **Draggable split-pane** — splitRatio store state, drag resize, double-click reset
- **PDF zoom** — 25–400% range, keyboard shortcuts, fit width
- **Themes** — dark/light/high-contrast via CSS custom properties, persisted
- **SyncTeX** — forward sync (editor→PDF) and inverse sync (Ctrl+Click PDF→editor)
- **Multi-file projects** — FileTree sidebar with lazy loading, TabBar with multi-tab
- **Snippet/template gallery** — ~50 LaTeX snippets, 5 document templates
- **Auto-update** — electron-updater with notification banner
- **CI/CD** — GitHub Actions matrix (Linux, macOS x64/arm64, Windows), tag-triggered
- **App icons** — icon.png/ico/icns
- **ESLint + Prettier** — v9 flat config, typescript-eslint, format scripts
- **Unit tests** — Vitest + @testing-library/react, 53 tests across 3 files
- **Font size setting** — Ctrl+Shift+=/- shortcuts, persisted, 8–32px range
- **BibTeX support** — .bib parser, BibPanel sidebar, \cite{} completion
- **Git integration** — git.ts backend, GitPanel (stage/unstage/commit), branch in status bar
- **Spell checker** — dictionary-based (en-US), Monaco markers + code actions, toggle
- **Export** — pandoc backend for HTML/DOCX/ODT/EPUB via toolbar dropdown

### Phase 10: CLI (9/10)
`textex compile`, `textex init`, `textex export`, `textex templates` commands. Shared compiler/pandoc logic in `src/shared/`. Watch mode via chokidar.

### Phase 11: MCP Server (5/5)
`@modelcontextprotocol/sdk` stdio server with `compile_latex` and `get_compile_log` tools. Documented for Claude Desktop.

### Phase 12: TexLab LSP Integration (15/15)
- **TexLabManager** — binary resolution (bundled/custom/PATH), stdio LSP parsing, auto-restart with backoff
- **IPC bridge** — `lsp:start/stop/send/status` handlers, `lsp:message/status-change` push channels
- **Preload** — 8 LSP methods on `window.api`
- **LSP client** — lightweight JSON-RPC client, initialize handshake, Monaco providers (completion, hover, definition, symbols, rename, formatting, folding range), diagnostics routing
- **App lifecycle** — start/stop on projectRoot change, debounced didChange, didOpen/didClose on file switch
- **GPL compliance** — TEXLAB-NOTICE.txt, TEXLAB-GPL-3.0.txt, extraResources in builder
- **Binaries** — TexLab v5.25.1 for Linux/macOS/Windows (x86_64)

### Phase 13: IDE Features (5/5)
- **Magic comment parsing** — `%! TeX root = ./main.tex` support in `src/shared/magicComments.ts`; IPC handler resolves root file before compiling
- **LSP code folding** — `foldingRange` capability + provider registration in `lspClient.ts`; folds sections, environments, comments
- **Inverse search flash** — yellow fade-out line decoration in `usePendingJump.ts` on PDF→source jumps
- **Enhanced Problems Panel** — diagnostics grouped by file with collapsible headers, severity filter buttons, problem count in tab label
- **Semantic Highlighting** — `semanticTokens` LSP capability for rich syntax coloring (macros, environments, math)

### Phase 14: Preferences & Formatting (5/5)
- **Settings Store** — `localStorage` persistence, typed settings object, immediate apply
- **Settings Modal** — UI for theme, font size, editor options, system toggles
- **Prettier Integration** — `prettier/standalone` + `prettier-plugin-latex` for code formatting
- **Format on Save** — auto-format on save based on settings
- **Editor Integration** — dynamic font size/word wrap/theme updates

---

## Remaining (7 tasks)

| Task | Status | Blocker |
|------|--------|---------|
| **7.1–7.5** Integration tests (5 tasks) | Pending | Requires display server (X11/Wayland) |
| **8.4** Smoke test packaged app | Pending | Requires desktop environment |
| **10.10** CLI unit tests | Pending | — |
