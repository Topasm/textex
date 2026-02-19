import '@testing-library/jest-dom'

// Mock react-i18next to avoid dual React instance issue in tests.
// The real react-i18next resolves React from the parent node_modules while
// test components use the local copy, causing "Invalid hook call" errors.
vi.mock('react-i18next', async () => {
  const i18next = await import('i18next')
  const i18n = i18next.default
  const React = await import('react')

  return {
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
      t: i18n.t.bind(i18n),
      i18n,
      ready: true
    }),
    withTranslation: () => (Component: React.ComponentType<any>) => {
      const Wrapped = (props: Record<string, unknown>) =>
        React.createElement(Component, { ...props, t: i18n.t.bind(i18n), i18n, tReady: true })
      Wrapped.displayName = `withTranslation(${Component.displayName || Component.name})`
      return Wrapped
    },
    I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
    Trans: ({ children }: { children: React.ReactNode }) => children
  }
})

import '../renderer/i18n'

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
      autoUpdateEnabled: true,
      lineNumbers: true,
      minimap: false,
      tabSize: 4,
      recentProjects: []
    }),
    saveSettings: vi.fn(),
    addRecentProject: vi.fn().mockResolvedValue({}),
    removeRecentProject: vi.fn().mockResolvedValue({}),

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
