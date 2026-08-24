import { useCallback, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { formatLatex } from '../utils/formatter'
import { isCurrentProjectTransitionSnapshot, openProject } from '../utils/openProject'
import { errorMessage } from '../utils/errorMessage'
import { documentRegistry } from '../models/documentRegistry'

interface FileOps {
  handleOpen: () => Promise<void>
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
}

export function useFileOps(): FileOps {
  const saveRequestIdRef = useRef(0)

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (result) {
      // Derive parent directory and open it as the project so the workspace renders
      const parentDir = result.filePath.replace(/[/\\][^/\\]+$/, '')
      const project = await openProject(parentDir, { autoOpenFirstTex: false })
      if (!project || !isCurrentProjectTransitionSnapshot(project)) return

      // Open the specific file the user selected (overrides openProject's auto-open)
      useEditorStore.getState().openFileInTab(result.filePath, result.content)
    }
  }, [])

  const handleSave = useCallback(async () => {
    const saveRequestId = ++saveRequestIdRef.current
    const editorState = useEditorStore.getState()
    const { filePath } = editorState
    const { appendLog, setLogPanelOpen } = useCompileStore.getState()
    const { settings } = useSettingsStore.getState()

    if (!filePath) return
    const initialModel = documentRegistry.getModel(filePath)
    const initialSnapshot = initialModel?.snapshot()
    if (!initialSnapshot) return
    let snapshotToSave = initialSnapshot

    if (settings.formatOnSave) {
      try {
        const formatted = await formatLatex(snapshotToSave.text)
        if (saveRequestId !== saveRequestIdRef.current) return

        const currentModel = documentRegistry.getModel(filePath)
        if (!currentModel || currentModel !== initialModel) return

        const currentEditorState = useEditorStore.getState()
        if (
          currentEditorState.activeFilePath === filePath &&
          initialModel.isCurrent(initialSnapshot)
        ) {
          snapshotToSave =
            currentEditorState.updateActiveDocument(formatted, 'format') ?? initialSnapshot
        } else {
          // Formatting raced with an edit or tab switch. Save the current text,
          // but never apply the stale formatted result to a document buffer.
          snapshotToSave = currentModel.snapshot()
        }
      } catch (e) {
        console.warn('Format on save failed:', e)
      }
    }

    if (saveRequestId !== saveRequestIdRef.current) return

    try {
      await window.api.saveFile(snapshotToSave.text, filePath)
      useEditorStore.getState().markDocumentSaved(filePath, snapshotToSave.revision)
    } catch (err: unknown) {
      appendLog(`Save failed: ${errorMessage(err)}`)
      setLogPanelOpen(true)
    }
  }, [])

  const handleSaveAs = useCallback(async () => {
    const state = useEditorStore.getState()
    const filePath = state.filePath
    if (!filePath) return
    const snapshot = documentRegistry.snapshot(filePath)
    if (!snapshot) return

    const result = await window.api.saveFileAs(snapshot.text)
    if (result) {
      state.openFileInTab(result.filePath, snapshot.text)
      if (result.filePath !== filePath) state.closeTab(filePath)
      state.markDocumentSaved(result.filePath)
    }
  }, [])

  return { handleOpen, handleSave, handleSaveAs }
}
