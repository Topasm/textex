import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { errorMessage } from '../utils/errorMessage'
import { AUTO_COMPILE_DELAY_MS } from '../constants'

export function useAutoCompile(): void {
  const content = useAppStore((s) => s.content)
  const filePath = useAppStore((s) => s.filePath)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!filePath) return
    // Only auto-compile .tex files
    if (!filePath.toLowerCase().endsWith('.tex')) return

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const { appendLog, setCompileStatus, setLogPanelOpen, clearLogs } = useAppStore.getState()

      // Save ALL dirty files before compiling (multi-file awareness)
      // Use batch save IPC to write all dirty files concurrently in a single call
      const { openFiles } = useAppStore.getState()
      const dirtyEntries = Object.entries(openFiles).filter(([, fileData]) => fileData.isDirty)
      if (dirtyEntries.length > 0) {
        try {
          await window.api.saveFileBatch(
            dirtyEntries.map(([filePath, fileData]) => ({ content: fileData.content, filePath }))
          )
          // Mark all dirty files as clean
          const current = useAppStore.getState().openFiles
          const updated = { ...current }
          for (const [filePath] of dirtyEntries) {
            if (updated[filePath]) {
              updated[filePath] = { ...updated[filePath], isDirty: false }
            }
          }
          useAppStore.setState({ openFiles: updated })
        } catch (err: unknown) {
          appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
          setCompileStatus('error')
          setLogPanelOpen(true)
          return
        }
      }

      // Fetch fresh state inside debounce callback to avoid stale closures
      const freshState = useAppStore.getState()
      const currentContent = freshState.content
      const currentFilePath = freshState.filePath
      if (!currentFilePath) return

      // Save the active file content (which may have changed since openFiles snapshot)
      try {
        await window.api.saveFile(currentContent, currentFilePath)
        useAppStore.getState().setDirty(false)
      } catch (err: unknown) {
        appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
        setCompileStatus('error')
        setLogPanelOpen(true)
        return
      }

      setCompileStatus('compiling')
      clearLogs()
      try {
        const result = await window.api.compile(currentFilePath)
        useAppStore.getState().setPdfBase64(result.pdfBase64)
        useAppStore.getState().setCompileStatus('success')
      } catch (err: unknown) {
        const message = errorMessage(err)
        if (message.includes('Compilation was cancelled')) return
        useAppStore.getState().appendLog(message)
        useAppStore.getState().setCompileStatus('error')
        useAppStore.getState().setLogPanelOpen(true)
      }
    }, AUTO_COMPILE_DELAY_MS)

    return () => clearTimeout(timerRef.current)
  }, [content, filePath])
}
