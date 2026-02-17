import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

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
      const state = useAppStore.getState()
      const { projectRoot: savedRoot, _sessionOpenPaths, _sessionActiveFile } = state
      if (!savedRoot || _sessionOpenPaths.length === 0) {
        setSessionRestored(true)
        return
      }

      // Read directory tree
      try {
        const tree = await window.api.readDirectory(savedRoot)
        useAppStore.getState().setDirectoryTree(tree)
      } catch {
        // Directory no longer exists — bail out
        useAppStore.getState().setProjectRoot(null)
        setSessionRestored(true)
        return
      }

      // Re-open each file from disk
      for (const fp of _sessionOpenPaths) {
        try {
          const result = await window.api.readFile(fp)
          useAppStore.getState().openFileInTab(result.filePath, result.content)
        } catch {
          // File may have been deleted — skip
        }
      }

      // Restore active tab
      if (_sessionActiveFile && useAppStore.getState().openFiles[_sessionActiveFile]) {
        useAppStore.getState().setActiveTab(_sessionActiveFile)
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
        const s = useAppStore.getState()
        s.setIsGitRepo(isRepo)
        if (isRepo) {
          const status = await window.api.gitStatus(savedRoot)
          s.setGitStatus(status)
          s.setGitBranch(status.branch)
        }
      } catch {
        useAppStore.getState().setIsGitRepo(false)
      }

      // Bib entries
      try {
        const entries = await window.api.findBibInProject(savedRoot)
        useAppStore.getState().setBibEntries(entries)
      } catch {
        /* ignore */
      }

      // Labels
      try {
        const labels = await window.api.scanLabels(savedRoot)
        useAppStore.getState().setLabels(labels)
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
    const settings = useAppStore.getState().settings
    if (settings.spellCheckEnabled) {
      window.api
        .loadSettings()
        .then((s) => {
          window.api.spellInit(s.spellCheckLanguage || 'en-US')
        })
        .catch(() => {})
    }
    if (useAppStore.getState().settings.autoUpdateEnabled !== false) {
      window.api.updateCheck()
    }
  }, [])

  return sessionRestored
}
