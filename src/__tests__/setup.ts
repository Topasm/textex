import '@testing-library/jest-dom'

// Mock window.api for all tests
Object.defineProperty(window, 'api', {
  value: {
    // File operations (original)
    openFile: vi.fn(),
    saveFile: vi.fn(),
    saveFileAs: vi.fn(),
    compile: vi.fn(),
    cancelCompile: vi.fn(),
    onCompileLog: vi.fn(),
    removeCompileLogListener: vi.fn(),
    onDiagnostics: vi.fn(),
    removeDiagnosticsListener: vi.fn(),
    synctexForward: vi.fn(),
    synctexInverse: vi.fn(),

    // Multi-file / directory operations
    readFile: vi.fn(),
    openDirectory: vi.fn(),
    readDirectory: vi.fn(),
    watchDirectory: vi.fn(),
    unwatchDirectory: vi.fn(),
    onDirectoryChanged: vi.fn(),
    removeDirectoryChangedListener: vi.fn(),

    // Settings
    loadSettings: vi.fn().mockResolvedValue({
      theme: 'dark',
      fontSize: 14,
      autoCompile: true,
      spellCheckEnabled: false,
      spellCheckLanguage: 'en-US',
      gitEnabled: true,
      autoUpdateEnabled: true
    }),
    saveSettings: vi.fn(),

    // BibTeX
    parseBibFile: vi.fn(),
    findBibInProject: vi.fn(),

    // Spell check
    spellInit: vi.fn(),
    spellCheck: vi.fn().mockResolvedValue([]),
    spellSuggest: vi.fn().mockResolvedValue([]),
    spellAddWord: vi.fn(),
    spellSetLanguage: vi.fn(),

    // Git
    gitIsRepo: vi.fn(),
    gitInit: vi.fn(),
    gitStatus: vi.fn(),
    gitStage: vi.fn(),
    gitUnstage: vi.fn(),
    gitCommit: vi.fn(),
    gitDiff: vi.fn(),
    gitLog: vi.fn(),

    // Auto-update
    updateCheck: vi.fn(),
    updateDownload: vi.fn(),
    updateInstall: vi.fn(),
    onUpdateEvent: vi.fn(),
    removeUpdateListeners: vi.fn(),

    // Export
    exportDocument: vi.fn(),
    getExportFormats: vi.fn()
  },
  writable: true
})
