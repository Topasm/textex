import { useEffect, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'

/**
 * Restores the previous editing session on mount:
 * - Re-reads directory tree
 * - Re-opens files from disk
 * - Restores active tab
 * - Watches directory for changes
 * - Refreshes git status, bib entries, and labels
 * - Adds project to recent list
 *
 * Returns `sessionRestored` flag — false while async work is in progress.
 */
export function useSessionRestore(): boolean {
  const [sessionRestored, setSessionRestored] = useState(false)

  useEffect(() => {
    const restoreSession = async (): Promise<void> => {
      const projectState = useProjectStore.getState()
      const editorState = useEditorStore.getState()
      const savedRoot = projectState.projectRoot
      const { _sessionOpenPaths, _sessionActiveFile } = editorState
      if (!savedRoot || _sessionOpenPaths.length === 0) {
        setSessionRestored(true)
        return
      }

      // Read directory tree
      try {
        const tree = await window.api.readDirectory(savedRoot)
        useProjectStore.getState().setDirectoryTree(tree)
      } catch {
        // Directory no longer exists — bail out
        useProjectStore.getState().setProjectRoot(null)
        setSessionRestored(true)
        return
      }

      // Re-open each file from disk
      for (const fp of _sessionOpenPaths) {
        try {
          const result = await window.api.readFile(fp)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        } catch {
          // File may have been deleted — skip
        }
      }

      // Restore active tab
      if (_sessionActiveFile && useEditorStore.getState().openFiles[_sessionActiveFile]) {
        useEditorStore.getState().setActiveTab(_sessionActiveFile)
      }

      // Watch directory
      try {
        await window.api.watchDirectory(savedRoot)
      } catch {
        /* ignore */
      }

      // Git status
      try {
        const isRepo = await window.api.gitIsRepo(savedRoot)
        const s = useProjectStore.getState()
        s.setIsGitRepo(isRepo)
        if (isRepo) {
          const status = await window.api.gitStatus(savedRoot)
          s.setGitStatus(status)
          s.setGitBranch(status.branch)
        }
      } catch {
        useProjectStore.getState().setIsGitRepo(false)
      }

      // Bib entries
      try {
        const entries = await window.api.findBibInProject(savedRoot)
        useProjectStore.getState().setBibEntries(entries)
      } catch {
        /* ignore */
      }

      // Labels
      try {
        const labels = await window.api.scanLabels(savedRoot)
        useProjectStore.getState().setLabels(labels)
      } catch {
        /* ignore */
      }

      // Add to recent projects
      try {
        await window.api.addRecentProject(savedRoot)
      } catch {
        /* ignore */
      }

      setSessionRestored(true)
    }

    restoreSession()
  }, [])

  // Also init spell check and check for updates on mount
  useEffect(() => {
    const settings = useSettingsStore.getState().settings
    if (settings.spellCheckEnabled) {
      window.api
        .loadSettings()
        .then((s) => {
          window.api.spellInit(s.spellCheckLanguage || 'en-US')
        })
        .catch(() => {})
    }
    if (useSettingsStore.getState().settings.autoUpdateEnabled !== false) {
      window.api.updateCheck()
    }
  }, [])

  return sessionRestored
}
