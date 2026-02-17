import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

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
      const { appendLog, setCompileStatus, setLogPanelOpen, setDirty, clearLogs, setPdfBase64 } =
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

      // Save the active file content (which may have changed since openFiles snapshot)
      try {
        await window.api.saveFile(content, filePath)
        setDirty(false)
      } catch (err: unknown) {
        appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
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
        const message = errorMessage(err)
        if (message.includes('Compilation was cancelled')) return
        appendLog(message)
        setCompileStatus('error')
        setLogPanelOpen(true)
      }
    }, 1000)

    return () => clearTimeout(timerRef.current)
  }, [content, filePath])
}
