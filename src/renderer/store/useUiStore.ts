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

/**
 * Which surface each half of the workspace shows for one document.
 *
 * The two halves are independent on purpose. Flipping both at once made the
 * useful pairing — drafting in Markdown while watching the compiled PDF —
 * impossible to reach, so each half is chosen and remembered on its own.
 */
export interface ProseView {
  /** The editor half: the TeX source, or the document's prose as Markdown. */
  editor: 'tex' | 'prose'
  /** The preview half: the compiled PDF, or the prose rendering. */
  preview: 'pdf' | 'prose'
}

/** Shared so selectors comparing by identity do not see a new object. */
export const DEFAULT_PROSE_VIEW: ProseView = Object.freeze({ editor: 'tex', preview: 'pdf' })

export interface UiState {
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
   * How each document's two halves are shown, for the documents that differ
   * from the default.
   *
   * Per document, not global: an author drafting one chapter in prose often
   * wants the TeX of another in front of them at the same time.
   */
  proseViews: Readonly<Record<string, ProseView>>

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
  setProseView: (filePath: string, patch: Partial<ProseView>) => void
  forgetProseView: (filePath: string) => void
}

/** The record without one document's entry. */
function withoutProseView(
  views: Readonly<Record<string, ProseView>>,
  filePath: string
): Record<string, ProseView> {
  const rest: Record<string, ProseView> = {}
  for (const [path, view] of Object.entries(views)) {
    if (path !== filePath) rest[path] = view
  }
  return rest
}

/** What a document's halves show, falling back to the default pairing. */
export function proseViewFor(state: UiState, filePath: string | null): ProseView {
  if (!filePath) return DEFAULT_PROSE_VIEW
  return state.proseViews[filePath] ?? DEFAULT_PROSE_VIEW
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
    proseViews: {},

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
    setProseView: (filePath, patch) =>
      set((state) => {
        const current = state.proseViews[filePath] ?? DEFAULT_PROSE_VIEW
        const next = { ...current, ...patch }
        if (next.editor === current.editor && next.preview === current.preview) return state
        // A document back on the default pairing drops out of the record, so a
        // closed file leaves nothing behind even if nobody forgets it.
        const isDefault =
          next.editor === DEFAULT_PROSE_VIEW.editor && next.preview === DEFAULT_PROSE_VIEW.preview
        if (isDefault) return { proseViews: withoutProseView(state.proseViews, filePath) }
        return { proseViews: { ...state.proseViews, [filePath]: next } }
      }),
    forgetProseView: (filePath) =>
      set((state) => {
        if (!(filePath in state.proseViews)) return state
        return { proseViews: withoutProseView(state.proseViews, filePath) }
      }),
    unregisterFeatureModal: (id) =>
      set((state) =>
        state.openFeatureModals.includes(id)
          ? { openFeatureModals: state.openFeatureModals.filter((item) => item !== id) }
          : state
      )
  }))
)
