import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import type {
  DocumentChangeSource,
  DocumentRevisionSnapshot,
  DocumentSnapshot
} from '../models/documentModel'
import { documentRegistry } from '../models/documentRegistry'

interface OpenFileData {
  isDirty: boolean
  cursorLine: number
  cursorColumn: number
}

interface EditorState {
  filePath: string | null
  activeFilePath: string | null
  isDirty: boolean
  revision: number
  openFiles: Record<string, OpenFileData>

  cursorLine: number
  cursorColumn: number
  pendingJump: { line: number; column: number; skipFocus?: boolean } | null
  pendingInsertText: string | null

  _sessionOpenPaths: string[]
  _sessionActiveFile: string | null

  updateActiveDocument: (text: string, source?: DocumentChangeSource) => DocumentSnapshot | null
  recordEditorChange: (filePath: string) => DocumentRevisionSnapshot | null
  markDocumentSaved: (filePath: string, revision?: number) => boolean
  openFileInTab: (filePath: string, content: string) => void
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

export type { OpenFileData }

function withDirtyState(
  openFiles: Record<string, OpenFileData>,
  filePath: string,
  isDirty: boolean
): Record<string, OpenFileData> {
  const current = openFiles[filePath]
  if (!current || current.isDirty === isDirty) return openFiles
  return { ...openFiles, [filePath]: { ...current, isDirty } }
}

const emptyEditorState = {
  filePath: null,
  activeFilePath: null,
  isDirty: false,
  revision: 0,
  openFiles: {},
  cursorLine: 1,
  cursorColumn: 1,
  pendingJump: null,
  pendingInsertText: null,
  _sessionOpenPaths: [] as string[],
  _sessionActiveFile: null
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
          cursorColumn: fileData.cursorColumn
        })
      },

      closeTab: (filePath) => {
        const state = get()
        const openFiles = { ...state.openFiles }
        delete openFiles[filePath]
        documentRegistry.close(filePath)

        if (state.activeFilePath !== filePath) {
          set({ openFiles })
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
            cursorColumn: 1
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
          cursorColumn: nextData.cursorColumn
        })
      },

      setActiveTab: (filePath) => {
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
          cursorColumn: target.cursorColumn
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
        set({ ...emptyEditorState })
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
            { cursorLine: data.cursorLine, cursorColumn: data.cursorColumn }
          ])
        )
      })
    }
  )
)
