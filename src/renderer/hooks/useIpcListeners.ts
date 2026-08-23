import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { toDisposable } from '../utils/disposable'
import { useDisposable } from './useDisposable'
import type { CompileDiagnosticsEvent, CompileLogEvent } from '../../shared/compileProtocol'
import { isCurrentCompileIdentity } from '../services/compileCoordinator'
import { ProjectIndexRefreshCoordinator, projectPathKey } from '../services/projectIndex'
import type { DirectoryChangeEvent, ProjectIndexDelta } from '../../shared/types'
import { logError } from '../utils/errorMessage'

/**
 * Registers IPC event listeners for:
 * - Compile log streaming
 * - Diagnostics
 * - Directory watcher refresh
 */
export function useIpcListeners(
  projectRoot: string | null,
  onFileChange?: (change: DirectoryChangeEvent) => void
): void {
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
      let disposed = false
      let indexLoad: Promise<void> | null = null
      let pendingIndexDeltas: ProjectIndexDelta[] = []
      let indexReloadGeneration = 0
      const projectIndex = new ProjectIndexRefreshCoordinator({
        projectRoot,
        readDirectory: (directoryPath) => window.api.readDirectory(directoryPath),
        publishRoot: (tree) => useProjectStore.getState().setDirectoryTree(tree),
        invalidateDirectory: (directoryPath) =>
          useProjectStore.getState().invalidateDirectory(directoryPath),
        onError: (error) => logError('ProjectIndex:refreshTree', error)
      })

      const loadProjectIndex = (): void => {
        if (indexLoad || disposed) return
        const requestedReloadGeneration = indexReloadGeneration
        indexLoad = window.api
          .getProjectIndex()
          .then((snapshot) => {
            if (
              disposed ||
              requestedReloadGeneration !== indexReloadGeneration ||
              projectPathKey(snapshot.root) !== projectPathKey(projectRoot)
            )
              return
            const projectState = useProjectStore.getState()
            projectState.setProjectIndex(snapshot)
            const pending = pendingIndexDeltas.sort(
              (left, right) => left.generation - right.generation
            )
            pendingIndexDeltas = []
            for (const delta of pending) {
              if (!useProjectStore.getState().applyProjectIndexDelta(delta)) {
                pendingIndexDeltas.push(delta)
                break
              }
            }
          })
          .catch((error) => {
            pendingIndexDeltas = []
            if (!disposed) logError('ProjectIndex:load', error)
          })
          .finally(() => {
            indexLoad = null
            if (
              !disposed &&
              (requestedReloadGeneration !== indexReloadGeneration || pendingIndexDeltas.length > 0)
            )
              loadProjectIndex()
          })
      }

      window.api.onDirectoryChanged((change) => {
        projectIndex.enqueue(change)
        if (change.indexInvalidated) {
          indexReloadGeneration += 1
          pendingIndexDeltas = []
          useProjectStore.getState().setProjectIndex(null)
          loadProjectIndex()
        }
        if (change.indexDelta) {
          const state = useProjectStore.getState()
          if (indexLoad || !state.projectIndex) {
            pendingIndexDeltas.push(change.indexDelta)
          } else if (!state.applyProjectIndexDelta(change.indexDelta)) {
            pendingIndexDeltas.push(change.indexDelta)
            loadProjectIndex()
          }
        }
        onFileChange?.(change)
      })
      loadProjectIndex()
      store.add(projectIndex)
      store.add(
        toDisposable(() => {
          disposed = true
          pendingIndexDeltas = []
        })
      )
      store.add(toDisposable(() => window.api.removeDirectoryChangedListener()))
    },
    [projectRoot, onFileChange]
  )
}
