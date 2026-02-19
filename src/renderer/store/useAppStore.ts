/**
 * Facade store: composes all domain stores into a single unified interface.
 *
 * Components can continue importing useAppStore as before. Under the hood,
 * all state and actions are delegated to the domain-specific stores:
 *   - useEditorStore   (file state, cursor, tabs, navigation)
 *   - useCompileStore  (compile status, PDF, logs, diagnostics)
 *   - useProjectStore  (project root, directory tree, sidebar, bib, git)
 *   - usePdfStore      (zoom, split ratio, synctex, PDF search)
 *   - useUiStore       (modals, update, export, LSP, symbols, cite search)
 *   - useSettingsStore  (all user settings)
 *
 * New code should import from domain stores directly when possible.
 */
import { useEditorStore } from './useEditorStore'
import { useCompileStore } from './useCompileStore'
import type { CompileStatus } from './useCompileStore'
import { useProjectStore } from './useProjectStore'
import type { SidebarView } from './useProjectStore'
import { usePdfStore } from './usePdfStore'
import { useUiStore } from './useUiStore'
import type { UpdateStatus, ExportStatus, LspStatus } from './useUiStore'
import { useSettingsStore } from './useSettingsStore'
import type { UserSettings } from '../../shared/types'

// Re-export domain stores for direct access
export { useEditorStore } from './useEditorStore'
export { useCompileStore } from './useCompileStore'
export { useProjectStore } from './useProjectStore'
export { usePdfStore } from './usePdfStore'
export { useUiStore } from './useUiStore'
export { useSettingsStore } from './useSettingsStore'

// Re-export types
export type { UserSettings }
export type { CompileStatus }
export type { SidebarView }
export type { UpdateStatus, ExportStatus, LspStatus }
export type Theme = UserSettings['theme']

/**
 * Composed state type that unifies all domain stores.
 */
type ComposedState = ReturnType<typeof getComposedState>

