import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface OpenFileData {
  content: string
  isDirty: boolean
  cursorLine: number
  cursorColumn: number
}

interface EditorState {
  // File state
  filePath: string | null
  content: string
  isDirty: boolean

  // Multi-file
  openFiles: Record<string, OpenFileData>
  activeFilePath: string | null

  // Cursor
  cursorLine: number
  cursorColumn: number

  // Navigation
  pendingJump: { line: number; column: number } | null

  // Session restore metadata
  _sessionOpenPaths: string[]
  _sessionActiveFile: string | null

  // Actions
  setContent: (content: string) => void
  setFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  openFileInTab: (filePath: string, content: string) => void
  closeTab: (filePath: string) => void
  setActiveTab: (filePath: string) => void
  setCursorPosition: (line: number, column: number) => void
  requestJumpToLine: (line: number, column: number) => void
  clearPendingJump: () => void
}

export type { OpenFileData }

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    filePath: null,
    content: '',
    isDirty: false,
    openFiles: {},
    activeFilePath: null,
    cursorLine: 1,
    cursorColumn: 1,
    pendingJump: null,
    _sessionOpenPaths: [],
    _sessionActiveFile: null,

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

    openFileInTab: (filePath, content) => {
      const state = get()
      const openFiles = { ...state.openFiles }
      if (state.activeFilePath && openFiles[state.activeFilePath]) {
        openFiles[state.activeFilePath] = {
          ...openFiles[state.activeFilePath],
          content: state.content,
          cursorLine: state.cursorLine,
          cursorColumn: state.cursorColumn
        }
      }
      if (openFiles[filePath]) {
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
    setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn }),
    requestJumpToLine: (line, column) => set({ pendingJump: { line, column } }),
    clearPendingJump: () => set({ pendingJump: null })
  }))
)
