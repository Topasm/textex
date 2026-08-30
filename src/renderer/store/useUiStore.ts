import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AppUpdateMetadata, DocumentSymbolNode } from '../../shared/types'
import type { LearnSectionId } from '../../shared/learningIds'
import { normalizeDocumentId } from '../models/documentRegistry'

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
export type ProseAnchorOrigin = 'source' | 'preview' | 'tex'
export type ProseAnchorIntent = 'navigate' | 'scroll'
export interface ProseAnchor {
  line: number
  origin: ProseAnchorOrigin
  /** Scroll-following never steals focus; omitted anchors are direct navigation. */
  intent?: ProseAnchorIntent
}

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

  /** Set by background services that need App to open the settings page. */
  settingsRequested: boolean

  /** Requested in-app guide section; App owns the exclusive full-workspace page. */
  helpRequestedSection: LearnSectionId | null

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
  proseModeDocumentIds: readonly string[]

  /**
   * Where the author is in the prose view, as a `.tex` source line.
   *
   * The Markdown source and its rendering are two projections of the same
   * blocks, so a source line is the one anchor both halves understand.
   * `origin` records which side moved, so the other follows without echoing
   * the move straight back.
   */
  proseAnchors: Readonly<Record<string, ProseAnchor>>

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
  requestHelp: (section?: LearnSectionId) => void
  clearHelpRequest: () => void
  registerFeatureModal: (id: string) => void
  unregisterFeatureModal: (id: string) => void
  setProseAnchor: (
    filePath: string,
    line: number,
    origin: ProseAnchorOrigin,
    intent?: ProseAnchorIntent
  ) => void
  setProseMode: (filePath: string, enabled: boolean) => void
  forgetProseMode: (filePath: string) => void
  moveProseMode: (oldPath: string, newPath: string) => void
}

export function proseModeFor(
  state: Pick<UiState, 'proseModeDocumentIds'>,
  filePath: string | null
): boolean {
  return Boolean(filePath && state.proseModeDocumentIds.includes(normalizeDocumentId(filePath)))
}

export function proseAnchorFor(
  state: Pick<UiState, 'proseAnchors'>,
  filePath: string | null
): ProseAnchor | null {
  return filePath ? (state.proseAnchors[normalizeDocumentId(filePath)] ?? null) : null
}

function withoutRecordKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  if (!(key in record)) return record
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))
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
    helpRequestedSection: null,
    openFeatureModals: [],
    proseModeDocumentIds: [],
    proseAnchors: {},

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
    requestHelp: (section = 'quick-start') => set({ helpRequestedSection: section }),
    clearHelpRequest: () => set({ helpRequestedSection: null }),
    registerFeatureModal: (id) =>
      set((state) =>
        state.openFeatureModals.includes(id)
          ? state
          : { openFeatureModals: [...state.openFeatureModals, id] }
      ),
    setProseAnchor: (filePath, line, origin, intent = 'navigate') =>
      set((state) => {
        const documentId = normalizeDocumentId(filePath)
        const current = state.proseAnchors[documentId]
        if (
          current?.line === line &&
          (current.intent ?? 'navigate') === intent &&
          (intent === 'scroll' || current.origin === origin)
        ) {
          return state
        }
        const anchor: ProseAnchor =
          intent === 'scroll' ? { line, origin, intent } : { line, origin }
        return { proseAnchors: { ...state.proseAnchors, [documentId]: anchor } }
      }),
    setProseMode: (filePath, enabled) =>
      set((state) => {
        const documentId = normalizeDocumentId(filePath)
        const active = state.proseModeDocumentIds.includes(documentId)
        if (active === enabled) return state
        return {
          proseModeDocumentIds: enabled
            ? [...state.proseModeDocumentIds, documentId]
            : state.proseModeDocumentIds.filter((id) => id !== documentId)
        }
      }),
    forgetProseMode: (filePath) =>
      set((state) => {
        const documentId = normalizeDocumentId(filePath)
        const hasMode = state.proseModeDocumentIds.includes(documentId)
        const hasAnchor = documentId in state.proseAnchors
        if (!hasMode && !hasAnchor) return state
        return {
          proseModeDocumentIds: hasMode
            ? state.proseModeDocumentIds.filter((id) => id !== documentId)
            : state.proseModeDocumentIds,
          proseAnchors: hasAnchor
            ? withoutRecordKey(state.proseAnchors, documentId)
            : state.proseAnchors
        }
      }),
    moveProseMode: (oldPath, newPath) =>
      set((state) => {
        const oldId = normalizeDocumentId(oldPath)
        const newId = normalizeDocumentId(newPath)
        if (oldId === newId) return state
        const hadMode = state.proseModeDocumentIds.includes(oldId)
        const anchor = state.proseAnchors[oldId]
        if (!hadMode && !anchor) return state

        const withoutOldMode = state.proseModeDocumentIds.filter((id) => id !== oldId)
        return {
          proseModeDocumentIds:
            hadMode && !withoutOldMode.includes(newId)
              ? [...withoutOldMode, newId]
              : withoutOldMode,
          proseAnchors: anchor
            ? { ...withoutRecordKey(state.proseAnchors, oldId), [newId]: anchor }
            : withoutRecordKey(state.proseAnchors, oldId)
        }
      }),
    unregisterFeatureModal: (id) =>
      set((state) =>
        state.openFeatureModals.includes(id)
          ? { openFeatureModals: state.openFeatureModals.filter((item) => item !== id) }
          : state
      )
  }))
)
