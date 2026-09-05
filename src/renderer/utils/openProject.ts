import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { documentRegistry } from '../models/documentRegistry'
import {
  invalidateResearchProjectOpenSync,
  syncResearchOnProjectOpen
} from '../services/researchProjectLifecycle'
import {
  clearResearchProfileDraft,
  hasUnsavedResearchProfileDraft
} from '../services/researchProfileDraft'
import type { DirectoryEntry } from '../../shared/types'
import { projectPathKey } from '../services/projectIndex'
import { discardRecoveryForFiles } from '../services/crashRecovery'
import { findDefaultTexFile } from '../services/defaultTexFile'
import { flushAllPendingDocumentEdits } from '../services/pendingDocumentEdits'

interface OpenProjectOptions {
  autoOpenFirstTex?: boolean
  deferProjectEnrichment?: boolean
}

export interface ProjectTransitionSnapshot {
  generation: number
  projectPath: string
}

let projectTransitionRequestGeneration = 0
let activeProjectGeneration = 0
let nativeProjectTransition: Promise<void> = Promise.resolve()

/**
 * Runs before any project transition can advance the renderer generation or
 * activate/deactivate the native project. The registry is authoritative for
 * dirty state, including inactive tabs.
 */
export function confirmProjectTransition(): boolean {
  flushAllPendingDocumentEdits()
  const dirtyDocumentCount = documentRegistry.dirtySnapshots().length
  const dirtyResearchProfile = hasUnsavedResearchProfileDraft()
  if (dirtyDocumentCount === 0 && !dirtyResearchProfile) return true

  const dirtyItems: string[] = []
  if (dirtyDocumentCount > 0) {
    const documentLabel = dirtyDocumentCount === 1 ? 'document has' : 'documents have'
    dirtyItems.push(`${dirtyDocumentCount} open ${documentLabel} unsaved changes`)
  }
  if (dirtyResearchProfile) dirtyItems.push('the research profile has unsaved changes')
  return window.confirm(`${dirtyItems.join(' and ')}. Discard them and continue?`)
}

function isCurrentProjectTransition(generation: number, projectPath?: string): boolean {
  if (generation !== activeProjectGeneration) return false
  return projectPath === undefined || useProjectStore.getState().projectRoot === projectPath
}

export function isCurrentProjectTransitionSnapshot(snapshot: ProjectTransitionSnapshot): boolean {
  return isCurrentProjectTransition(snapshot.generation, snapshot.projectPath)
}

export function clearProjectScopedRendererState(): void {
  clearResearchProfileDraft()
  useEditorStore.getState().resetEditor()
  useCompileStore.setState({
    compileStatus: 'idle',
    pdfPath: null,
    pdfRevision: 0,
    pdfDocumentId: null,
    pdfDocumentRevision: null,
    logs: '',
    diagnostics: []
  })
  useProjectStore.setState({
    directoryTree: null,
    directoryRefreshVersions: {},
    projectIndex: null,
    bibEntries: [],
    citationGroups: [],
    auxCitationMap: null,
    labels: [],
    packageData: {},
    detectedPackages: [],
    isGitRepo: false,
    gitBranch: '',
    gitStatus: null
  })
  usePdfStore.setState({
    synctexHighlight: null,
    pdfSearchVisible: false,
    pdfSearchQuery: '',
    syncToCodeRequest: null,
    currentPage: 1,
    numPages: 0,
    scrollToPage: null,
    fitRequest: null
  })
  useUiStore.setState({
    documentSymbols: [],
    externalChangeConflicts: []
  })
}

async function runNativeProjectTransition<T>(operation: () => Promise<T>): Promise<T> {
  const previous = nativeProjectTransition
  let releaseTransition: () => void = () => undefined
  nativeProjectTransition = new Promise<void>((resolve) => {
    releaseTransition = resolve
  })
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    releaseTransition()
  }
}

async function enrichOpenedProject(snapshot: ProjectTransitionSnapshot): Promise<void> {
  const { generation, projectPath } = snapshot
  const isCurrent = (): boolean => isCurrentProjectTransition(generation, projectPath)

  await Promise.all([
    (async () => {
      try {
        const isRepo = await window.api.gitIsRepo(projectPath)
        if (!isCurrent()) return
        if (!isRepo) {
          useProjectStore.getState().setIsGitRepo(false)
          return
        }

        const status = await window.api.gitStatus(projectPath)
        if (!isCurrent()) return
        const projectStore = useProjectStore.getState()
        projectStore.setIsGitRepo(true)
        projectStore.setGitStatus(status)
        projectStore.setGitBranch(status.branch)
      } catch {
        if (isCurrent()) useProjectStore.getState().setIsGitRepo(false)
      }
    })(),
    (async () => {
      try {
        const entries = await window.api.findBibInProject(projectPath)
        if (isCurrent()) useProjectStore.getState().setBibEntries(entries)
      } catch {
        // Bibliography discovery is optional project enrichment.
      }
    })(),
    (async () => {
      try {
        const labels = await window.api.scanLabels(projectPath)
        if (isCurrent()) useProjectStore.getState().setLabels(labels)
      } catch {
        // Label discovery is optional project enrichment.
      }
    })(),
    (async () => {
      try {
        await window.api.addRecentProject(projectPath)
      } catch {
        // Recent-project persistence must not block opening the workspace.
      }
    })()
  ])
}

/**
 * Reconciles renderer state after a native project transition rejects. Native
 * activation and deactivation intentionally clear project authority before
 * cleaning up every dependent service, so an error does not imply that the
 * previous native project is still active.
 */