function getComposedState() {
  const editor = useEditorStore.getState()
  const compile = useCompileStore.getState()
  const project = useProjectStore.getState()
  const pdf = usePdfStore.getState()
  const ui = useUiStore.getState()
  const settingsStore = useSettingsStore.getState()

  return {
    // Editor
    filePath: editor.filePath,
    content: editor.content,
    isDirty: editor.isDirty,
    openFiles: editor.openFiles,
    activeFilePath: editor.activeFilePath,
    cursorLine: editor.cursorLine,
    cursorColumn: editor.cursorColumn,
    pendingJump: editor.pendingJump,
    _sessionOpenPaths: editor._sessionOpenPaths,
    _sessionActiveFile: editor._sessionActiveFile,

    // Editor actions
    setContent: editor.setContent,
    setFilePath: editor.setFilePath,
    setDirty: editor.setDirty,
    openFileInTab: editor.openFileInTab,
    closeTab: editor.closeTab,
    setActiveTab: editor.setActiveTab,
    setCursorPosition: editor.setCursorPosition,
    requestJumpToLine: editor.requestJumpToLine,
    clearPendingJump: editor.clearPendingJump,

    // Compile
    compileStatus: compile.compileStatus,
    pdfPath: compile.pdfPath,
    pdfRevision: compile.pdfRevision,
    logs: compile.logs,
    isLogPanelOpen: compile.isLogPanelOpen,
    diagnostics: compile.diagnostics,
    logViewMode: compile.logViewMode,

    // Compile actions
    setCompileStatus: compile.setCompileStatus,
    setPdfPath: compile.setPdfPath,
    appendLog: compile.appendLog,
    clearLogs: compile.clearLogs,
    toggleLogPanel: compile.toggleLogPanel,
    setLogPanelOpen: compile.setLogPanelOpen,
    setDiagnostics: compile.setDiagnostics,
    setLogViewMode: compile.setLogViewMode,

    // Project
    projectRoot: project.projectRoot,
    directoryTree: project.directoryTree,
    isSidebarOpen: project.isSidebarOpen,
    sidebarView: project.sidebarView,
    sidebarWidth: project.sidebarWidth,
    bibEntries: project.bibEntries,
    citationGroups: project.citationGroups,
    labels: project.labels,
    packageData: project.packageData,
    detectedPackages: project.detectedPackages,
    isGitRepo: project.isGitRepo,
    gitBranch: project.gitBranch,
    gitStatus: project.gitStatus,

    // Project actions
    setProjectRoot: project.setProjectRoot,
    setDirectoryTree: project.setDirectoryTree,
    toggleSidebar: project.toggleSidebar,
    setSidebarView: project.setSidebarView,
    setSidebarWidth: project.setSidebarWidth,
    setBibEntries: project.setBibEntries,
    setCitationGroups: project.setCitationGroups,
    setLabels: project.setLabels,
    setPackageData: project.setPackageData,
    setDetectedPackages: project.setDetectedPackages,
    setIsGitRepo: project.setIsGitRepo,
    setGitBranch: project.setGitBranch,
    setGitStatus: project.setGitStatus,

    // PDF
    splitRatio: pdf.splitRatio,
    zoomLevel: pdf.zoomLevel,
    synctexHighlight: pdf.synctexHighlight,
    pdfSearchVisible: pdf.pdfSearchVisible,
    pdfSearchQuery: pdf.pdfSearchQuery,
    syncToCodeRequest: pdf.syncToCodeRequest,

    // PDF actions
    setSplitRatio: pdf.setSplitRatio,
    setZoomLevel: pdf.setZoomLevel,
    zoomIn: pdf.zoomIn,
    zoomOut: pdf.zoomOut,
    resetZoom: pdf.resetZoom,
    setSynctexHighlight: pdf.setSynctexHighlight,
    setPdfSearchVisible: pdf.setPdfSearchVisible,
    setPdfSearchQuery: pdf.setPdfSearchQuery,
    triggerSyncToCode: pdf.triggerSyncToCode,

    // UI
    isDraftModalOpen: ui.isDraftModalOpen,
    isTemplateGalleryOpen: ui.isTemplateGalleryOpen,
    updateStatus: ui.updateStatus,
    updateVersion: ui.updateVersion,
    updateProgress: ui.updateProgress,
    exportStatus: ui.exportStatus,
    lspStatus: ui.lspStatus,
    lspError: ui.lspError,
    documentSymbols: ui.documentSymbols,
    citeSearchFocusRequested: ui.citeSearchFocusRequested,

    // UI actions
    setDraftModalOpen: ui.setDraftModalOpen,
    toggleDraftModal: ui.toggleDraftModal,
    toggleTemplateGallery: ui.toggleTemplateGallery,
    setTemplateGalleryOpen: ui.setTemplateGalleryOpen,
    setUpdateStatus: ui.setUpdateStatus,
    setUpdateVersion: ui.setUpdateVersion,
    setUpdateProgress: ui.setUpdateProgress,
    setExportStatus: ui.setExportStatus,
    setLspStatus: ui.setLspStatus,
    setLspError: ui.setLspError,
    setDocumentSymbols: ui.setDocumentSymbols,
    requestCiteSearchFocus: ui.requestCiteSearchFocus,
    clearCiteSearchFocus: ui.clearCiteSearchFocus,

    // Settings
    settings: settingsStore.settings,
    updateSetting: settingsStore.updateSetting,
    increaseFontSize: settingsStore.increaseFontSize,
    decreaseFontSize: settingsStore.decreaseFontSize,

    // Composite actions
    closeProject: () => {
      useEditorStore.setState({
        filePath: null,
        content: '',
        isDirty: false,
        openFiles: {},
        activeFilePath: null,
        cursorLine: 1,
        cursorColumn: 1,
        pendingJump: null,
        _sessionOpenPaths: [],
        _sessionActiveFile: null
      })
      useCompileStore.setState({
        compileStatus: 'idle',
        pdfPath: null,
        pdfRevision: 0,
        logs: '',
        isLogPanelOpen: false,
        diagnostics: []
      })
      useProjectStore.setState({
        projectRoot: null,
        directoryTree: null,
        isGitRepo: false,
        gitBranch: '',
        gitStatus: null,
        bibEntries: [],
        citationGroups: [],
        labels: [],
        packageData: {},
        detectedPackages: []
      })
      usePdfStore.setState({
        pdfSearchVisible: false,
        pdfSearchQuery: '',
        synctexHighlight: null
      })
      useUiStore.setState({
        lspStatus: 'stopped',
        lspError: null,
        documentSymbols: []
      })
    }
  }
}

