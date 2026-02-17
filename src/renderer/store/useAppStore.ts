import type {
  BibEntry,
  CitationGroup,
  DirectoryEntry,
  LabelInfo,
  Diagnostic,
  PackageData,
  GitStatusResult,
  DocumentSymbolNode
} from '../types/api'
import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'
export type Theme = 'system' | 'dark' | 'light' | 'high-contrast'
export type SidebarView = 'files' | 'git' | 'bib' | 'structure' | 'todo' | 'memo'
export type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error'
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'
export type LspStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface UserSettings {
  // Appearance
  theme: Theme
  pdfInvertMode: boolean // For "Night Mode" reading

  // User Info
  name: string
  email: string
  affiliation: string

  // Editor
  fontSize: number
  wordWrap: boolean
  vimMode: boolean

  // Automation
  formatOnSave: boolean
  autoCompile: boolean

  // Math Preview
  mathPreviewEnabled: boolean

  // Spell check
  spellCheckEnabled: boolean

  // LSP
  lspEnabled: boolean

  // Zotero
  zoteroEnabled: boolean
  zoteroPort: number

  // AI Draft
  aiProvider: 'openai' | 'anthropic' | ''
  aiModel: string

  // Sidebar
  autoHideSidebar: boolean

  // Status Bar
  showStatusBar: boolean

  // Bibliography grouping
  bibGroupMode: 'flat' | 'author' | 'year' | 'type' | 'custom'
}

const defaultSettings: UserSettings = {
  theme: 'system',
  pdfInvertMode: false,
  name: '',
  email: '',
  affiliation: '',
  fontSize: 14,
  wordWrap: true,
  vimMode: false,
  formatOnSave: true,
  autoCompile: true,
  mathPreviewEnabled: true,
  spellCheckEnabled: false,
  lspEnabled: true,
  zoteroEnabled: false,
  zoteroPort: 23119,
  aiProvider: '',
  aiModel: '',
  autoHideSidebar: false,
  showStatusBar: true,
  bibGroupMode: 'flat'
}

interface OpenFileData {
  content: string
  isDirty: boolean
  cursorLine: number
  cursorColumn: number
}

interface AppState {
  // File state
  filePath: string | null
  content: string
  isDirty: boolean

  // Multi-file
  projectRoot: string | null
  openFiles: Record<string, OpenFileData>
  activeFilePath: string | null
  directoryTree: DirectoryEntry[] | null
  isSidebarOpen: boolean
  sidebarView: SidebarView
  sidebarWidth: number

  // Compile
  compileStatus: CompileStatus
  pdfBase64: string | null
  logs: string
  isLogPanelOpen: boolean
  diagnostics: Diagnostic[]
  logViewMode: 'raw' | 'structured'

  // Cursor
  cursorLine: number
  cursorColumn: number

  // Navigation
  pendingJump: { line: number; column: number } | null
  synctexHighlight: { page: number; x: number; y: number; timestamp: number } | null
  splitRatio: number
  zoomLevel: number

  // Settings
  settings: UserSettings
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void

  // BibTeX
  bibEntries: BibEntry[]

  // Citation Groups
  citationGroups: CitationGroup[]

  // Labels
  labels: LabelInfo[]

  // Package data
  packageData: Record<string, PackageData>
  detectedPackages: string[]

  // Git
  isGitRepo: boolean
  gitBranch: string
  gitStatus: GitStatusResult | null

  // Auto-update
  updateStatus: UpdateStatus
  updateVersion: string
  updateProgress: number

  // Export
  exportStatus: ExportStatus

  // AI Draft modal
  isDraftModalOpen: boolean

  // Template gallery
  isTemplateGalleryOpen: boolean

  // LSP
  lspStatus: LspStatus
  lspError: string | null

  // Document symbols
  documentSymbols: DocumentSymbolNode[]

  // Session restore (persisted metadata — not live state)
  _sessionOpenPaths: string[]
  _sessionActiveFile: string | null

  // ---- Actions ----

  // Project
  closeProject: () => void

  // File
  setContent: (content: string) => void
  setFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void

  // Multi-file
  setProjectRoot: (root: string | null) => void
  openFileInTab: (filePath: string, content: string) => void
  closeTab: (filePath: string) => void
  setActiveTab: (filePath: string) => void
  setDirectoryTree: (tree: DirectoryEntry[] | null) => void
  toggleSidebar: () => void
  setSidebarView: (view: SidebarView) => void
  setSidebarWidth: (width: number) => void

