import { create } from 'zustand'

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'

interface AppState {
  filePath: string | null
  content: string
  isDirty: boolean
  compileStatus: CompileStatus
  pdfBase64: string | null
  logs: string
  isLogPanelOpen: boolean
  cursorLine: number
  cursorColumn: number

  setContent: (content: string) => void
  setFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  setCompileStatus: (status: CompileStatus) => void
  setPdfBase64: (data: string | null) => void
  appendLog: (text: string) => void
  clearLogs: () => void
  toggleLogPanel: () => void
  setLogPanelOpen: (open: boolean) => void
  setCursorPosition: (line: number, column: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  filePath: null,
  content: '',
  isDirty: false,
  compileStatus: 'idle',
  pdfBase64: null,
  logs: '',
  isLogPanelOpen: false,
  cursorLine: 1,
  cursorColumn: 1,

  setContent: (content) => set({ content, isDirty: true }),
  setFilePath: (filePath) => set({ filePath }),
  setDirty: (isDirty) => set({ isDirty }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setPdfBase64: (pdfBase64) => set({ pdfBase64 }),
  appendLog: (text) => set((state) => ({ logs: state.logs + text })),
  clearLogs: () => set({ logs: '' }),
  toggleLogPanel: () => set((state) => ({ isLogPanelOpen: !state.isLogPanelOpen })),
  setLogPanelOpen: (isLogPanelOpen) => set({ isLogPanelOpen }),
  setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn })
}))
