import { useCallback } from 'react'
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
    const editorState = useEditorStore.getState()
    const { filePath, updateActiveDocument, markDocumentSaved } = editorState
    const { appendLog, setLogPanelOpen } = useCompileStore.getState()
    const { settings } = useSettingsStore.getState()

    if (!filePath) return
    const initialSnapshot = documentRegistry.snapshot(filePath)
    if (!initialSnapshot) return
    let snapshotToSave = initialSnapshot

    if (settings.formatOnSave) {
      try {
        const formatted = await formatLatex(snapshotToSave.text)
        snapshotToSave = updateActiveDocument(formatted, 'format') ?? snapshotToSave
      } catch (e) {
        console.warn('Format on save failed:', e)
      }
    }

    try {
      await window.api.saveFile(snapshotToSave.text, filePath)
      markDocumentSaved(filePath, snapshotToSave.revision)
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
