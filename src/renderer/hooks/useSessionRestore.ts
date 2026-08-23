import { useEffect, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { getDesktopCapabilities } from '../platform/capabilities'
import {
  isCurrentProjectTransitionSnapshot,
  openProject,
  type ProjectTransitionSnapshot
} from '../utils/openProject'
import { checkForAppUpdate } from '../services/updateLifecycle'

/**
 * Restores the previous editing session on mount:
 * - Re-enters the serialized project-open lifecycle
 * - Re-opens files from disk
 * - Restores active tab
 *
 * Returns `sessionRestored` flag — false while async work is in progress.
 */
export function useSessionRestore(): boolean {
  const [sessionRestored, setSessionRestored] = useState(false)
  const capabilities = getDesktopCapabilities()

  useEffect(() => {
    let active = true
    const restoreSession = async (): Promise<void> => {
      const projectState = useProjectStore.getState()
      const editorState = useEditorStore.getState()
      const savedRoot = projectState.projectRoot
      const { _sessionOpenPaths, _sessionActiveFile } = editorState
      if (!savedRoot) {
        setSessionRestored(true)
        return
      }

      let snapshot: ProjectTransitionSnapshot | null
      try {
        snapshot = await openProject(savedRoot, { autoOpenFirstTex: false })
      } catch {
        if (!active) return
        if (useProjectStore.getState().projectRoot === savedRoot) {
          useProjectStore.getState().setProjectRoot(null)
        }
        setSessionRestored(true)
        return
      }
      if (!active) return
      if (!snapshot) {
        setSessionRestored(true)
        return
      }

      // Re-open each file from disk
      for (const fp of _sessionOpenPaths) {
        if (!active || !isCurrentProjectTransitionSnapshot(snapshot)) break
        try {
          const result = await window.api.readFile(fp)
          if (!active || !isCurrentProjectTransitionSnapshot(snapshot)) break
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        } catch {
          // File may have been deleted — skip
        }
      }

      // Restore active tab
      if (
        active &&
        isCurrentProjectTransitionSnapshot(snapshot) &&
        _sessionActiveFile &&
        useEditorStore.getState().openFiles[_sessionActiveFile]
      ) {
        useEditorStore.getState().setActiveTab(_sessionActiveFile)
      }
      if (active) setSessionRestored(true)
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  // Also init spell check and check for updates on mount
  useEffect(() => {
    const settings = useSettingsStore.getState().settings
    if (capabilities.spellcheck && settings.spellCheckEnabled) {
      window.api
        .loadSettings()
        .then((s) => window.api.spellInit(s.spellCheckLanguage || 'en-US'))
        .catch(() => {})
    }
    const updateTimer = window.setTimeout(() => {
      if (useSettingsStore.getState().settings.autoUpdateEnabled !== false) {
        void checkForAppUpdate({ interactive: false })
      }
    }, 3000)
    return () => window.clearTimeout(updateTimer)
  }, [capabilities.spellcheck])

  return sessionRestored
}
