import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

interface FileOps {
  handleOpen: () => Promise<void>
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
}

export function useFileOps(): FileOps {
  const setFilePath = useAppStore((s) => s.setFilePath)
  const setDirty = useAppStore((s) => s.setDirty)
  const appendLog = useAppStore((s) => s.appendLog)
  const setLogPanelOpen = useAppStore((s) => s.setLogPanelOpen)
  const openFileInTab = useAppStore((s) => s.openFileInTab)

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (result) {
      // openFileInTab must be called FIRST to switch activeFilePath,
      // so that setContent doesn't corrupt the previously active file.
      openFileInTab(result.filePath, result.content)
      setFilePath(result.filePath)
      setDirty(false)
    }
  }, [setFilePath, setDirty, openFileInTab])

  const handleSave = useCallback(async () => {
    const { content, filePath } = useAppStore.getState()
    if (!filePath) {
      // No file path, do save-as
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
      const message = err instanceof Error ? err.message : String(err)
      appendLog(`Save failed: ${message}`)
      setLogPanelOpen(true)
    }
  }, [setFilePath, setDirty, appendLog, setLogPanelOpen])

  const handleSaveAs = useCallback(async () => {
    const { content } = useAppStore.getState()
    const result = await window.api.saveFileAs(content)
    if (result) {
      setFilePath(result.filePath)
      setDirty(false)
    }
  }, [setFilePath, setDirty])

  return { handleOpen, handleSave, handleSaveAs }
}