/**
 * Facade hook: subscribe to composed state from all domain stores.
 *
 * Supports both selector-based usage:
 *   const filePath = useAppStore((s) => s.filePath)
 *
 * And static access:
 *   useAppStore.getState().setContent('...')
 *   useAppStore.subscribe(...)
 */
function useAppStoreFn<T>(selector: (state: ComposedState) => T): T {
  // Subscribe to all domain stores and compose
  const editorSlice = useEditorStore((s) => s)
  const compileSlice = useCompileStore((s) => s)
  const projectSlice = useProjectStore((s) => s)
  const pdfSlice = usePdfStore((s) => s)
  const uiSlice = useUiStore((s) => s)
  const settingsSlice = useSettingsStore((s) => s)

  const composed: ComposedState = {
    // Editor
    filePath: editorSlice.filePath,
    content: editorSlice.content,
    isDirty: editorSlice.isDirty,
    openFiles: editorSlice.openFiles,
    activeFilePath: editorSlice.activeFilePath,
    cursorLine: editorSlice.cursorLine,
    cursorColumn: editorSlice.cursorColumn,
    pendingJump: editorSlice.pendingJump,
    _sessionOpenPaths: editorSlice._sessionOpenPaths,
    _sessionActiveFile: editorSlice._sessionActiveFile,
    setContent: editorSlice.setContent,
    setFilePath: editorSlice.setFilePath,
    setDirty: editorSlice.setDirty,
    openFileInTab: editorSlice.openFileInTab,
    closeTab: editorSlice.closeTab,
    setActiveTab: editorSlice.setActiveTab,
    setCursorPosition: editorSlice.setCursorPosition,
    requestJumpToLine: editorSlice.requestJumpToLine,
    clearPendingJump: editorSlice.clearPendingJump,

    // Compile
    compileStatus: compileSlice.compileStatus,
    pdfPath: compileSlice.pdfPath,
    pdfRevision: compileSlice.pdfRevision,
    logs: compileSlice.logs,
    isLogPanelOpen: compileSlice.isLogPanelOpen,
    diagnostics: compileSlice.diagnostics,
    logViewMode: compileSlice.logViewMode,
    setCompileStatus: compileSlice.setCompileStatus,
    setPdfPath: compileSlice.setPdfPath,
    appendLog: compileSlice.appendLog,
    clearLogs: compileSlice.clearLogs,
    toggleLogPanel: compileSlice.toggleLogPanel,
    setLogPanelOpen: compileSlice.setLogPanelOpen,
    setDiagnostics: compileSlice.setDiagnostics,
    setLogViewMode: compileSlice.setLogViewMode,

    // Project
    projectRoot: projectSlice.projectRoot,
    directoryTree: projectSlice.directoryTree,
    isSidebarOpen: projectSlice.isSidebarOpen,
    sidebarView: projectSlice.sidebarView,
    sidebarWidth: projectSlice.sidebarWidth,
    bibEntries: projectSlice.bibEntries,
    citationGroups: projectSlice.citationGroups,
    labels: projectSlice.labels,
    packageData: projectSlice.packageData,
    detectedPackages: projectSlice.detectedPackages,
    isGitRepo: projectSlice.isGitRepo,
    gitBranch: projectSlice.gitBranch,
    gitStatus: projectSlice.gitStatus,
    setProjectRoot: projectSlice.setProjectRoot,
    setDirectoryTree: projectSlice.setDirectoryTree,
    toggleSidebar: projectSlice.toggleSidebar,
    setSidebarView: projectSlice.setSidebarView,
    setSidebarWidth: projectSlice.setSidebarWidth,
    setBibEntries: projectSlice.setBibEntries,
    setCitationGroups: projectSlice.setCitationGroups,
    setLabels: projectSlice.setLabels,
    setPackageData: projectSlice.setPackageData,
    setDetectedPackages: projectSlice.setDetectedPackages,
    setIsGitRepo: projectSlice.setIsGitRepo,
    setGitBranch: projectSlice.setGitBranch,
    setGitStatus: projectSlice.setGitStatus,

    // PDF
    splitRatio: pdfSlice.splitRatio,
    zoomLevel: pdfSlice.zoomLevel,
    synctexHighlight: pdfSlice.synctexHighlight,
    pdfSearchVisible: pdfSlice.pdfSearchVisible,
    pdfSearchQuery: pdfSlice.pdfSearchQuery,
    syncToCodeRequest: pdfSlice.syncToCodeRequest,
    setSplitRatio: pdfSlice.setSplitRatio,
    setZoomLevel: pdfSlice.setZoomLevel,
    zoomIn: pdfSlice.zoomIn,
    zoomOut: pdfSlice.zoomOut,
    resetZoom: pdfSlice.resetZoom,
    setSynctexHighlight: pdfSlice.setSynctexHighlight,
    setPdfSearchVisible: pdfSlice.setPdfSearchVisible,
    setPdfSearchQuery: pdfSlice.setPdfSearchQuery,
    triggerSyncToCode: pdfSlice.triggerSyncToCode,

    // UI
    isDraftModalOpen: uiSlice.isDraftModalOpen,
    isTemplateGalleryOpen: uiSlice.isTemplateGalleryOpen,
    updateStatus: uiSlice.updateStatus,
    updateVersion: uiSlice.updateVersion,
    updateProgress: uiSlice.updateProgress,
    exportStatus: uiSlice.exportStatus,
    lspStatus: uiSlice.lspStatus,
    lspError: uiSlice.lspError,
    documentSymbols: uiSlice.documentSymbols,
    citeSearchFocusRequested: uiSlice.citeSearchFocusRequested,
    setDraftModalOpen: uiSlice.setDraftModalOpen,
    toggleDraftModal: uiSlice.toggleDraftModal,
    toggleTemplateGallery: uiSlice.toggleTemplateGallery,
    setTemplateGalleryOpen: uiSlice.setTemplateGalleryOpen,
    setUpdateStatus: uiSlice.setUpdateStatus,
    setUpdateVersion: uiSlice.setUpdateVersion,
    setUpdateProgress: uiSlice.setUpdateProgress,
    setExportStatus: uiSlice.setExportStatus,
    setLspStatus: uiSlice.setLspStatus,
    setLspError: uiSlice.setLspError,
    setDocumentSymbols: uiSlice.setDocumentSymbols,
    requestCiteSearchFocus: uiSlice.requestCiteSearchFocus,
    clearCiteSearchFocus: uiSlice.clearCiteSearchFocus,

    // Settings
    settings: settingsSlice.settings,
    updateSetting: settingsSlice.updateSetting,
    increaseFontSize: settingsSlice.increaseFontSize,
    decreaseFontSize: settingsSlice.decreaseFontSize,

    // Composite actions
    closeProject: getComposedState().closeProject
  }

  return selector(composed)
}

