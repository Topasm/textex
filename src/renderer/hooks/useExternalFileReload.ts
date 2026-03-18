import { useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { useSettingsStore } from '../store/useSettingsStore'

const RELOAD_DEBOUNCE_MS = 300

/**
 * Returns a callback that handles `fs:directory-changed` events and
 * reloads open files whose content has changed on disk.
 *
 * - Clean files are reloaded automatically (auto-compile triggers naturally).
 * - Dirty files surface a conflict banner so the user can choose.
 */
export function useExternalFileReload(
  projectRoot: string | null
): (change: { type: string; filename: string }) => void {
  const debounceMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Clean up all pending timers on unmount
  useEffect(() => {
    const map = debounceMapRef.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  // Remove stale conflicts when tabs are closed
  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      (s) => s.openFiles,
      (openFiles) => {
        const conflicts = useUiStore.getState().externalChangeConflicts
        for (const p of conflicts) {
          if (!openFiles[p]) {
            useUiStore.getState().removeExternalChangeConflict(p)
          }
        }
      }
    )
    return unsub
  }, [])

  const handleFileChange = useCallback(
    (change: { type: string; filename: string }) => {
      if (!projectRoot) return

      const watchEnabled = useSettingsStore.getState().settings.watchOpenFiles
      if (!watchEnabled) return

      // Resolve relative filename to absolute path
      const sep = projectRoot.includes('\\') ? '\\' : '/'
      const absolutePath = projectRoot + sep + change.filename.replace(/[\\/]/g, sep)

      // Only process files that are open in a tab
      const { openFiles } = useEditorStore.getState()
      if (!openFiles[absolutePath]) return

      // Per-file debounce to handle rapid successive changes
      const existing = debounceMapRef.current.get(absolutePath)
      if (existing) clearTimeout(existing)

      debounceMapRef.current.set(
        absolutePath,
        setTimeout(async () => {
          debounceMapRef.current.delete(absolutePath)

          // Re-check after debounce — file may have been closed
          const currentState = useEditorStore.getState()
          const fileData = currentState.openFiles[absolutePath]
          if (!fileData) return

          try {
            const { content: diskContent } = await window.api.readFile(absolutePath)

            // Skip if content is identical (e.g. TextEx itself saved the file)
            if (diskContent === fileData.content) return

            if (fileData.isDirty) {
              // File has unsaved local changes — show conflict banner
              useUiStore.getState().addExternalChangeConflict(absolutePath)
            } else {
              // File is clean — auto-reload
              currentState.reloadFileContent(absolutePath, diskContent)
            }
          } catch {
            // File may have been deleted or temporarily inaccessible; ignore
          }
        }, RELOAD_DEBOUNCE_MS)
      )
    },
    [projectRoot]
  )

  return handleFileChange
}
