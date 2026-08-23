import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { documentRegistry } from '../models/documentRegistry'
import { stopLspClient } from '../lsp/lspClient'
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

interface OpenProjectOptions {
  autoOpenFirstTex?: boolean
}

export interface ProjectTransitionSnapshot {
  generation: number
  projectPath: string
}

let projectTransitionGeneration = 0
let nativeProjectTransition: Promise<void> = Promise.resolve()

/**
 * Runs before any project transition can advance the renderer generation or
 * activate/deactivate the native project. The registry is authoritative for
 * dirty state, including inactive tabs.
 */
export function confirmProjectTransition(): boolean {
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
  if (generation !== projectTransitionGeneration) return false
  return projectPath === undefined || useProjectStore.getState().projectRoot === projectPath
}

export function isCurrentProjectTransitionSnapshot(snapshot: ProjectTransitionSnapshot): boolean {
  return isCurrentProjectTransition(snapshot.generation, snapshot.projectPath)
}

export function clearProjectScopedRendererState(): void {
  clearResearchProfileDraft()
  stopLspClient()
  useEditorStore.getState().resetEditor()
  useCompileStore.setState({
    compileStatus: 'idle',
    pdfPath: null,
    pdfRevision: 0,
    pdfDocumentId: null,
    pdfDocumentRevision: null,
    logs: '',
    isLogPanelOpen: false,
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
    pdfMatchCount: 0,
    pdfCurrentMatch: 0,
    pdfSearchNextRequest: null,
    pdfSearchPrevRequest: null,
    syncToCodeRequest: null,
    currentPage: 1,
    numPages: 0,
    scrollToPage: null,
    fitRequest: null
  })
  useUiStore.setState({
    lspStatus: 'stopped',
    lspError: null,
    documentSymbols: [],
    isTerminalPaneOpen: false,
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

async function reconcileFailedNativeActivation(generation: number): Promise<void> {
  if (generation !== projectTransitionGeneration) return
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
  if (generation !== projectTransitionGeneration) return
  if (renderedRoot && nativeRoot && projectPathKey(renderedRoot) === projectPathKey(nativeRoot)) {
    return
  }

  invalidateResearchProjectOpenSync()
  window.api.removeDirectoryChangedListener()
  clearProjectScopedRendererState()
  useProjectStore.getState().setProjectRoot(nativeRoot)
}

/**
 * Invalidates renderer work from an earlier project and closes the native
 * project session in the same transition queue used by `openProject`.
 */
export async function deactivateProject(): Promise<boolean> {
  if (!confirmProjectTransition()) return false

  const generation = ++projectTransitionGeneration
  invalidateResearchProjectOpenSync()
  const deactivated = await runNativeProjectTransition(async () => {
    if (generation !== projectTransitionGeneration) return false
    await window.api.deactivateProject()
    return generation === projectTransitionGeneration
  })
  if (!deactivated || generation !== projectTransitionGeneration) return false

  clearProjectScopedRendererState()
  useProjectStore.getState().setProjectRoot(null)
  return true
}

export async function openProject(
  dirPath: string,
  options: OpenProjectOptions = {}
): Promise<ProjectTransitionSnapshot | null> {
  if (!confirmProjectTransition()) return null

  const { autoOpenFirstTex = true } = options
  const generation = ++projectTransitionGeneration
  invalidateResearchProjectOpenSync()
  let projectPath: string | null
  try {
    projectPath = await runNativeProjectTransition(async () => {
      if (generation !== projectTransitionGeneration) return null
      const activatedPath = await window.api.activateProject(dirPath)
      if (generation !== projectTransitionGeneration) return null

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
      return generation === projectTransitionGeneration ? activatedPath : null
    })
  } catch (error) {
    if (generation === projectTransitionGeneration)
      await reconcileFailedNativeActivation(generation)
    throw error
  }
  if (!projectPath || generation !== projectTransitionGeneration) return null
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

  // Auto-open first .tex file
  const texFile = tree.find((e) => e.type === 'file' && e.name.endsWith('.tex'))
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

  try {
    const isRepo = await window.api.gitIsRepo(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return null
    const s = useProjectStore.getState()
    s.setIsGitRepo(isRepo)
    if (isRepo) {
      const status = await window.api.gitStatus(projectPath)
      if (!isCurrentProjectTransition(generation, projectPath)) return null
      s.setGitStatus(status)
      s.setGitBranch(status.branch)
    }
  } catch {
    if (isCurrentProjectTransition(generation, projectPath)) {
      useProjectStore.getState().setIsGitRepo(false)
    }
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return null
  try {
    const entries = await window.api.findBibInProject(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return null
    useProjectStore.getState().setBibEntries(entries)
  } catch {
    // ignore
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return null
  try {
    const labels = await window.api.scanLabels(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return null
    useProjectStore.getState().setLabels(labels)
  } catch {
    // ignore
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return null
  try {
    await window.api.addRecentProject(projectPath)
  } catch {
    // ignore
  }
  if (!isCurrentProjectTransition(generation, projectPath)) return null
  return { generation, projectPath }
}