// Build the subscribe method that dispatches to domain stores
type Listener = (state: ComposedState, prevState: ComposedState) => void
function subscribeComposed(listener: Listener): () => void
function subscribeComposed<T>(
  selector: (state: ComposedState) => T,
  listener: (slice: T, prevSlice: T) => void,
  options?: { fireImmediately?: boolean; equalityFn?: (a: T, b: T) => boolean }
): () => void
function subscribeComposed<T>(
  selectorOrListener: ((state: ComposedState) => T) | Listener,
  listener?: (slice: T, prevSlice: T) => void,
  options?: { fireImmediately?: boolean; equalityFn?: (a: T, b: T) => boolean }
): () => void {
  if (!listener) {
    // Simple subscribe(listener)
    const cb = selectorOrListener as Listener
    let prev = getComposedState()
    const unsubs = [
      useEditorStore.subscribe(() => {
        const next = getComposedState()
        cb(next, prev)
        prev = next
      }),
      useCompileStore.subscribe(() => {
        const next = getComposedState()
        cb(next, prev)
        prev = next
      }),
      useProjectStore.subscribe(() => {
        const next = getComposedState()
        cb(next, prev)
        prev = next
      }),
      usePdfStore.subscribe(() => {
        const next = getComposedState()
        cb(next, prev)
        prev = next
      }),
      useUiStore.subscribe(() => {
        const next = getComposedState()
        cb(next, prev)
        prev = next
      }),
      useSettingsStore.subscribe(() => {
        const next = getComposedState()
        cb(next, prev)
        prev = next
      })
    ]
    return () => unsubs.forEach((u) => u())
  }

  // Subscribe with selector: subscribe(selector, listener, options?)
  const selector = selectorOrListener as (state: ComposedState) => T
  const equalityFn = options?.equalityFn ?? Object.is
  let prevSlice = selector(getComposedState())

  if (options?.fireImmediately) {
    listener(prevSlice, prevSlice)
  }

  const handler = () => {
    const nextSlice = selector(getComposedState())
    if (!equalityFn(prevSlice, nextSlice)) {
      const prev = prevSlice
      prevSlice = nextSlice
      listener(nextSlice, prev)
    }
  }

  const unsubs = [
    useEditorStore.subscribe(handler),
    useCompileStore.subscribe(handler),
    useProjectStore.subscribe(handler),
    usePdfStore.subscribe(handler),
    useUiStore.subscribe(handler),
    useSettingsStore.subscribe(handler)
  ]
  return () => unsubs.forEach((u) => u())
}

