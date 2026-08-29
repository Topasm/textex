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

  /** Set by background services that need App to open the settings modal. */
  settingsRequested: boolean

  /**
   * Ids of modal surfaces owned by features rather than by App.
   *
   * App suppresses its own overlays while any of these is on screen. Features
   * register explicitly so the policy never has to infer modal state by
   * scanning the DOM.
   */
  openFeatureModals: readonly string[]

  /**
   * Documents currently shown as prose rather than TeX source.
   *
   * Per document, not global: an author drafting one chapter in prose often
   * wants the TeX of another in front of them at the same time.
   */
  proseModePaths: readonly string[]

  /**
   * Where the author is in the prose view, as a `.tex` source line.
   *
   * The Markdown source and its rendering are two projections of the same
   * blocks, so a source line is the one anchor both halves understand.
   * `origin` records which side moved, so the other follows without echoing
   * the move straight back.
   */
  proseAnchor: { line: number; origin: 'source' | 'preview' | 'tex' } | null

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
  requestSettings: () => void
  clearSettingsRequest: () => void
  registerFeatureModal: (id: string) => void
  unregisterFeatureModal: (id: string) => void
  setProseAnchor: (line: number, origin: 'source' | 'preview' | 'tex') => void
  toggleProseMode: (filePath: string) => void
  setProseMode: (filePath: string, enabled: boolean) => void
  forgetProseMode: (filePath: string) => void
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
    settingsRequested: false,
    openFeatureModals: [],
    proseModePaths: [],
    proseAnchor: null,

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
      })),
    requestSettings: () => set({ settingsRequested: true }),
    clearSettingsRequest: () => set({ settingsRequested: false }),
    registerFeatureModal: (id) =>
      set((state) =>
        state.openFeatureModals.includes(id)
          ? state
          : { openFeatureModals: [...state.openFeatureModals, id] }
      ),
    setProseAnchor: (line, origin) =>
      set((state) =>
        state.proseAnchor?.line === line && state.proseAnchor.origin === origin
          ? state
          : { proseAnchor: { line, origin } }
      ),
    toggleProseMode: (filePath) =>
      set((state) => ({
        proseModePaths: state.proseModePaths.includes(filePath)
          ? state.proseModePaths.filter((path) => path !== filePath)
          : [...state.proseModePaths, filePath]
      })),
    setProseMode: (filePath, enabled) =>
      set((state) => {
        const active = state.proseModePaths.includes(filePath)
        if (active === enabled) return state
        return {
          proseModePaths: enabled
            ? [...state.proseModePaths, filePath]
            : state.proseModePaths.filter((path) => path !== filePath)
        }
      }),
    forgetProseMode: (filePath) =>
      set((state) =>
        state.proseModePaths.includes(filePath)
          ? { proseModePaths: state.proseModePaths.filter((path) => path !== filePath) }
          : state
      ),
    unregisterFeatureModal: (id) =>
      set((state) =>
        state.openFeatureModals.includes(id)
          ? { openFeatureModals: state.openFeatureModals.filter((item) => item !== id) }
          : state
      )
  }))
)
