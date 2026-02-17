import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { formatLatex } from '../utils/formatter'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface FileOps {
  handleOpen: () => Promise<void>
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
}

export function useFileOps(): FileOps {
  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (result) {
      const { openFileInTab, setFilePath, setDirty } = useAppStore.getState()
      openFileInTab(result.filePath, result.content)
      setFilePath(result.filePath)
      setDirty(false)
    }
  }, [])

  const handleSave = useCallback(async () => {
    const state = useAppStore.getState()
    const { filePath, setFilePath, setDirty, appendLog, setLogPanelOpen, settings, setContent } = state

    let contentToSave = state.content

    if (settings.formatOnSave) {
      try {
        contentToSave = await formatLatex(contentToSave)
        setContent(contentToSave)
      } catch (e) {
        console.warn('Format on save failed:', e)
      }
    }

    if (!filePath) {
      const result = await window.api.saveFileAs(contentToSave)
      if (result) {
        setFilePath(result.filePath)
        setDirty(false)
      }
      return
    }
    try {
      await window.api.saveFile(contentToSave, filePath)
      setDirty(false)
    } catch (err: unknown) {
      appendLog(`Save failed: ${errorMessage(err)}`)
      setLogPanelOpen(true)
    }
  }, [])

  const handleSaveAs = useCallback(async () => {
    const { content, setFilePath, setDirty } = useAppStore.getState()
    // Trigger format on save-as as well? Spec doesn't say, but consistent.
    // However, usually "Format on Save" applies to explicit save actions.
    // For now, let's keep Save As simple or we can add it if needed.
    // Let's stick to the existing behavior for Save As for now, 
    // or maybe apply formatting there too if desired. 
    // Users often expect "Format on Save" to apply to any save.
    // But let's just use raw content for Save As to follow least surprise if they just want to dump current state.
    // Actually, consistency suggests formatting. But valid arguments either way.
    // I'll leave Save As unformatted for now unless requested.

    const result = await window.api.saveFileAs(content)
    if (result) {
      setFilePath(result.filePath)
      setDirty(false)
    }
  }, [])

  return { handleOpen, handleSave, handleSaveAs }
}
