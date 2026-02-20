# TextEx — File & Directory Structure

```
/textex (project root)
|
+-- docs/                          # Project documentation
|   +-- ARCHITECTURE.md            # System architecture & data flow
|   +-- CLI.md                     # CLI usage reference
|   +-- COMPILER_SERVICE.md        # Tectonic integration details
|   +-- DEVELOPMENT.md             # Setup, build, and dev commands
|   +-- FILE_STRUCTURE.md          # This file
|   +-- IPC_SPEC.md                # IPC channels, payloads, type definitions
|   +-- LICENSES.md                # Third-party license summary
|   +-- MCP.md                     # MCP server tools & config
|   +-- PACKAGING.md               # Build & distribution config
|   +-- SETTINGS.md                # Settings schema & formatting
|   +-- TECH_STACK.md              # Technology choices & rationale
|   +-- TODO.md                    # Implementation status & remaining tasks
|   +-- UI_SPEC.md                 # Component layout & behavior
|   +-- ZOTERO.md                  # Zotero/Better BibTeX integration
|
+-- resources/
|   +-- bin/                       # *** Sidecar binaries (per-platform) ***
|   |   +-- win/
|   |   |   +-- tectonic.exe       # Tectonic LaTeX compiler
|   |   |   +-- texlab.exe         # TexLab language server (GPL-3.0)
|   |   +-- mac/
|   |   |   +-- tectonic
|   |   |   +-- texlab
|   |   +-- linux/
|   |       +-- tectonic
|   |       +-- texlab
|   +-- licenses/                  # Third-party license files
|   |   +-- TEXLAB-GPL-3.0.txt    # Full GPL-3.0 license text
|   |   +-- TEXLAB-NOTICE.txt     # Attribution & aggregate notice
|   +-- dictionaries/             # Spell check dictionaries
|   +-- data/packages/            # LaTeX package metadata (macros, envs)
|
+-- src/
|   +-- main/                      # Electron Main process
|   |   +-- main.ts                # App entry: BrowserWindow creation, IPC init
|   |   +-- ipc.ts                 # Legacy IPC init (delegates to ipc/ handlers)
|   |   +-- compiler.ts            # Tectonic binary resolution, spawn, cancellation, PDF read
|   |   +-- texlab.ts              # TexLab process manager (singleton, stdio LSP, auto-restart)
|   |   +-- settings.ts            # User settings (theme, font, lspEnabled, texlabPath, etc.)
|   |   +-- bibparser.ts           # BibTeX file parsing
|   |   +-- spellcheck.ts          # Dictionary-based spell checking
|   |   +-- git.ts                 # Git CLI wrapper
|   |   +-- pandoc.ts              # Pandoc export
|   |   +-- synctex.ts             # SyncTeX forward/inverse navigation
|   |   +-- logparser.ts           # LaTeX compile log parsing
|   |   +-- labelscanner.ts        # \label{} extraction from project
|   |   +-- packageloader.ts       # LaTeX package data loading
|   |   +-- ai.ts                  # AI provider integration (OpenAI/Anthropic/Gemini)
|   |   +-- citgroups.ts           # Citation group management
|   |   +-- history.ts             # Local file history (snapshots, diff, restore)
|   |   +-- projectData.ts         # Project metadata persistence
|   |   +-- templateStore.ts       # Template management backend
|   |   +-- zotero.ts              # Zotero/Better BibTeX HTTP client
|   |   +-- ipc/                   # Domain-specific IPC handlers
|   |   |   +-- index.ts           # Handler registration hub
|   |   |   +-- ai.ts              # ai:* channel handlers
|   |   |   +-- bibliography.ts    # bib:* channel handlers
|   |   |   +-- compiler.ts        # latex:* channel handlers
|   |   |   +-- fileSystem.ts      # fs:* channel handlers
|   |   |   +-- git.ts             # git:* channel handlers
|   |   |   +-- lsp.ts             # lsp:* channel handlers
|   |   |   +-- misc.ts            # update:*, export:*, misc channels
|   |   |   +-- projectData.ts     # project:* channel handlers
|   |   |   +-- settings.ts        # settings:* channel handlers
|   |   |   +-- spellcheck.ts      # spell:* channel handlers
|   |   |   +-- synctex.ts         # synctex:* channel handlers
|   |   |   +-- templates.ts       # template:* channel handlers
|   |   +-- services/              # Backend services
|   |   |   +-- compileCache.ts    # Cached compilation results
|   |   |   +-- compileQueue.ts    # Sequential compile queue management
|   |   |   +-- fileCache.ts       # File content caching
|   |   +-- workers/               # Background worker threads
|   |   |   +-- logParserWorker.ts # Off-thread log parsing
|   |   |   +-- spellWorker.ts     # Off-thread spell checking
|   |   +-- utils/                 # Main process utilities
|   |   |   +-- index.ts           # Barrel export
|   |   |   +-- logParseUtils.ts   # Log parsing helpers
|   |   |   +-- pathValidation.ts  # File path validation & sanitization
|   |   |   +-- syncTexMath.ts     # SyncTeX math utilities
|   |   +-- types/
|   |       +-- nspell.d.ts        # Type declarations for nspell
|   |
|   +-- preload/                   # Context Bridge
|   |   +-- index.ts               # exposeInMainWorld: openFile, saveFile, compile, etc.
|   |
|   +-- renderer/                  # React application
|   |   +-- index.html             # Vite HTML entry (with CSP headers)
|   |   +-- main.tsx               # React root mount (wraps App in ErrorBoundary)
|   |   +-- App.tsx                # Top-level layout, keyboard shortcuts, compile logic
|   |   +-- constants.ts           # App-wide constants
|   |   +-- components/
|   |   |   +-- HomeScreen.tsx     # Landing page: search bar, slash commands, grid tiles
|   |   |   +-- DraftModal.tsx     # AI draft modal (supports initialPrompt prefill)
|   |   |   +-- EditorPane.tsx     # Monaco Editor wrapper (LaTeX, vs-dark theme)
|   |   |   +-- PreviewPane.tsx    # react-pdf viewer (Base64 -> Uint8Array -> PDF.js)
|   |   |   +-- previewUtils.ts    # Preview helper functions (extracted)
|   |   |   +-- PreviewErrorBoundary.tsx  # Error boundary for PDF preview
|   |   |   +-- Toolbar.tsx        # File actions + compile button + keyboard hints
|   |   |   +-- TabBar.tsx         # Multi-file tab bar
|   |   |   +-- LogPanel.tsx       # Collapsible compilation output (stdout+stderr)
|   |   |   +-- StatusBar.tsx      # Compile status dot + cursor position
|   |   |   +-- SettingsModal.tsx  # Tabbed settings modal shell
|   |   |   +-- ErrorBoundary.tsx  # React error boundary with reload UI
|   |   |   +-- UpdateNotification.tsx  # Auto-update notification banner
|   |   |   +-- FileTree.tsx       # Sidebar file tree with lazy loading
|   |   |   +-- GitPanel.tsx       # Git stage/unstage/commit/diff panel
|   |   |   +-- BibPanel.tsx       # Bibliography entries panel
|   |   |   +-- OutlinePanel.tsx   # Document outline (sections, labels)
|   |   |   +-- HistoryPanel.tsx   # Local file history with diff view
|   |   |   +-- HistoryPanel.css   # History panel styles
|   |   |   +-- TimelinePanel.tsx  # Timeline view of file changes
|   |   |   +-- TodoPanel.tsx      # Writing task tracker
|   |   |   +-- OmniSearch.tsx     # Unified search modal
|   |   |   +-- TemplateGallery.tsx # Document template browser (modal)
|   |   |   +-- PdfZoomDropdown.tsx # PDF zoom level control
|   |   |   +-- CitationTooltip.tsx # Hover tooltip for citations in PDF
|   |   |   +-- ImagePreviewTooltip.tsx  # Hover tooltip for image previews
|   |   |   +-- ImagePreviewTooltip.css  # Image tooltip styles
|   |   |   +-- MathPreviewWidget.tsx    # Live math equation preview
|   |   |   +-- MathPreviewWidget.css    # Math preview styles
|   |   |   +-- TableEditorModal.tsx     # Visual WYSIWYG table editor
|   |   |   +-- TableEditorModal.css     # Table editor styles
|   |   |   +-- bib/              # Bibliography sub-components
|   |   |   |   +-- BibEntryCard.tsx     # Individual bib entry display
|   |   |   |   +-- BibGroupHeader.tsx   # Citation group header
|   |   |   |   +-- BibPanelHeader.tsx   # Bib panel toolbar
|   |   |   +-- editor/           # Editor sub-components
|   |   |   |   +-- editorAiActions.ts   # AI context menu actions
|   |   |   |   +-- editorCodeLens.ts    # CodeLens (e.g., table editor trigger)
|   |   |   +-- home/             # Home screen sub-components
|   |   |   |   +-- RecentProjectList.tsx # Recent projects list
|   |   |   +-- omnisearch-panels/ # OmniSearch tab panels
|   |   |   |   +-- index.ts      # Barrel export
|   |   |   |   +-- types.ts      # Panel type definitions
|   |   |   |   +-- HomePanel.tsx  # Default search results panel
|   |   |   |   +-- TexSearchPanel.tsx    # Search within .tex files
|   |   |   |   +-- PdfSearchPanel.tsx    # Search within PDF content
|   |   |   |   +-- CitationSearchPanel.tsx # Search citations
|   |   |   |   +-- ZoteroSearchPanel.tsx   # Search Zotero library
|   |   |   +-- settings/         # Settings modal tab panels
|   |   |       +-- Toggle.tsx     # Reusable toggle switch
|   |   |       +-- GeneralTab.tsx # General preferences
|   |   |       +-- AppearanceTab.tsx # Theme, fonts, layout
|   |   |       +-- EditorTab.tsx  # Editor behavior settings
|   |   |       +-- AutomationTab.tsx # Auto-compile, format on save
|   |   |       +-- IntegrationsTab.tsx # Zotero, LSP, Pandoc
|   |   |       +-- AiTab.tsx     # AI provider configuration
|   |   +-- lsp/                   # Language Server Protocol client
|   |   |   +-- lspClient.ts       # LSP client (initialize, providers, notifications)
|   |   |   +-- LspServiceImpl.ts  # LSP service implementation
|   |   |   +-- types.ts           # LSP type definitions
|   |   |   +-- utils.ts           # LSP utility functions
|   |   |   +-- providers/         # Monaco LSP providers
|   |   |       +-- completionProvider.ts   # Auto-completion
|   |   |       +-- definitionProvider.ts   # Go-to-definition
|   |   |       +-- foldingProvider.ts      # Code folding
|   |   |       +-- formattingProvider.ts   # Document formatting
|   |   |       +-- hoverProvider.ts        # Hover documentation
|   |   |       +-- renameProvider.ts       # Symbol rename
|   |   |       +-- semanticTokensProvider.ts # Semantic highlighting
|   |   |       +-- symbolProvider.ts       # Document symbols
|   |   +-- store/                 # Zustand state management (6 split stores)
|   |   |   +-- useProjectStore.ts # File paths, project root, open files, tabs, dirty flags
|   |   |   +-- useEditorStore.ts  # Cursor, content, decorations, pending actions
|   |   |   +-- useCompileStore.ts # Compile status, logs, errors
|   |   |   +-- usePdfStore.ts     # PDF data, page, zoom, scroll position
|   |   |   +-- useSettingsStore.ts # Theme, font, preferences, integrations
|   |   |   +-- useUiStore.ts      # Sidebar, panels, modals, split ratio, layout
|   |   |   +-- selectors.ts      # Cross-store derived/composed selectors
|   |   +-- hooks/
|   |   |   +-- useAutoCompile.ts  # 1s debounced auto-compile on content change
|   |   |   +-- useFileOps.ts      # Open / save / save-as wrappers
|   |   |   +-- useBibAutoLoad.ts  # Auto-detect and load .bib files
|   |   |   +-- useCitationGroups.ts # Citation group management hook
|   |   |   +-- useClickOutside.ts # Click-outside detection
|   |   |   +-- useDisposable.ts   # Disposable resource cleanup
|   |   |   +-- useDragResize.ts   # Drag-to-resize split pane
|   |   |   +-- useGitAutoRefresh.ts # Periodic git status refresh
|   |   |   +-- useIpcListeners.ts # IPC event listener management
|   |   |   +-- useKeyboardShortcuts.ts # Global keyboard shortcut bindings
|   |   |   +-- useLspLifecycle.ts # LSP start/stop lifecycle management
|   |   |   +-- useSessionRestore.ts # Restore last session on startup
|   |   |   +-- editor/            # Editor-specific hooks
|   |   |   |   +-- useClickNavigation.ts    # Ctrl+Click navigation
|   |   |   |   +-- useCompletion.ts         # Monaco completion providers
|   |   |   |   +-- useContentChangeCoordinator.ts # Content change orchestration
|   |   |   |   +-- useDocumentSymbols.ts    # LSP symbols request
|   |   |   |   +-- useEditorCommands.ts     # Editor command palette
|   |   |   |   +-- useEditorDiagnostics.ts  # Monaco marker integration
|   |   |   |   +-- useHistoryPanel.ts       # History panel integration
|   |   |   |   +-- useMathPreview.ts        # Live math preview trigger
|   |   |   |   +-- usePackageDetection.ts   # LaTeX package extraction
|   |   |   |   +-- usePendingActions.ts     # Pending editor actions queue
|   |   |   |   +-- usePendingInsert.ts      # Pending text insertion
|   |   |   |   +-- usePendingJump.ts        # Jump to line + flash animation
|   |   |   |   +-- useSectionHighlight.ts   # Section gutter highlights
|   |   |   |   +-- useSmartImageDrop.ts     # Drag-and-drop image insertion
|   |   |   |   +-- useSpelling.ts           # Spell check integration
|   |   |   |   +-- useTableEditor.ts        # Visual table editor trigger
|   |   |   +-- preview/           # Preview-specific hooks
|   |   |       +-- useCitationTooltip.ts    # Citation hover tooltips
|   |   |       +-- useContainerSize.ts      # Container resize observer
|   |   |       +-- usePdfSearch.ts          # PDF text search
|   |   |       +-- usePreviewZoom.ts        # PDF zoom controls
|   |   |       +-- useScrollSync.ts         # Editor↔PDF scroll sync
|   |   |       +-- useSynctex.ts            # SyncTeX click-to-jump
|   |   +-- providers/
|   |   |   +-- hoverProvider.ts   # Math preview (KaTeX) & citation hover
|   |   +-- services/
|   |   |   +-- aiService.ts       # AI provider abstraction (OpenAI/Anthropic/Gemini)
|   |   |   +-- commandRegistry.ts # Slash command registry for OmniSearch
|   |   +-- data/
|   |   |   +-- snippets.ts        # ~50 LaTeX snippets for completion
|   |   |   +-- environments.ts    # LaTeX environments list
|   |   |   +-- templates.ts       # Document templates
|   |   |   +-- monacoConfig.ts    # Monaco editor configuration
|   |   +-- i18n/                  # Internationalization
|   |   |   +-- index.ts           # i18next setup
|   |   |   +-- locales/
|   |   |       +-- en.json        # English
|   |   |       +-- ko.json        # Korean
|   |   |       +-- es.json        # Spanish
|   |   |       +-- fr.json        # French
|   |   |       +-- de.json        # German
|   |   |       +-- pt.json        # Portuguese
|   |   |       +-- zh.json        # Chinese
|   |   +-- utils/                 # Renderer utility functions
|   |   |   +-- disposable.ts      # Disposable pattern implementation
|   |   |   +-- errorMessage.ts    # Error message formatting
|   |   |   +-- featureFlags.ts    # Feature flag management
|   |   |   +-- figureSnippet.ts   # LaTeX figure snippet generation
|   |   |   +-- formatter.ts      # Code formatting utilities
|   |   |   +-- gitStatus.ts       # Git status parsing
|   |   |   +-- imageExtensions.ts # Supported image file extensions
|   |   |   +-- openProject.ts     # Project opening logic
|   |   +-- types/
|   |   |   +-- api.d.ts           # Type declarations for window.api (ElectronAPI)
|   |   |   +-- mathlive.d.ts      # MathLive type declarations
|   |   |   +-- vite-env.d.ts      # Vite environment types
|   |   +-- styles/
|   |       +-- index.css          # Plain CSS -- theme variables, flexbox layout,
|   |                              #   modal classes, settings-* component styles
|   |
|   +-- cli/                       # CLI entry point
|   |   +-- index.ts               # commander setup, command routing
|   |   +-- commands/
|   |       +-- compile.ts         # textex compile <file.tex>
|   |       +-- init.ts            # textex init [template]
|   |       +-- export.ts          # textex export <file.tex> --format <fmt>
|   |       +-- templates.ts       # textex templates
|   |       +-- read.ts            # textex read <file.tex>
|   |       +-- edit.ts            # textex edit <file.tex>
|   |       +-- inspect.ts         # textex inspect <file.tex>
|   |       +-- outline.ts         # textex outline <file.tex>
|   |
|   +-- mcp/                       # MCP server
|   |   +-- server.ts              # stdio MCP server, tool definitions
|   |
|   +-- __tests__/                 # Unit tests (Vitest) — 133 tests, 9 files
|   |   +-- setup.ts               # Test setup (mocks, globals)
|   |   +-- shared/
|   |   |   +-- magicComments.test.ts      # Magic comment parsing tests
|   |   |   +-- structure.test.ts          # Document structure tests
|   |   |   +-- structure.perf.test.ts     # Structure parsing performance tests
|   |   |   +-- tableParser.test.ts        # Table parser tests
|   |   +-- store/
|   |   |   +-- useAppStore.test.ts        # Store tests (tests split stores)
|   |   +-- components/
|   |   |   +-- StatusBar.test.tsx         # StatusBar component tests
|   |   |   +-- Toolbar.test.tsx           # Toolbar component tests
|   |   +-- i18n/
|   |   |   +-- translations.test.ts      # Translation completeness tests
|   |   +-- main/
|   |       +-- CompilerSafeGuard.test.ts  # Compiler safety tests
|   |
|   +-- shared/                    # Shared logic, no Electron deps
|       +-- types.ts               # Shared type definitions
|       +-- ipcChannels.ts         # IPC channel name constants
|       +-- compiler.ts            # Tectonic binary resolution + spawn
|       +-- pandoc.ts              # Pandoc export
|       +-- lifecycle.ts           # App lifecycle utilities
|       +-- bibparser.ts           # BibTeX file parsing
|       +-- auxparser.ts           # .aux file parsing (labels, citations)
|       +-- tableParser.ts         # LaTeX table parsing for visual editor
|       +-- magicComments.ts       # %! TeX root magic comment parser
|       +-- structure.ts           # Document structure analysis
|       +-- templates.ts           # Template management
|
+-- out/                           # Build output (gitignored)
|   +-- main/index.js              # Compiled main process
|   +-- preload/index.js           # Compiled preload script
|   +-- renderer/                  # Compiled React app + assets
|
+-- electron.vite.config.ts        # electron-vite config (main, preload, renderer)
+-- electron-builder.yml           # Packaging config (extraResources, targets)
+-- package.json
+-- tsconfig.json                  # References tsconfig.node.json + tsconfig.web.json
+-- tsconfig.node.json             # Main + preload (Node target, ESNext)
+-- tsconfig.web.json              # Renderer (DOM + JSX, ESNext)
+-- tsconfig.cli.json              # CLI build config
+-- tsconfig.mcp.json              # MCP build config
+-- CLAUDE.md                      # Claude Code guidance
+-- .gitignore
+-- README.md
```

