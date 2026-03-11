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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    setTheme: vi.fn(),
    updateRecentProject: vi.fn().mockResolvedValue({}),

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
    getExportFormats: vi.fn(),

    // AI
    aiGenerate: vi.fn(),
    aiSaveApiKey: vi.fn(),
    aiHasApiKey: vi.fn().mockResolvedValue(false),
    aiProcess: vi.fn(),

    // Labels / Packages / External
    scanLabels: vi.fn(),
    loadPackageData: vi.fn(),
    openExternal: vi.fn(),

    // LSP
    lspStart: vi.fn(),
    lspStop: vi.fn(),
    lspSend: vi.fn(),
    lspStatus: vi.fn(),
    onLspMessage: vi.fn(),
    removeLspMessageListener: vi.fn(),
    onLspStatus: vi.fn(),
    removeLspStatusListener: vi.fn(),

    // Zotero
    zoteroProbe: vi.fn(),
    zoteroSearch: vi.fn(),
    zoteroCiteCAYW: vi.fn(),
    zoteroExportBibtex: vi.fn(),

    // Citation groups / history / templates / project data
    loadCitationGroups: vi.fn(),
    saveCitationGroups: vi.fn(),
    saveHistorySnapshot: vi.fn(),
    getHistoryList: vi.fn(),
    loadHistorySnapshot: vi.fn(),
    listTemplates: vi.fn(),
    addTemplate: vi.fn(),
    removeTemplate: vi.fn(),
    importTemplateZip: vi.fn(),
    projectInit: vi.fn(),
    projectExists: vi.fn(),
    projectLoad: vi.fn(),
    projectSave: vi.fn(),
    projectTouch: vi.fn(),
    projectCompileLoad: vi.fn(),
    projectCompileSave: vi.fn(),
    projectCompileClear: vi.fn(),
    projectCompileLogSave: vi.fn(),
    projectCompileLogLoad: vi.fn(),
    projectSnippetsLoad: vi.fn(),
    projectSnippetsAdd: vi.fn(),
    projectSnippetsRemove: vi.fn(),
    projectBookmarksLoad: vi.fn(),
    projectBookmarksAdd: vi.fn(),
    projectBookmarksRemove: vi.fn(),
    getDocumentOutline: vi.fn()
  },
  writable: true
})
