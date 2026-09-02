import '@testing-library/jest-dom/vitest'

// jsdom does not implement ResizeObserver — provide a minimal stub.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).ResizeObserver = ResizeObserverStub
}

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
    writeFileBinary: vi.fn(),
    saveFileAs: vi.fn(),
    compile: vi.fn(),
    tectonicCacheStatus: vi.fn(),
    tectonicCacheReset: vi.fn(),
    exportOverleafZip: vi.fn(),
    runSubmissionCheck: vi.fn(),
    onCompileLog: vi.fn(),
    removeCompileLogListener: vi.fn(),
    onDiagnostics: vi.fn(),
    removeDiagnosticsListener: vi.fn(),
    synctexForward: vi.fn(),
    synctexInverse: vi.fn(),

    // Multi-file / directory operations
    readFile: vi.fn(),
    readCompiledPdf: vi.fn(),
    createDirectory: vi.fn(),
    openDirectory: vi.fn(),
    activateProject: vi.fn(async (projectPath: string) => projectPath),
    getActiveProject: vi.fn().mockResolvedValue(null),
    deactivateProject: vi.fn(),
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
    gitRemoteStatus: vi.fn(),
    gitFetch: vi.fn(),
    gitPull: vi.fn(),
    gitPush: vi.fn(),
    gitStage: vi.fn(),
    gitUnstage: vi.fn(),
    gitCommit: vi.fn(),
    gitFileLog: vi.fn(),

    // Auto-update
    updateCheck: vi.fn().mockResolvedValue({ success: true, update: null }),
    updateDownload: vi.fn().mockResolvedValue({ success: true }),
    updateInstall: vi.fn().mockResolvedValue({ success: true }),
    onAppCommand: vi.fn(),
    removeAppCommandListener: vi.fn(),
    minimizeWindow: vi.fn().mockResolvedValue(undefined),
    toggleMaximizeWindow: vi.fn().mockResolvedValue(undefined),
    startWindowDragging: vi.fn().mockResolvedValue(undefined),
    startWindowResize: vi.fn().mockResolvedValue(undefined),
    hideWindow: vi.fn().mockResolvedValue(undefined),
    requestWindowClose: vi.fn().mockResolvedValue(undefined),
    exitApp: vi.fn(),
    onWindowCloseRequested: vi.fn(),
    removeWindowCloseRequestedListener: vi.fn(),

    // Export
    exportDocument: vi.fn(),

    // AI
    aiGenerate: vi.fn(),
    aiSaveApiKey: vi.fn(),
    aiHasApiKey: vi.fn().mockResolvedValue(false),
    aiProcess: vi.fn(),
    aiProcessCustom: vi.fn(),
    aiResearchChat: vi.fn(),
    aiCancelResearchChat: vi.fn().mockResolvedValue(true),
    aiPlanZotero: vi.fn(),
    aiUpdateContext: vi.fn(),
    aiCheckCli: vi.fn().mockResolvedValue({ available: false }),
    aiCheckCodexCli: vi.fn().mockResolvedValue({ available: false }),
    aiOpenClaudeTerminal: vi.fn(),
    aiOpenCodexTerminal: vi.fn(),

    // Labels / Packages / External
    scanLabels: vi.fn(),
    scanCitations: vi.fn().mockResolvedValue([]),
    loadPackageData: vi.fn(),
    openExternal: vi.fn(),
    openProjectTerminal: vi.fn().mockResolvedValue({ success: true }),
    getPerformanceMemory: vi.fn().mockResolvedValue({
      sampledAtEpochMs: 0,
      totalWorkingSetKiB: 0,
      totalPrivateKiB: 0,
      processes: []
    }),

    // Zotero
    zoteroProbe: vi.fn(),
    zoteroSearch: vi.fn(),
    zoteroSyncCollection: vi.fn(),
    zoteroLibraryTree: vi.fn().mockResolvedValue([]),
    zoteroCollectionItems: vi.fn().mockResolvedValue({
      items: [],
      totalResults: 0,
      offset: 0,
      limit: 50
    }),
    zoteroOpenItem: vi.fn().mockResolvedValue({ success: true }),
    zoteroItemDetail: vi
      .fn()
      .mockResolvedValue({ itemKey: '', abstract: null, publication: null, url: null }),
    zoteroAddToProject: vi.fn(),
    zoteroSaveOnline: vi.fn(),
    zoteroApplyMutationPlan: vi.fn(),
    researchSearchOnline: vi.fn().mockResolvedValue([]),
    researchAddOnline: vi.fn(),
    researchLoadConfig: vi.fn().mockResolvedValue({
      version: 1,
      referencesFile: 'references.bib',
      zoteroFile: 'zotero.bib',
      zoteroCollection: null
    }),
    researchSaveConfig: vi.fn(),
    researchProfileLoad: vi.fn().mockResolvedValue({
      version: 1,
      paper: { title: '', authors: [] },
      resources: [],
      instructions: []
    }),
    researchProfileSave: vi.fn(),
    researchChatSessionLoad: vi.fn().mockResolvedValue({
      projectRoot: '/project',
      projectEpoch: '1',
      revision: '0',
      session: { version: 1, messages: [], selectedContexts: [] }
    }),
    researchChatSessionSave: vi.fn().mockImplementation(async (scope, session) => ({
      ...scope,
      revision: String(Number(scope.revision) + 1),
      session
    })),
    researchChatSessionClear: vi.fn().mockImplementation(async (scope) => ({
      ...scope,
      revision: String(Number(scope.revision) + 1),
      session: { version: 1, messages: [], selectedContexts: [] }
    })),
    researchSourceIndex: vi.fn(),
    researchSourceClone: vi.fn(),
    researchSourceFetch: vi.fn(),
    // Citation groups / history / templates / project data
    loadCitationGroups: vi.fn(),
    saveCitationGroups: vi.fn(),
    getHistoryList: vi.fn(),
    loadHistorySnapshot: vi.fn(),
    saveRecoverySnapshot: vi.fn(),
    listRecoverySnapshots: vi.fn().mockResolvedValue([]),
    loadRecoverySnapshot: vi.fn(),
    discardRecoverySnapshot: vi.fn(),
    clearRecoverySnapshot: vi.fn(),
    listTemplates: vi.fn(),
    addTemplate: vi.fn(),
    removeTemplate: vi.fn(),
    importTemplateZip: vi.fn(),
    getDocumentOutline: vi.fn().mockResolvedValue([])
  },
  writable: true
})