## Key Conventions

- **`resources/bin/`** -- Platform binaries are organized into `win/`, `mac/`, `linux/`
  sub-folders. `electron-builder` copies the correct folder at package time via
  `extraResources` with `${os}` interpolation.

- **`src/main/`** -- Pure Node.js / Electron code. No DOM, no React. Built as SSR
  environment by electron-vite.

- **`src/main/ipc/`** -- Domain-specific IPC handlers, one file per channel namespace.
  Registered by `ipc/index.ts`. Keeps `ipc.ts` (legacy) minimal.

- **`src/main/services/`** -- Stateful backend services (compile cache, queue, file cache)
  used by IPC handlers.

- **`src/main/workers/`** -- CPU-intensive tasks offloaded to worker threads
  (log parsing, spell checking).

- **`src/main/utils/`** -- Pure utility functions extracted from main modules
  (path validation, SyncTeX math, log parse helpers).

- **`src/preload/`** -- Runs in a special context with access to both `ipcRenderer`
  and a limited DOM environment. Must not import React or renderer code.

- **`src/renderer/`** -- Standard Vite + React app. Cannot access Node.js APIs
  directly; must go through `window.api` (defined by the preload script).

- **`store/`** -- Six split Zustand stores (project, editor, compile, PDF, settings, UI)
  with a `selectors.ts` for cross-store derived state. Prefer fine-grained selectors
  to avoid unnecessary re-renders.

