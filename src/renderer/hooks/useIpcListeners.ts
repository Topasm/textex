import { useUiStore } from '../store/useUiStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { toDisposable } from '../utils/disposable'
import { useDisposable } from './useDisposable'
import type { CompileDiagnosticsEvent, CompileLogEvent } from '../../shared/compileProtocol'
import { isCurrentCompileIdentity } from '../services/compileCoordinator'

/**
 * Registers IPC event listeners for:
 * - Auto-update events (available, download-progress, downloaded, error)
 * - Compile log streaming
 * - Diagnostics
 * - Directory watcher refresh
 */
export function useIpcListeners(
  projectRoot: string | null,
  onFileChange?: (change: { type: string; filename: string }) => void
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
      window.api.onDirectoryChanged(async (change) => {
        try {
          const tree = await window.api.readDirectory(projectRoot)
          useProjectStore.getState().setDirectoryTree(tree)
        } catch {
          // ignore
        }
        onFileChange?.(change)
      })
      store.add(toDisposable(() => window.api.removeDirectoryChangedListener()))
    },
    [projectRoot, onFileChange]
  )
}
