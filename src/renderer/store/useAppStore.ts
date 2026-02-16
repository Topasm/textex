import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

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
  diagnostics: Diagnostic[]
  logViewMode: 'raw' | 'structured'
  pendingJump: { line: number; column: number } | null
  synctexHighlight: { page: number; x: number; y: number; timestamp: number } | null
  splitRatio: number
  zoomLevel: number

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
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  setLogViewMode: (mode: 'raw' | 'structured') => void
  requestJumpToLine: (line: number, column: number) => void
  clearPendingJump: () => void
  setSynctexHighlight: (highlight: { page: number; x: number; y: number } | null) => void
  setSplitRatio: (ratio: number) => void
  setZoomLevel: (level: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export const useAppStore = create<AppState>()(subscribeWithSelector((set) => ({
  filePath: null,
  content: '',
  isDirty: false,
  compileStatus: 'idle',
  pdfBase64: null,
  logs: '',
  isLogPanelOpen: false,
  cursorLine: 1,
  cursorColumn: 1,
  diagnostics: [],
  logViewMode: 'structured',
  pendingJump: null,
  synctexHighlight: null,
  splitRatio: 0.5,
  zoomLevel: 100,

  setContent: (content) => set({ content, isDirty: true }),
  setFilePath: (filePath) => set({ filePath }),
  setDirty: (isDirty) => set({ isDirty }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setPdfBase64: (pdfBase64) => set({ pdfBase64 }),
  appendLog: (text) => set((state) => ({ logs: state.logs + text })),
  clearLogs: () => set({ logs: '' }),
  toggleLogPanel: () => set((state) => ({ isLogPanelOpen: !state.isLogPanelOpen })),
  setLogPanelOpen: (isLogPanelOpen) => set({ isLogPanelOpen }),
  setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn }),
  setDiagnostics: (diagnostics) => set({ diagnostics }),
  setLogViewMode: (logViewMode) => set({ logViewMode }),
  requestJumpToLine: (line, column) => set({ pendingJump: { line, column } }),
  clearPendingJump: () => set({ pendingJump: null }),
  setSynctexHighlight: (highlight) =>
    set({ synctexHighlight: highlight ? { ...highlight, timestamp: Date.now() } : null }),
  setSplitRatio: (splitRatio) => set({ splitRatio }),
  setZoomLevel: (level) => set({ zoomLevel: Math.max(25, Math.min(400, level)) }),
  zoomIn: () => set((state) => ({ zoomLevel: Math.min(400, state.zoomLevel + 25) })),
  zoomOut: () => set((state) => ({ zoomLevel: Math.max(25, state.zoomLevel - 25) })),
  resetZoom: () => set({ zoomLevel: 100 })
})))
