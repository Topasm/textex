import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'
export type Theme = 'dark' | 'light' | 'high-contrast'
export type SidebarView = 'files' | 'git' | 'bib'
export type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error'
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

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
  theme: Theme
  fontSize: number

  // BibTeX
  bibEntries: BibEntry[]

  // Spell check
  spellCheckEnabled: boolean

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

  // Template gallery
  isTemplateGalleryOpen: boolean

  // ---- Actions ----

  // File
  setContent: (content: string) => void
  setFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void

  // Multi-file
  setProjectRoot: (root: string | null) => void
  openFileInTab: (filePath: string, content: string) => void
  closeTab: (filePath: string) => void
  setActiveTab: (filePath: string) => void
  updateFileContent: (filePath: string, content: string) => void
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

  // Settings
  setTheme: (theme: Theme) => void
  setFontSize: (size: number) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
  loadUserSettings: (settings: UserSettings) => void

  // BibTeX
  setBibEntries: (entries: BibEntry[]) => void

  // Spell check
  setSpellCheckEnabled: (enabled: boolean) => void

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

  // Template gallery
  toggleTemplateGallery: () => void
  setTemplateGalleryOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>()(
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
    theme: 'dark',
    fontSize: 14,

    // BibTeX
    bibEntries: [],

    // Spell check
    spellCheckEnabled: false,

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

    // Template gallery
    isTemplateGalleryOpen: false,

    // ---- Actions ----

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
      if (!openFiles[filePath]) {
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
      // Save current cursor position
      if (state.activeFilePath && state.openFiles[state.activeFilePath]) {
        const openFiles = { ...state.openFiles }
        openFiles[state.activeFilePath] = {
          ...openFiles[state.activeFilePath],
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
    updateFileContent: (filePath, content) => {
      const state = get()
      const openFiles = { ...state.openFiles }
      if (openFiles[filePath]) {
        openFiles[filePath] = { ...openFiles[filePath], content, isDirty: true }
      }
      if (state.activeFilePath === filePath) {
        set({ openFiles, content, isDirty: true })
      } else {
        set({ openFiles })
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
    setTheme: (theme) => {
      document.documentElement.dataset.theme = theme
      set({ theme })
      window.api.saveSettings({ theme })
    },
    setFontSize: (fontSize) => {
      const clamped = Math.max(8, Math.min(32, fontSize))
      set({ fontSize: clamped })
      window.api.saveSettings({ fontSize: clamped })
    },
    increaseFontSize: () => {
      const state = get()
      const next = Math.min(32, state.fontSize + 1)
      set({ fontSize: next })
      window.api.saveSettings({ fontSize: next })
    },
    decreaseFontSize: () => {
      const state = get()
      const next = Math.max(8, state.fontSize - 1)
      set({ fontSize: next })
      window.api.saveSettings({ fontSize: next })
    },
    loadUserSettings: (settings) => {
      document.documentElement.dataset.theme = settings.theme
      set({
        theme: settings.theme,
        fontSize: settings.fontSize,
        spellCheckEnabled: settings.spellCheckEnabled
      })
    },

    // BibTeX
    setBibEntries: (bibEntries) => set({ bibEntries }),

    // Spell check
    setSpellCheckEnabled: (spellCheckEnabled) => {
      set({ spellCheckEnabled })
      window.api.saveSettings({ spellCheckEnabled })
    },

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

    // Template gallery
    toggleTemplateGallery: () =>
      set((state) => ({ isTemplateGalleryOpen: !state.isTemplateGalleryOpen })),
    setTemplateGalleryOpen: (isTemplateGalleryOpen) => set({ isTemplateGalleryOpen })
  }))
)
