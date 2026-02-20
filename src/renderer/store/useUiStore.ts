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

  // OmniSearch focus request
  omniSearchFocusRequested: boolean
  omniSearchFocusMode: 'cite' | 'zotero' | 'pdf' | 'tex' | null

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
  requestOmniSearchFocus: (mode?: 'cite' | 'zotero' | 'pdf' | 'tex') => void
  clearOmniSearchFocus: () => void
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
    omniSearchFocusRequested: false,
    omniSearchFocusMode: null,

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
    requestOmniSearchFocus: (mode) =>
      set({ omniSearchFocusRequested: true, omniSearchFocusMode: mode ?? 'cite' }),
    clearOmniSearchFocus: () =>
      set({ omniSearchFocusRequested: false, omniSearchFocusMode: null })
  }))
)
