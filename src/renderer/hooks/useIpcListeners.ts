import { useUiStore } from '../store/useUiStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { toDisposable } from '../utils/disposable'
import { useDisposable } from './useDisposable'
import type { CompileDiagnosticsEvent, CompileLogEvent } from '../../shared/compileProtocol'
import { isCurrentCompileIdentity } from '../services/compileCoordinator'
import { ProjectIndexRefreshCoordinator } from '../services/projectIndex'
import type { DirectoryChangeEvent } from '../../shared/types'

/**
 * Registers IPC event listeners for:
 * - Auto-update events (available, download-progress, downloaded, error)
 * - Compile log streaming
 * - Diagnostics
 * - Directory watcher refresh
 */
export function useIpcListeners(
  projectRoot: string | null,
  onFileChange?: (change: DirectoryChangeEvent) => void
): void {
  // Update event listeners
  useDisposable((store) => {
    window.api.onUpdateEvent('available', (version: unknown) => {
      useUiStore.getState().setUpdateStatus('available')
      if (typeof version === 'string') {
        useUiStore.getState().setUpdateVersion(version)
      }
    })
    window.api.onUpdateEvent('download-progress', (progress: unknown) => {
      useUiStore.getState().setUpdateStatus('downloading')
      if (typeof progress === 'number') {
        useUiStore.getState().setUpdateProgress(progress)
      }
    })
    window.api.onUpdateEvent('downloaded', () => {
      useUiStore.getState().setUpdateStatus('ready')
    })
    window.api.onUpdateEvent('error', () => {
      useUiStore.getState().setUpdateStatus('error')
    })
    store.add(toDisposable(() => window.api.removeUpdateListeners()))
  }, [])

  // Compile log listener
  useDisposable((store) => {
    window.api.onCompileLog((event: CompileLogEvent) => {
      if (isCurrentCompileIdentity(event)) {
        useCompileStore.getState().appendLog(event.text)
      }
    })
    store.add(toDisposable(() => window.api.removeCompileLogListener()))
  }, [])

  // Diagnostics listener
  useDisposable((store) => {
    window.api.onDiagnostics((event: CompileDiagnosticsEvent) => {
      if (isCurrentCompileIdentity(event)) {
        useCompileStore.getState().setDiagnostics(event.diagnostics)
      }
    })
    store.add(toDisposable(() => window.api.removeDiagnosticsListener()))
  }, [])

  // Directory watcher refresh + external file reload
  useDisposable(
    (store) => {
      if (!projectRoot) return
      const projectIndex = new ProjectIndexRefreshCoordinator({
        projectRoot,
        readDirectory: (directoryPath) => window.api.readDirectory(directoryPath),
        publishRoot: (tree) => useProjectStore.getState().setDirectoryTree(tree),
        invalidateDirectory: (directoryPath) =>
          useProjectStore.getState().invalidateDirectory(directoryPath)
      })
      window.api.onDirectoryChanged((change) => {
        projectIndex.enqueue(change)
        onFileChange?.(change)
      })
      store.add(projectIndex)
      store.add(toDisposable(() => window.api.removeDirectoryChangedListener()))
    },
    [projectRoot, onFileChange]
  )
}