async function reconcileFailedNativeTransition(requestGeneration: number): Promise<void> {
  if (requestGeneration !== projectTransitionRequestGeneration) return
  const renderedRoot = useProjectStore.getState().projectRoot
  let nativeRoot: string | null = null
  try {
    nativeRoot = await window.api.getActiveProject()
  } catch {
    // When native authority cannot be established, fail closed instead of
    // leaving a renderer that appears able to access the previous project.
  }
  // The authority lookup runs after the native transition queue is released.
  // A newer open/close can therefore win while this command is in flight.
  if (requestGeneration !== projectTransitionRequestGeneration) return
  if (renderedRoot && nativeRoot && projectPathKey(renderedRoot) === projectPathKey(nativeRoot)) {
    return
  }

  activeProjectGeneration += 1
  invalidateResearchProjectOpenSync()
  window.api.removeDirectoryChangedListener()
  clearProjectScopedRendererState()
  useProjectStore.getState().setProjectRoot(nativeRoot)
}

/**
 * Closes the native project through the shared transition queue. Existing
 * renderer work remains valid until native deactivation actually commits.
 */
export async function deactivateProject(): Promise<boolean> {
  const discardedDocumentPaths = documentRegistry.dirtySnapshots().map(({ filePath }) => filePath)
  if (!confirmProjectTransition()) return false

  // The user explicitly chose to discard these changes. Clear their durable
  // recovery copies before native project authority is released.
  await discardRecoveryForFiles(discardedDocumentPaths)

  const requestGeneration = ++projectTransitionRequestGeneration
  let deactivated: boolean
  try {
    deactivated = await runNativeProjectTransition(async () => {
      if (requestGeneration !== projectTransitionRequestGeneration) return false
      await window.api.deactivateProject()
      return requestGeneration === projectTransitionRequestGeneration
    })
  } catch (error) {
    if (requestGeneration === projectTransitionRequestGeneration) {
      await reconcileFailedNativeTransition(requestGeneration)
    }
    throw error
  }
  if (!deactivated || requestGeneration !== projectTransitionRequestGeneration) return false

  activeProjectGeneration += 1
  invalidateResearchProjectOpenSync()
  window.api.removeDirectoryChangedListener()
  clearProjectScopedRendererState()
  useProjectStore.getState().setProjectRoot(null)
  return true
}

export async function openProject(
  dirPath: string,
  options: OpenProjectOptions = {}
): Promise<ProjectTransitionSnapshot | null> {
  const discardedDocumentPaths = documentRegistry.dirtySnapshots().map(({ filePath }) => filePath)
  if (!confirmProjectTransition()) return null
  await discardRecoveryForFiles(discardedDocumentPaths)

  const { autoOpenFirstTex = true, deferProjectEnrichment = false } = options
  const requestGeneration = ++projectTransitionRequestGeneration
  let projectPath: string | null
  try {
    projectPath = await runNativeProjectTransition(async () => {
      if (requestGeneration !== projectTransitionRequestGeneration) return null
      const activatedPath = await window.api.activateProject(dirPath)
      if (requestGeneration !== projectTransitionRequestGeneration) return null

      // Activating the project advances the native project epoch. Remove the
      // previous watcher before publishing the new renderer root.
      try {
        await window.api.unwatchDirectory()
      } catch {
        // A failed cleanup must not prevent the epoch-guarded replacement
        // watcher from being installed below.
      }

      // Detach the old root's renderer callback before creating the new native
      // channel. React installs the new callback after the new root is
      // published; the initial index scan therefore always starts after the
      // watcher commit point and reconciles any events in this short interval.
      window.api.removeDirectoryChangedListener()
      try {
        await window.api.watchDirectory(activatedPath)
      } catch {
        // The project remains usable when native watching is unavailable. The
        // authoritative index read still supplies the initial project state.
      }
      return requestGeneration === projectTransitionRequestGeneration ? activatedPath : null
    })
  } catch (error) {
    if (requestGeneration === projectTransitionRequestGeneration)
      await reconcileFailedNativeTransition(requestGeneration)
    throw error
  }
  if (!projectPath || requestGeneration !== projectTransitionRequestGeneration) return null
  const generation = ++activeProjectGeneration
  invalidateResearchProjectOpenSync()
  clearProjectScopedRendererState()
  useProjectStore.getState().setProjectRoot(projectPath)
  void syncResearchOnProjectOpen(projectPath).catch(() => {
    // Opening the project remains successful when an optional background
    // Zotero sync is unavailable. Manual sync can report the actionable error.
  })

  let tree: DirectoryEntry[] = []
  try {
    tree = await window.api.readDirectory(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return null
    useProjectStore.getState().setDirectoryTree(tree)
  } catch {
    // ignore
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return null

  if (!useProjectStore.getState().isSidebarOpen) {
    useProjectStore.getState().toggleSidebar()
  }
  useProjectStore.getState().setSidebarView('files')

  // Prefer the conventional root document and support projects whose TeX
  // sources live below the project root.
  const texFile = findDefaultTexFile(tree)
  if (autoOpenFirstTex && texFile) {
    try {
      const result = await window.api.readFile(texFile.path)
      if (!isCurrentProjectTransition(generation, projectPath)) return null
      useEditorStore.getState().openFileInTab(result.filePath, result.content)
    } catch {
      // ignore
    }
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return null

  const snapshot = { generation, projectPath }
  const enrichment = enrichOpenedProject(snapshot)
  if (deferProjectEnrichment) {
    void enrichment
    return snapshot
  }

  await enrichment
  return isCurrentProjectTransitionSnapshot(snapshot) ? snapshot : null
}
