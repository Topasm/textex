import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import type {
  DocumentChangeSource,
  DocumentRevisionSnapshot,
  DocumentSnapshot
} from '../models/documentModel'
import { documentRegistry } from '../models/documentRegistry'
import type { EditorTextEdit } from '../editor/EditorAdapter'
import { flushPendingDocumentEdits } from '../services/pendingDocumentEdits'

interface OpenFileData {
  isDirty: boolean
  cursorLine: number
  cursorColumn: number
}

interface RestoredFileData {
  filePath: string
  content: string
  cursorLine: number
  cursorColumn: number
}

interface RestoreFilesInTabsOptions {
  orderedFilePaths: string[]
  activeFilePath?: string
  expectedTabMutationEpoch: number
}

interface EditorState {
  filePath: string | null
  activeFilePath: string | null
  isDirty: boolean
  revision: number
  openFiles: Record<string, OpenFileData>
  tabMutationEpoch: number

  cursorLine: number
  cursorColumn: number
  pendingJump: { line: number; column: number; skipFocus?: boolean } | null
  pendingInsertText: string | null

  _sessionOpenPaths: string[]
  _sessionActiveFile: string | null
  _sessionCursors: Record<string, { cursorLine: number; cursorColumn: number }>

  updateActiveDocument: (text: string, source?: DocumentChangeSource) => DocumentSnapshot | null
  applyDocumentEdits: (
    filePath: string,
    source: DocumentChangeSource,
    edits: readonly EditorTextEdit[]
  ) => DocumentSnapshot | null
  recordEditorChange: (filePath: string) => DocumentRevisionSnapshot | null
  markDocumentSaved: (filePath: string, revision?: number) => boolean
  openFileInTab: (filePath: string, content: string) => void
  restoreFilesInTabs: (files: RestoredFileData[], options: RestoreFilesInTabsOptions) => boolean
  closeTab: (filePath: string) => void
  setActiveTab: (filePath: string) => void
  setCursorPosition: (line: number, column: number) => void
  requestJumpToLine: (line: number, column: number, skipFocus?: boolean) => void
  clearPendingJump: () => void
  requestInsertAtCursor: (text: string) => void
  clearPendingInsert: () => void
  reloadFileContent: (filePath: string, newContent: string) => void
  resetEditor: () => void
}

export type { OpenFileData, RestoredFileData, RestoreFilesInTabsOptions }

function withDirtyState(
  openFiles: Record<string, OpenFileData>,
  filePath: string,
  isDirty: boolean
): Record<string, OpenFileData> {
  const current = openFiles[filePath]
  if (!current || current.isDirty === isDirty) return openFiles
  return { ...openFiles, [filePath]: { ...current, isDirty } }
}

function nextTabMutationEpoch(current: number): number {
  return current === Number.MAX_SAFE_INTEGER ? 0 : current + 1
}

function validCursorCoordinate(value: number): number {
  return Number.isSafeInteger(value) && value >= 1 ? value : 1
}

function orderOpenFiles(
  openFiles: Record<string, OpenFileData>,
  orderedFilePaths: string[]
): Record<string, OpenFileData> {
  const remaining = new Set(Object.keys(openFiles))
  const ordered: Record<string, OpenFileData> = {}

  for (const requestedPath of orderedFilePaths) {
    const filePath = documentRegistry.getFilePath(requestedPath) ?? requestedPath
    const data = openFiles[filePath]
    if (!data || !remaining.delete(filePath)) continue
    ordered[filePath] = data
  }
  for (const filePath of remaining) ordered[filePath] = openFiles[filePath]
  return ordered
}

const emptyEditorState = {
  filePath: null,
  activeFilePath: null,
  isDirty: false,
  revision: 0,
  openFiles: {},
  tabMutationEpoch: 0,
  cursorLine: 1,
  cursorColumn: 1,
  pendingJump: null,
  pendingInsertText: null,
  _sessionOpenPaths: [] as string[],
  _sessionActiveFile: null,
  _sessionCursors: {} as Record<string, { cursorLine: number; cursorColumn: number }>
}

