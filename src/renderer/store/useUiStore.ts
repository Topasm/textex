import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AppUpdateMetadata, DocumentSymbolNode } from '../../shared/types'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'restarting'
  | 'error'
export type UpdateErrorAction = 'check' | 'download' | 'restart'
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

interface UiState {
  // AI Draft modal
  isDraftModalOpen: boolean

  // Template gallery
  isTemplateGalleryOpen: boolean

  // Auto-update
  updateStatus: UpdateStatus
  updateMetadata: AppUpdateMetadata | null
  updateProgress: number | null
  updateError: string
  updateErrorAction: UpdateErrorAction | null

  // Export
  exportStatus: ExportStatus

  // Document symbols
  documentSymbols: DocumentSymbolNode[]

  // OmniSearch focus request
  omniSearchFocusRequested: boolean
  omniSearchFocusMode: 'file' | 'cite' | 'zotero' | 'online' | 'pdf' | 'tex' | null

  // External file change conflicts
  externalChangeConflicts: string[]

  // Actions
  setDraftModalOpen: (open: boolean) => void
  toggleDraftModal: () => void
  toggleTemplateGallery: () => void
  setTemplateGalleryOpen: (open: boolean) => void
  setUpdateStatus: (status: UpdateStatus) => void
  setUpdateMetadata: (metadata: AppUpdateMetadata | null) => void
  setUpdateProgress: (progress: number | null) => void
  setUpdateError: (error: string, action?: UpdateErrorAction | null) => void
  setExportStatus: (status: ExportStatus) => void
  setDocumentSymbols: (symbols: DocumentSymbolNode[]) => void
  requestOmniSearchFocus: (mode?: 'file' | 'cite' | 'zotero' | 'online' | 'pdf' | 'tex') => void
  clearOmniSearchFocus: () => void
  addExternalChangeConflict: (filePath: string) => void
  removeExternalChangeConflict: (filePath: string) => void
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((set) => ({
    isDraftModalOpen: false,
    isTemplateGalleryOpen: false,
    updateStatus: 'idle',
    updateMetadata: null,
    updateProgress: null,
    updateError: '',
    updateErrorAction: null,
    exportStatus: 'idle',
    documentSymbols: [],
    omniSearchFocusRequested: false,
    omniSearchFocusMode: null,
    externalChangeConflicts: [],

    setDraftModalOpen: (isDraftModalOpen) => set({ isDraftModalOpen }),
    toggleDraftModal: () => set((state) => ({ isDraftModalOpen: !state.isDraftModalOpen })),
    toggleTemplateGallery: () =>
      set((state) => ({ isTemplateGalleryOpen: !state.isTemplateGalleryOpen })),
    setTemplateGalleryOpen: (isTemplateGalleryOpen) => set({ isTemplateGalleryOpen }),
    setUpdateStatus: (updateStatus) => set({ updateStatus }),
    setUpdateMetadata: (updateMetadata) => set({ updateMetadata }),
    setUpdateProgress: (updateProgress) => set({ updateProgress }),
    setUpdateError: (updateError, updateErrorAction = null) =>
      set({ updateError, updateErrorAction }),
    setExportStatus: (exportStatus) => set({ exportStatus }),
    setDocumentSymbols: (documentSymbols) => set({ documentSymbols }),
    requestOmniSearchFocus: (mode) =>
      set({ omniSearchFocusRequested: true, omniSearchFocusMode: mode ?? 'cite' }),
    clearOmniSearchFocus: () => set({ omniSearchFocusRequested: false, omniSearchFocusMode: null }),
    addExternalChangeConflict: (filePath) =>
      set((state) => ({
        externalChangeConflicts: state.externalChangeConflicts.includes(filePath)
          ? state.externalChangeConflicts
          : [...state.externalChangeConflicts, filePath]
      })),
    removeExternalChangeConflict: (filePath) =>
      set((state) => ({
        externalChangeConflicts: state.externalChangeConflicts.filter((p) => p !== filePath)
      }))
  }))
)