- **`src/cli/`** -- Standalone CLI entry point. Uses `commander` for arg parsing.
  Imports only from `src/shared/`, never from `src/main/` or `src/renderer/`.
  No Electron dependencies. Commands: compile, init, export, templates, read, edit,
  inspect, outline.

- **`src/mcp/`** -- MCP server entry point. Uses `@modelcontextprotocol/sdk` with
  stdio transport. Imports only from `src/shared/`.

- **`src/shared/`** -- Pure Node.js logic with no Electron imports
  (`app`, `BrowserWindow`, `ipcMain`). Shared by `src/main/`, `src/cli/`,
  and `src/mcp/`. Contains compiler, pandoc, bibparser, auxparser, tableParser,
  magic comments, document structure, templates, IPC channel constants, lifecycle
  utilities, and shared types.

## Deviations from Original Plan

- **No Tailwind CSS** -- Tailwind v4 changed its PostCSS plugin to a separate
  `@tailwindcss/postcss` package with breaking config changes. Plain CSS with
  VS Code dark theme colors is used instead. All styling is in `index.css`.

- **No `vite.config.ts`** -- Replaced by `electron.vite.config.ts` which handles
  all three build targets (main, preload, renderer) in one config.

- **`tsconfig.web.json`** added -- Separate TypeScript config for the renderer
  (with DOM lib and JSX support), referenced from the root `tsconfig.json`.