export const useEditorStore = create<EditorState>()(
  persist(
    subscribeWithSelector((set, get) => ({
      ...emptyEditorState,

      updateActiveDocument: (text, source = 'programmatic') => {
        const state = get()
        const activeFile = state.activeFilePath
        if (!activeFile) return null

        const beforeRevision = documentRegistry.getModel(activeFile)?.revision
        const after = documentRegistry.update(activeFile, text, source)
        if (!after || after.revision === beforeRevision) return after

        const isDirty = documentRegistry.getModel(activeFile)?.isDirty ?? false
        const openFiles = withDirtyState(state.openFiles, activeFile, isDirty)
        set({
          revision: after.revision,
          isDirty,
          openFiles
        })
        return after
      },

      applyDocumentEdits: (filePath, source, edits) => {
        const beforeRevision = documentRegistry.getModel(filePath)?.revision
        const after = documentRegistry.applyEdits(filePath, source, edits)
        if (!after || after.revision === beforeRevision) return after

        const state = get()
        const isDirty = documentRegistry.getModel(filePath)?.isDirty ?? false
        const openFiles = withDirtyState(state.openFiles, filePath, isDirty)
        if (state.activeFilePath === filePath) {
          set({ revision: after.revision, isDirty, openFiles })
        } else if (openFiles !== state.openFiles) {
          set({ openFiles })
        }
        return after
      },

      recordEditorChange: (filePath) => {
        const model = documentRegistry.getModel(filePath)
        const beforeRevision = model?.revision
        const after = documentRegistry.recordEditorChange(filePath)
        if (!after || after.revision === beforeRevision) return after

        const state = get()
        const isDirty = model?.isDirty ?? false
        const openFiles = withDirtyState(state.openFiles, filePath, isDirty)
        if (state.activeFilePath === filePath) {
          set({ revision: after.revision, isDirty, openFiles })
        } else if (openFiles !== state.openFiles) {
          set({ openFiles })
        }
        return after
      },

      markDocumentSaved: (filePath, revision) => {
        if (!documentRegistry.markSaved(filePath, revision)) return false
        const state = get()
        const openFiles = withDirtyState(state.openFiles, filePath, false)
        if (state.activeFilePath === filePath) {
          set({ isDirty: false, openFiles })
        } else if (openFiles !== state.openFiles) {
          set({ openFiles })
        }
        return true
      },

      openFileInTab: (requestedPath, content) => {
        const state = get()
        const wasOpen = documentRegistry.has(requestedPath)
        documentRegistry.open(requestedPath, content)
        const filePath = documentRegistry.getFilePath(requestedPath) ?? requestedPath
        const model = documentRegistry.getModel(filePath)
        if (!model) return
        const snapshot = wasOpen
          ? documentRegistry.replaceFromDisk(filePath, content)
          : model.snapshot()
        if (!snapshot) return

        const openFiles = { ...state.openFiles }
        if (state.activeFilePath && openFiles[state.activeFilePath]) {
          openFiles[state.activeFilePath] = {
            ...openFiles[state.activeFilePath],
            cursorLine: state.cursorLine,
            cursorColumn: state.cursorColumn
          }
        }

        const fileData = openFiles[filePath] ?? {
          isDirty: model.isDirty,
          cursorLine: 1,
          cursorColumn: 1
        }
        openFiles[filePath] = { ...fileData, isDirty: model.isDirty }
        set({
          openFiles,
          activeFilePath: filePath,
          filePath,
          revision: snapshot.revision,
          isDirty: model.isDirty,
          cursorLine: fileData.cursorLine,
          cursorColumn: fileData.cursorColumn,
          tabMutationEpoch: nextTabMutationEpoch(state.tabMutationEpoch)
        })
      },

      restoreFilesInTabs: (files, options) => {
        let restored = false
        set((state) => {
          if (state.tabMutationEpoch !== options.expectedTabMutationEpoch) return state

          const openFiles = { ...state.openFiles }
          for (const file of files) {
            documentRegistry.open(file.filePath, file.content)
            const filePath = documentRegistry.getFilePath(file.filePath) ?? file.filePath
            const model = documentRegistry.getModel(filePath)
            if (!model) continue
            openFiles[filePath] = {
              isDirty: model.isDirty,
              cursorLine: validCursorCoordinate(file.cursorLine),
              cursorColumn: validCursorCoordinate(file.cursorColumn)
            }
          }

          const orderedOpenFiles = orderOpenFiles(openFiles, options.orderedFilePaths)
          const requestedActivePath = options.activeFilePath
          const activeFilePath = requestedActivePath
            ? (documentRegistry.getFilePath(requestedActivePath) ?? requestedActivePath)
            : state.activeFilePath
          const activeFile = activeFilePath ? orderedOpenFiles[activeFilePath] : undefined
          const activeModel = activeFilePath ? documentRegistry.getModel(activeFilePath) : null

          restored = true
          if (!requestedActivePath || !activeFile || !activeModel) {
            return { openFiles: orderedOpenFiles }
          }
          return {
            openFiles: orderedOpenFiles,
            activeFilePath,
            filePath: activeFilePath,
            revision: activeModel.revision,
            isDirty: activeModel.isDirty,
            cursorLine: activeFile.cursorLine,
            cursorColumn: activeFile.cursorColumn
          }
        })
        return restored
      },

      closeTab: (filePath) => {
        flushPendingDocumentEdits(filePath)
        const state = get()
        const openFiles = { ...state.openFiles }
        delete openFiles[filePath]
        documentRegistry.close(filePath)

        if (state.activeFilePath !== filePath) {
          set({
            openFiles,
            tabMutationEpoch: nextTabMutationEpoch(state.tabMutationEpoch)
          })
          return
        }

        const remaining = Object.keys(openFiles)
        const next = remaining.at(-1)
        if (!next) {
          set({
            openFiles,
            activeFilePath: null,
            filePath: null,
            revision: 0,
            isDirty: false,
            cursorLine: 1,
            cursorColumn: 1,
            tabMutationEpoch: nextTabMutationEpoch(state.tabMutationEpoch)
          })
          return
        }

        const nextModel = documentRegistry.getModel(next)
        const nextData = openFiles[next]
        set({
          openFiles,
          activeFilePath: next,
          filePath: next,
          revision: nextModel?.revision ?? 0,
          isDirty: nextModel?.isDirty ?? false,
          cursorLine: nextData.cursorLine,
          cursorColumn: nextData.cursorColumn,
          tabMutationEpoch: nextTabMutationEpoch(state.tabMutationEpoch)
        })
      },

      setActiveTab: (filePath) => {
        const previousActivePath = get().activeFilePath
        if (previousActivePath && previousActivePath !== filePath) {
          flushPendingDocumentEdits(previousActivePath)
        }
        const state = get()
        const target = state.openFiles[filePath]
        const model = documentRegistry.getModel(filePath)
        if (!target || !model) return

        let openFiles = state.openFiles
        if (state.activeFilePath && openFiles[state.activeFilePath]) {
          openFiles = {
            ...openFiles,
            [state.activeFilePath]: {
              ...openFiles[state.activeFilePath],
              cursorLine: state.cursorLine,
              cursorColumn: state.cursorColumn
            }
          }
        }

        set({
          openFiles,
          activeFilePath: filePath,
          filePath,
          revision: model.revision,
          isDirty: model.isDirty,
          cursorLine: target.cursorLine,
          cursorColumn: target.cursorColumn,
          tabMutationEpoch: nextTabMutationEpoch(state.tabMutationEpoch)
        })
      },

      setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn }),
      requestJumpToLine: (line, column, skipFocus) =>
        set({ pendingJump: { line, column, skipFocus } }),
      clearPendingJump: () => set({ pendingJump: null }),
      requestInsertAtCursor: (text) => set({ pendingInsertText: text }),
      clearPendingInsert: () => set({ pendingInsertText: null }),
      reloadFileContent: (filePath, newContent) => {
        const model = documentRegistry.getModel(filePath)
        if (!model) return
        const currentSnapshot = model.snapshot()
        const snapshot =
          currentSnapshot.text === newContent && !model.isDirty
            ? currentSnapshot
            : documentRegistry.replaceFromDisk(filePath, newContent)
        if (!snapshot) return

        const state = get()
        const openFiles = withDirtyState(state.openFiles, filePath, false)
        if (state.activeFilePath === filePath) {
          set({
            openFiles,
            revision: snapshot.revision,
            isDirty: false
          })
        } else if (openFiles !== state.openFiles) {
          set({ openFiles })
        }
      },

      resetEditor: () => {
        documentRegistry.clear()
        set((state) => ({
          ...emptyEditorState,
          tabMutationEpoch: nextTabMutationEpoch(state.tabMutationEpoch)
        }))
      }
    })),
    {
      name: 'textex-editor-session',
      partialize: (state) => ({
        _sessionOpenPaths: Object.keys(state.openFiles),
        _sessionActiveFile: state.activeFilePath,
        _sessionCursors: Object.fromEntries(
          Object.entries(state.openFiles).map(([path, data]) => [
            path,
            state.activeFilePath === path
              ? { cursorLine: state.cursorLine, cursorColumn: state.cursorColumn }
              : { cursorLine: data.cursorLine, cursorColumn: data.cursorColumn }
          ])
        )
      })
    }
  )
)
