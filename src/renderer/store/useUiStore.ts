import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { DocumentSymbolNode } from '../../shared/types'

export type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error'
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'
export type LspStatus = 'stopped' | 'starting' | 'running' | 'error'

interface UiState {
  // AI Draft modal
  isDraftModalOpen: boolean

  // Template gallery
  isTemplateGalleryOpen: boolean

  // Auto-update
  updateStatus: UpdateStatus
  updateVersion: string
  updateProgress: number

  // Export
  exportStatus: ExportStatus

  // LSP
  lspStatus: LspStatus
  lspError: string | null

  // Document symbols
  documentSymbols: DocumentSymbolNode[]

  // Cite search focus request
  citeSearchFocusRequested: boolean

  // Actions
  setDraftModalOpen: (open: boolean) => void
  toggleDraftModal: () => void
  toggleTemplateGallery: () => void
  setTemplateGalleryOpen: (open: boolean) => void
  setUpdateStatus: (status: UpdateStatus) => void
  setUpdateVersion: (version: string) => void
  setUpdateProgress: (progress: number) => void
  setExportStatus: (status: ExportStatus) => void
  setLspStatus: (status: LspStatus) => void
  setLspError: (error: string | null) => void
  setDocumentSymbols: (symbols: DocumentSymbolNode[]) => void
  requestCiteSearchFocus: () => void
  clearCiteSearchFocus: () => void
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((set) => ({
    isDraftModalOpen: false,
    isTemplateGalleryOpen: false,
    updateStatus: 'idle',
    updateVersion: '',
    updateProgress: 0,
    exportStatus: 'idle',
    lspStatus: 'stopped',
    lspError: null,
    documentSymbols: [],
    citeSearchFocusRequested: false,

    setDraftModalOpen: (isDraftModalOpen) => set({ isDraftModalOpen }),
    toggleDraftModal: () => set((state) => ({ isDraftModalOpen: !state.isDraftModalOpen })),
    toggleTemplateGallery: () =>
      set((state) => ({ isTemplateGalleryOpen: !state.isTemplateGalleryOpen })),
    setTemplateGalleryOpen: (isTemplateGalleryOpen) => set({ isTemplateGalleryOpen }),
    setUpdateStatus: (updateStatus) => set({ updateStatus }),
    setUpdateVersion: (updateVersion) => set({ updateVersion }),
    setUpdateProgress: (updateProgress) => set({ updateProgress }),
    setExportStatus: (exportStatus) => set({ exportStatus }),
    setLspStatus: (lspStatus) => set({ lspStatus }),
    setLspError: (lspError) => set({ lspError }),
    setDocumentSymbols: (documentSymbols) => set({ documentSymbols }),
    requestCiteSearchFocus: () => set({ citeSearchFocusRequested: true }),
    clearCiteSearchFocus: () => set({ citeSearchFocusRequested: false })
  }))
)
