import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Diagnostic } from '../../shared/types'

/**
 * Registers IPC event listeners for:
 * - Auto-update events (available, download-progress, downloaded, error)
 * - Compile log streaming
 * - Diagnostics
 * - Directory watcher refresh
 */
export function useIpcListeners(projectRoot: string | null): void {
  // Update event listeners
  useEffect(() => {
    window.api.onUpdateEvent('available', (version: unknown) => {
      useAppStore.getState().setUpdateStatus('available')
      if (typeof version === 'string') {
        useAppStore.getState().setUpdateVersion(version)
      }
    })
    window.api.onUpdateEvent('download-progress', (progress: unknown) => {
      useAppStore.getState().setUpdateStatus('downloading')
      if (typeof progress === 'number') {
        useAppStore.getState().setUpdateProgress(progress)
      }
    })
    window.api.onUpdateEvent('downloaded', () => {
      useAppStore.getState().setUpdateStatus('ready')
    })
    window.api.onUpdateEvent('error', () => {
      useAppStore.getState().setUpdateStatus('error')
    })
    return () => {
      window.api.removeUpdateListeners()
    }
  }, [])

  // Compile log listener
  useEffect(() => {
    window.api.onCompileLog((log: string) => {
      useAppStore.getState().appendLog(log)
    })
    return () => {
      window.api.removeCompileLogListener()
    }
  }, [])

  // Diagnostics listener
  useEffect(() => {
    window.api.onDiagnostics((diagnostics: Diagnostic[]) => {
      useAppStore.getState().setDiagnostics(diagnostics)
    })
    return () => {
      window.api.removeDiagnosticsListener()
    }
  }, [])

  // Directory watcher refresh
  useEffect(() => {
    if (!projectRoot) return
    window.api.onDirectoryChanged(async () => {
      try {
        const tree = await window.api.readDirectory(projectRoot)
        useAppStore.getState().setDirectoryTree(tree)
      } catch {
        // ignore
      }
    })
    return () => {
      window.api.removeDirectoryChangedListener()
    }
  }, [projectRoot])
}
