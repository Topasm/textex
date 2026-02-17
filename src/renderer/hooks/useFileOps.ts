import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

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
    const { content, filePath, setFilePath, setDirty, appendLog, setLogPanelOpen } =
      useAppStore.getState()
    if (!filePath) {
      const result = await window.api.saveFileAs(content)
      if (result) {
        setFilePath(result.filePath)
        setDirty(false)
      }
      return
    }
    try {
      await window.api.saveFile(content, filePath)
      setDirty(false)
    } catch (err: unknown) {
      appendLog(`Save failed: ${errorMessage(err)}`)
      setLogPanelOpen(true)
    }
  }, [])

  const handleSaveAs = useCallback(async () => {
    const { content, setFilePath, setDirty } = useAppStore.getState()
    const result = await window.api.saveFileAs(content)
    if (result) {
      setFilePath(result.filePath)
      setDirty(false)
    }
  }, [])

  return { handleOpen, handleSave, handleSaveAs }
}