  // Compile
  setCompileStatus: (status: CompileStatus) => void
  setPdfBase64: (data: string | null) => void
  appendLog: (text: string) => void
  clearLogs: () => void
  toggleLogPanel: () => void
  setLogPanelOpen: (open: boolean) => void
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  setLogViewMode: (mode: 'raw' | 'structured') => void

  // Cursor
  setCursorPosition: (line: number, column: number) => void

  // Navigation
  requestJumpToLine: (line: number, column: number) => void
  clearPendingJump: () => void
  setSynctexHighlight: (highlight: { page: number; x: number; y: number } | null) => void
  setSplitRatio: (ratio: number) => void
  setZoomLevel: (level: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void

  // Settings Actions
  // Note: Individual setters are replaced by updateSetting, but helper methods
  // like increaseFontSize might still be useful, updated to use updateSetting.
  increaseFontSize: () => void
  decreaseFontSize: () => void

  // BibTeX
  setBibEntries: (entries: BibEntry[]) => void

  // Citation Groups
  setCitationGroups: (groups: CitationGroup[]) => void

  // Labels
  setLabels: (labels: LabelInfo[]) => void

  // Package data
  setPackageData: (data: Record<string, PackageData>) => void
  setDetectedPackages: (packages: string[]) => void

  // Git
  setIsGitRepo: (isRepo: boolean) => void
  setGitBranch: (branch: string) => void
  setGitStatus: (status: GitStatusResult | null) => void

  // Auto-update
  setUpdateStatus: (status: UpdateStatus) => void
  setUpdateVersion: (version: string) => void
  setUpdateProgress: (progress: number) => void

  // Export
  setExportStatus: (status: ExportStatus) => void

  // AI Draft modal
  setDraftModalOpen: (open: boolean) => void
  toggleDraftModal: () => void

  // Template gallery
  toggleTemplateGallery: () => void
  setTemplateGalleryOpen: (open: boolean) => void

  // LSP
  setLspStatus: (status: LspStatus) => void
  setLspError: (error: string | null) => void

  // Document symbols
  setDocumentSymbols: (symbols: DocumentSymbolNode[]) => void
}

export const useAppStore = create<AppState>()(
  persist(
    subscribeWithSelector((set, get) => ({
      // File state
      filePath: null,
      content: '',
      isDirty: false,

      // Multi-file
      projectRoot: null,
      openFiles: {},
      activeFilePath: null,
      directoryTree: null,
      isSidebarOpen: false,
      sidebarView: 'files',
      sidebarWidth: 240,

      // Compile
      compileStatus: 'idle',
      pdfBase64: null,
      logs: '',
      isLogPanelOpen: false,
      diagnostics: [],
      logViewMode: 'structured',

      // Cursor
      cursorLine: 1,
      cursorColumn: 1,

      // Navigation
      pendingJump: null,
      synctexHighlight: null,
      splitRatio: 0.5,
      zoomLevel: 100,

      // Settings
      settings: defaultSettings,

      // BibTeX
      bibEntries: [],

      // Citation Groups
      citationGroups: [],

      // Labels
      labels: [],

      // Package data
      packageData: {},
      detectedPackages: [],

      // Git
      isGitRepo: false,
      gitBranch: '',
      gitStatus: null,

      // Auto-update
      updateStatus: 'idle',
      updateVersion: '',
      updateProgress: 0,

      // Export
      exportStatus: 'idle',

      // AI Draft modal
      isDraftModalOpen: false,

      // Template gallery
      isTemplateGalleryOpen: false,

      // LSP
      lspStatus: 'stopped',
      lspError: null,

      // Document symbols
      documentSymbols: [],

      // Session restore metadata
      _sessionOpenPaths: [],
      _sessionActiveFile: null,

      // ---- Actions ----

      closeProject: () => set({
        projectRoot: null,
        filePath: null,
        content: '',
        isDirty: false,
        openFiles: {},
        activeFilePath: null,
        directoryTree: null,
        isSidebarOpen: false,
        compileStatus: 'idle',
        pdfBase64: null,
        logs: '',
        isLogPanelOpen: false,
        diagnostics: [],
        cursorLine: 1,
        cursorColumn: 1,
        pendingJump: null,
        synctexHighlight: null,
        isGitRepo: false,
        gitBranch: '',
        gitStatus: null,
        bibEntries: [],
        citationGroups: [],
        labels: [],
        packageData: {},
        detectedPackages: [],
        lspStatus: 'stopped',
        lspError: null,
        documentSymbols: [],
        _sessionOpenPaths: [],
        _sessionActiveFile: null
      }),

      setContent: (content) => {
        const state = get()
        const activeFile = state.activeFilePath
        if (activeFile) {
          const openFiles = { ...state.openFiles }
          if (openFiles[activeFile]) {
            openFiles[activeFile] = { ...openFiles[activeFile], content, isDirty: true }
          }
          set({ content, isDirty: true, openFiles })
        } else {
          set({ content, isDirty: true })
        }
      },
      setFilePath: (filePath) => set({ filePath }),
      setDirty: (isDirty) => {
        const state = get()
        const activeFile = state.activeFilePath
        if (activeFile && state.openFiles[activeFile]) {
          const openFiles = { ...state.openFiles }
          openFiles[activeFile] = { ...openFiles[activeFile], isDirty }
          set({ isDirty, openFiles })
        } else {
          set({ isDirty })
        }
      },

      // Multi-file
      setProjectRoot: (projectRoot) => set({ projectRoot }),
      openFileInTab: (filePath, content) => {
        const state = get()
        const openFiles = { ...state.openFiles }
        // Save outgoing file's content and cursor before switching
        if (state.activeFilePath && openFiles[state.activeFilePath]) {
          openFiles[state.activeFilePath] = {
            ...openFiles[state.activeFilePath],
            content: state.content,
            cursorLine: state.cursorLine,
            cursorColumn: state.cursorColumn
          }
        }
        // Always update content from disk (handles external edits and re-opens)
        if (openFiles[filePath]) {
          // Preserve cursor position but refresh content from disk
          openFiles[filePath] = { ...openFiles[filePath], content, isDirty: false }
        } else {
          openFiles[filePath] = { content, isDirty: false, cursorLine: 1, cursorColumn: 1 }
        }
        set({
          openFiles,
          activeFilePath: filePath,
          filePath,
          content: openFiles[filePath].content,
          isDirty: openFiles[filePath].isDirty,
          cursorLine: openFiles[filePath].cursorLine,
          cursorColumn: openFiles[filePath].cursorColumn
        })
      },
      closeTab: (filePath) => {
        const state = get()
        const openFiles = { ...state.openFiles }
        delete openFiles[filePath]
        const remaining = Object.keys(openFiles)

        if (state.activeFilePath === filePath) {
          if (remaining.length > 0) {
            const next = remaining[remaining.length - 1]
            set({
              openFiles,
              activeFilePath: next,
              filePath: next,
              content: openFiles[next].content,
              isDirty: openFiles[next].isDirty,
              cursorLine: openFiles[next].cursorLine,
              cursorColumn: openFiles[next].cursorColumn
            })
          } else {
            set({
              openFiles,
              activeFilePath: null,
              filePath: null,
              content: '',
              isDirty: false
            })
          }
        } else {
          set({ openFiles })
        }
      },
      setActiveTab: (filePath) => {
        const state = get()
        // Save current content AND cursor position before switching
        if (state.activeFilePath && state.openFiles[state.activeFilePath]) {
          const openFiles = { ...state.openFiles }
          openFiles[state.activeFilePath] = {
            ...openFiles[state.activeFilePath],
            content: state.content,
            cursorLine: state.cursorLine,
            cursorColumn: state.cursorColumn
          }
          const fileData = openFiles[filePath]
          if (fileData) {
            set({
              openFiles,
              activeFilePath: filePath,
              filePath,
              content: fileData.content,
              isDirty: fileData.isDirty,
              cursorLine: fileData.cursorLine,
              cursorColumn: fileData.cursorColumn
            })
          }
        } else {
          const fileData = state.openFiles[filePath]
          if (fileData) {
            set({
              activeFilePath: filePath,
              filePath,
              content: fileData.content,
              isDirty: fileData.isDirty,
              cursorLine: fileData.cursorLine,
              cursorColumn: fileData.cursorColumn
            })
          }
        }
      },
      setDirectoryTree: (directoryTree) => set({ directoryTree }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarView: (sidebarView) => set({ sidebarView }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: Math.max(150, Math.min(500, sidebarWidth)) }),

      // Compile
      setCompileStatus: (compileStatus) => set({ compileStatus }),
      setPdfBase64: (pdfBase64) => set({ pdfBase64 }),
      appendLog: (text) => set((state) => ({ logs: state.logs + text })),
      clearLogs: () => set({ logs: '' }),
      toggleLogPanel: () => set((state) => ({ isLogPanelOpen: !state.isLogPanelOpen })),
      setLogPanelOpen: (isLogPanelOpen) => set({ isLogPanelOpen }),
      setDiagnostics: (diagnostics) => set({ diagnostics }),
      setLogViewMode: (logViewMode) => set({ logViewMode }),

      // Cursor
      setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn }),

      // Navigation
      requestJumpToLine: (line, column) => set({ pendingJump: { line, column } }),
      clearPendingJump: () => set({ pendingJump: null }),
      setSynctexHighlight: (highlight) =>
        set({ synctexHighlight: highlight ? { ...highlight, timestamp: Date.now() } : null }),
      setSplitRatio: (splitRatio) => set({ splitRatio }),
      setZoomLevel: (level) => set({ zoomLevel: Math.max(25, Math.min(400, level)) }),
      zoomIn: () => set((state) => ({ zoomLevel: Math.min(400, state.zoomLevel + 25) })),
      zoomOut: () => set((state) => ({ zoomLevel: Math.max(25, state.zoomLevel - 25) })),
      resetZoom: () => set({ zoomLevel: 100 }),

      // Settings
      updateSetting: (key, value) => {
        set((state) => ({ settings: { ...state.settings, [key]: value } }))
        // Handle side effects of specific settings
        if (key === 'theme') {
          document.documentElement.dataset.theme = value as string
        }
      },
      increaseFontSize: () => {
        const state = get()
        const currentSize = state.settings.fontSize
        const next = Math.min(32, currentSize + 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
      },
      decreaseFontSize: () => {
        const state = get()
        const currentSize = state.settings.fontSize
        const next = Math.max(8, currentSize - 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
      },

      // BibTeX
      setBibEntries: (bibEntries) => set({ bibEntries }),

      // Citation Groups
      setCitationGroups: (citationGroups) => set({ citationGroups }),

      // Labels
      setLabels: (labels) => set({ labels }),

      // Package data
      setPackageData: (packageData) => set({ packageData }),
      setDetectedPackages: (detectedPackages) => set({ detectedPackages }),

      // Git
      setIsGitRepo: (isGitRepo) => set({ isGitRepo }),
      setGitBranch: (gitBranch) => set({ gitBranch }),
      setGitStatus: (gitStatus) => set({ gitStatus }),

      // Auto-update
      setUpdateStatus: (updateStatus) => set({ updateStatus }),
      setUpdateVersion: (updateVersion) => set({ updateVersion }),
      setUpdateProgress: (updateProgress) => set({ updateProgress }),

      // Export
      setExportStatus: (exportStatus) => set({ exportStatus }),

      // AI Draft modal
      setDraftModalOpen: (isDraftModalOpen) => set({ isDraftModalOpen }),
      toggleDraftModal: () => set((state) => ({ isDraftModalOpen: !state.isDraftModalOpen })),

      // Template gallery
      toggleTemplateGallery: () =>
        set((state) => ({ isTemplateGalleryOpen: !state.isTemplateGalleryOpen })),
      setTemplateGalleryOpen: (isTemplateGalleryOpen) => set({ isTemplateGalleryOpen }),

      // LSP
      setLspStatus: (lspStatus) => set({ lspStatus }),
      setLspError: (lspError) => set({ lspError }),

      // Document symbols
      setDocumentSymbols: (documentSymbols) => set({ documentSymbols })
    })),
    {
      name: 'textex-settings-storage', // key in localStorage
      partialize: (state) => ({
        settings: state.settings,
        projectRoot: state.projectRoot,
        isSidebarOpen: state.isSidebarOpen,
        sidebarView: state.sidebarView,
        sidebarWidth: state.sidebarWidth,
        _sessionOpenPaths: Object.keys(state.openFiles),
        _sessionActiveFile: state.activeFilePath
      }),
      onRehydrateStorage: () => (state) => {
        // Hydration callback - apply necessary side effects on load
        if (state && state.settings.theme) {
          document.documentElement.dataset.theme = state.settings.theme
        }
      }
    }
  )
)
