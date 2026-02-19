import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Diagnostic } from '../../shared/types'

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'

interface CompileState {
  compileStatus: CompileStatus
  pdfPath: string | null
  /** Monotonic counter bumped on each successful compile to signal PDF reload. */
  pdfRevision: number
  logs: string
  isLogPanelOpen: boolean
  diagnostics: Diagnostic[]
  logViewMode: 'raw' | 'structured'

  setCompileStatus: (status: CompileStatus) => void
  setPdfPath: (pdfPath: string | null) => void
  appendLog: (text: string) => void
  clearLogs: () => void
  toggleLogPanel: () => void
  setLogPanelOpen: (open: boolean) => void
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  setLogViewMode: (mode: 'raw' | 'structured') => void
}

export const useCompileStore = create<CompileState>()(
  subscribeWithSelector((set) => ({
    compileStatus: 'idle',
    pdfPath: null,
    pdfRevision: 0,
    logs: '',
    isLogPanelOpen: false,
    diagnostics: [],
    logViewMode: 'structured',

    setCompileStatus: (compileStatus) => set({ compileStatus }),
    setPdfPath: (pdfPath) => set((state) => ({ pdfPath, pdfRevision: state.pdfRevision + 1 })),
    appendLog: (text) => set((state) => ({ logs: state.logs + text })),
    clearLogs: () => set({ logs: '' }),
    toggleLogPanel: () => set((state) => ({ isLogPanelOpen: !state.isLogPanelOpen })),
    setLogPanelOpen: (isLogPanelOpen) => set({ isLogPanelOpen }),
    setDiagnostics: (diagnostics) => set({ diagnostics }),
    setLogViewMode: (logViewMode) => set({ logViewMode })
  }))
)
