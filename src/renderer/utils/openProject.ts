import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import {
  invalidateResearchProjectOpenSync,
  syncResearchOnProjectOpen
} from '../services/researchProjectLifecycle'
import type { DirectoryEntry } from '../../shared/types'

interface OpenProjectOptions {
  autoOpenFirstTex?: boolean
}

let projectTransitionGeneration = 0
let nativeProjectTransition: Promise<void> = Promise.resolve()

function isCurrentProjectTransition(generation: number, projectPath?: string): boolean {
  if (generation !== projectTransitionGeneration) return false
  return projectPath === undefined || useProjectStore.getState().projectRoot === projectPath
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

/**
 * Invalidates renderer work from an earlier project and closes the native
 * project session in the same transition queue used by `openProject`.
 */
export async function deactivateProject(): Promise<void> {
  const generation = ++projectTransitionGeneration
  invalidateResearchProjectOpenSync()
  await runNativeProjectTransition(async () => {
    if (generation !== projectTransitionGeneration) return
    await window.api.deactivateProject()
  })
}

export async function openProject(
  dirPath: string,
  options: OpenProjectOptions = {}
): Promise<void> {
  const { autoOpenFirstTex = true } = options
  const generation = ++projectTransitionGeneration
  invalidateResearchProjectOpenSync()
  const projectPath = await runNativeProjectTransition(async () => {
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
  if (!projectPath || generation !== projectTransitionGeneration) return
  useProjectStore.getState().setProjectRoot(projectPath)
  void syncResearchOnProjectOpen(projectPath).catch(() => {
    // Opening the project remains successful when an optional background
    // Zotero sync is unavailable. Manual sync can report the actionable error.
  })

  let tree: DirectoryEntry[] = []
  try {
    tree = await window.api.readDirectory(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return
    useProjectStore.getState().setDirectoryTree(tree)
  } catch {
    // ignore
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return

  if (!useProjectStore.getState().isSidebarOpen) {
    useProjectStore.getState().toggleSidebar()
  }
  useProjectStore.getState().setSidebarView('files')

  // Auto-open first .tex file
  const texFile = tree.find((e) => e.type === 'file' && e.name.endsWith('.tex'))
  if (autoOpenFirstTex && texFile) {
    try {
      const result = await window.api.readFile(texFile.path)
      if (!isCurrentProjectTransition(generation, projectPath)) return
      useEditorStore.getState().openFileInTab(result.filePath, result.content)
    } catch {
      // ignore
    }
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return

  try {
    const isRepo = await window.api.gitIsRepo(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return
    const s = useProjectStore.getState()
    s.setIsGitRepo(isRepo)
    if (isRepo) {
      const status = await window.api.gitStatus(projectPath)
      if (!isCurrentProjectTransition(generation, projectPath)) return
      s.setGitStatus(status)
      s.setGitBranch(status.branch)
    }
  } catch {
    if (isCurrentProjectTransition(generation, projectPath)) {
      useProjectStore.getState().setIsGitRepo(false)
    }
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return
  try {
    const entries = await window.api.findBibInProject(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return
    useProjectStore.getState().setBibEntries(entries)
  } catch {
    // ignore
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return
  try {
    const labels = await window.api.scanLabels(projectPath)
    if (!isCurrentProjectTransition(generation, projectPath)) return
    useProjectStore.getState().setLabels(labels)
  } catch {
    // ignore
  }

  if (!isCurrentProjectTransition(generation, projectPath)) return
  try {
    await window.api.addRecentProject(projectPath)
  } catch {
    // ignore
  }
}
