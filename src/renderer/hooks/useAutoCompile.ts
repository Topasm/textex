import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useAutoCompile(): void {
  const content = useAppStore((s) => s.content)
  const filePath = useAppStore((s) => s.filePath)
  const setCompileStatus = useAppStore((s) => s.setCompileStatus)
  const setPdfBase64 = useAppStore((s) => s.setPdfBase64)
  const appendLog = useAppStore((s) => s.appendLog)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const setLogPanelOpen = useAppStore((s) => s.setLogPanelOpen)
  const setDirty = useAppStore((s) => s.setDirty)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!filePath) return

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      // Save ALL dirty files before compiling (multi-file awareness)
      const { openFiles } = useAppStore.getState()
      for (const [path, fileData] of Object.entries(openFiles)) {
        if (fileData.isDirty) {
          try {
            await window.api.saveFile(fileData.content, path)
            // Mark this file as clean in the store
            const current = useAppStore.getState().openFiles
            if (current[path]) {
              const updated = { ...current }
              updated[path] = { ...updated[path], isDirty: false }
              useAppStore.setState({ openFiles: updated })
            }
          } catch (err: unknown) {
            const saveErr = err instanceof Error ? err.message : String(err)
            appendLog(`Save failed for ${path}, skipping compile: ${saveErr}`)
            setCompileStatus('error')
            setLogPanelOpen(true)
            return
          }
        }
      }

      // Save the active file content (which may have changed since openFiles snapshot)
      try {
        await window.api.saveFile(content, filePath)
        setDirty(false)
      } catch (err: unknown) {
        const saveErr = err instanceof Error ? err.message : String(err)
        appendLog(`Save failed, skipping compile: ${saveErr}`)
        setCompileStatus('error')
        setLogPanelOpen(true)
        return
      }

      setCompileStatus('compiling')
      clearLogs()
      try {
        const result = await window.api.compile(filePath)
        setPdfBase64(result.pdfBase64)
        setCompileStatus('success')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        // Ignore cancellation errors — a new compile will follow
        if (message === 'Compilation was cancelled') return
        appendLog(message)
        setCompileStatus('error')
        setLogPanelOpen(true)
      }
    }, 1000)

    return () => clearTimeout(timerRef.current)
  }, [
    content,
    filePath,
    setCompileStatus,
    setPdfBase64,
    appendLog,
    clearLogs,
    setLogPanelOpen,
    setDirty
  ])
}
