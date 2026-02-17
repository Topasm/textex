import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { errorMessage } from '../utils/errorMessage'

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
      const { appendLog, setCompileStatus, setLogPanelOpen, clearLogs } =
        useAppStore.getState()

      // Save ALL dirty files before compiling (multi-file awareness)
      const { openFiles } = useAppStore.getState()
      for (const [path, fileData] of Object.entries(openFiles)) {
        if (fileData.isDirty) {
          try {
            await window.api.saveFile(fileData.content, path)
            const current = useAppStore.getState().openFiles
            if (current[path]) {
              const updated = { ...current }
              updated[path] = { ...updated[path], isDirty: false }
              useAppStore.setState({ openFiles: updated })
            }
          } catch (err: unknown) {
            appendLog(`Save failed for ${path}, skipping compile: ${errorMessage(err)}`)
            setCompileStatus('error')
            setLogPanelOpen(true)
            return
          }
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
    }, 1000)

    return () => clearTimeout(timerRef.current)
  }, [content, filePath])
}
