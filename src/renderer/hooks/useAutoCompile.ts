import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { errorMessage } from '../utils/errorMessage'
import { AUTO_COMPILE_DELAY_MS } from '../constants'
import { parseAuxContent } from '../../shared/auxparser'

export function useAutoCompile(): void {
  const content = useEditorStore((s) => s.content)
  const filePath = useEditorStore((s) => s.filePath)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!filePath) return
    // Only auto-compile .tex files
    if (!filePath.toLowerCase().endsWith('.tex')) return

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const { appendLog, setCompileStatus, clearLogs } = useCompileStore.getState()

      // Save ALL dirty files before compiling (multi-file awareness)
      // Use batch save IPC to write all dirty files concurrently in a single call
      const { openFiles } = useEditorStore.getState()
      const dirtyEntries = Object.entries(openFiles).filter(([, fileData]) => fileData.isDirty)
      if (dirtyEntries.length > 0) {
        try {
          await window.api.saveFileBatch(
            dirtyEntries.map(([filePath, fileData]) => ({ content: fileData.content, filePath }))
          )
          // Mark all dirty files as clean
          const current = useEditorStore.getState().openFiles
          const updated = { ...current }
          for (const [filePath] of dirtyEntries) {
            if (updated[filePath]) {
              updated[filePath] = { ...updated[filePath], isDirty: false }
            }
          }
          useEditorStore.setState({ openFiles: updated })
        } catch (err: unknown) {
          appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
          setCompileStatus('error')
          return
        }
      }

      // Fetch fresh state inside debounce callback to avoid stale closures
      const freshState = useEditorStore.getState()
      const currentContent = freshState.content
      const currentFilePath = freshState.filePath
      if (!currentFilePath) return

      // Save the active file content (which may have changed since openFiles snapshot)
      try {
        await window.api.saveFile(currentContent, currentFilePath)
        useEditorStore.getState().setDirty(false)
      } catch (err: unknown) {
        appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
        setCompileStatus('error')
        return
      }

      setCompileStatus('compiling')
      clearLogs()
      try {
        const result = await window.api.compile(currentFilePath)
        useCompileStore.getState().setPdfPath(result.pdfPath)
        useCompileStore.getState().setCompileStatus('success')

        // Load .aux file for citation tooltip reverse-lookup
        try {
          const auxPath = currentFilePath.replace(/\.tex$/, '.aux')
          const { content: auxContent } = await window.api.readFile(auxPath)
          useProjectStore.getState().setAuxCitationMap(parseAuxContent(auxContent))
        } catch {
          useProjectStore.getState().setAuxCitationMap(null)
        }
      } catch (err: unknown) {
        const message = errorMessage(err)
        if (message.includes('Compilation was cancelled')) return
        useCompileStore.getState().appendLog(message)
        useCompileStore.getState().setCompileStatus('error')
      }
    }, AUTO_COMPILE_DELAY_MS)

    return () => clearTimeout(timerRef.current)
  }, [content, filePath])
}