// setState that dispatches to domain stores (used by tests and auto-compile)
function setStateComposed(partial: Partial<ComposedState>): void {
  // Route each key to the appropriate domain store
  const editorKeys = new Set([
    'filePath',
    'content',
    'isDirty',
    'openFiles',
    'activeFilePath',
    'cursorLine',
    'cursorColumn',
    'pendingJump',
    '_sessionOpenPaths',
    '_sessionActiveFile'
  ])
  const compileKeys = new Set([
    'compileStatus',
    'pdfPath',
    'pdfRevision',
    'logs',
    'isLogPanelOpen',
    'diagnostics',
    'logViewMode'
  ])
  const projectKeys = new Set([
    'projectRoot',
    'directoryTree',
    'isSidebarOpen',
    'sidebarView',
    'sidebarWidth',
    'bibEntries',
    'citationGroups',
    'labels',
    'packageData',
    'detectedPackages',
    'isGitRepo',
    'gitBranch',
    'gitStatus'
  ])
  const pdfKeys = new Set([
    'splitRatio',
    'zoomLevel',
    'synctexHighlight',
    'pdfSearchVisible',
    'pdfSearchQuery',
    'syncToCodeRequest'
  ])
  const uiKeys = new Set([
    'isDraftModalOpen',
    'isTemplateGalleryOpen',
    'updateStatus',
    'updateVersion',
    'updateProgress',
    'exportStatus',
    'lspStatus',
    'lspError',
    'documentSymbols',
    'citeSearchFocusRequested'
  ])
  const settingsKeys = new Set(['settings'])

  const editorPartial: Record<string, unknown> = {}
  const compilePartial: Record<string, unknown> = {}
  const projectPartial: Record<string, unknown> = {}
  const pdfPartial: Record<string, unknown> = {}
  const uiPartial: Record<string, unknown> = {}
  const settingsPartial: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(partial)) {
    if (editorKeys.has(key)) editorPartial[key] = value
    else if (compileKeys.has(key)) compilePartial[key] = value
    else if (projectKeys.has(key)) projectPartial[key] = value
    else if (pdfKeys.has(key)) pdfPartial[key] = value
    else if (uiKeys.has(key)) uiPartial[key] = value
    else if (settingsKeys.has(key)) settingsPartial[key] = value
  }

  if (Object.keys(editorPartial).length > 0) useEditorStore.setState(editorPartial)
  if (Object.keys(compilePartial).length > 0) useCompileStore.setState(compilePartial)
  if (Object.keys(projectPartial).length > 0) useProjectStore.setState(projectPartial)
  if (Object.keys(pdfPartial).length > 0) usePdfStore.setState(pdfPartial)
  if (Object.keys(uiPartial).length > 0) useUiStore.setState(uiPartial)
  if (Object.keys(settingsPartial).length > 0) useSettingsStore.setState(settingsPartial)
}

// Attach static methods to the hook function
export const useAppStore = Object.assign(useAppStoreFn, {
  getState: getComposedState,
  subscribe: subscribeComposed,
  setState: setStateComposed
})
