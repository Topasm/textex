import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import type { DirectoryEntry } from '../../shared/types'

interface OpenProjectOptions {
  autoOpenFirstTex?: boolean
}

export async function openProject(
  dirPath: string,
  options: OpenProjectOptions = {}
): Promise<void> {
  const { autoOpenFirstTex = true } = options
  const projectPath = await window.api.activateProject(dirPath)
  useProjectStore.getState().setProjectRoot(projectPath)

  let tree: DirectoryEntry[] = []
  try {
    tree = await window.api.readDirectory(projectPath)
    useProjectStore.getState().setDirectoryTree(tree)
  } catch {
    // ignore
  }

  if (!useProjectStore.getState().isSidebarOpen) {
    useProjectStore.getState().toggleSidebar()
  }
  useProjectStore.getState().setSidebarView('files')

  // Auto-open first .tex file
  const texFile = tree.find((e) => e.type === 'file' && e.name.endsWith('.tex'))
  if (autoOpenFirstTex && texFile) {
    try {
      const result = await window.api.readFile(texFile.path)
      useEditorStore.getState().openFileInTab(result.filePath, result.content)
    } catch {
      // ignore
    }
  }

  try {
    await window.api.watchDirectory(projectPath)
  } catch {
    // ignore
  }

  try {
    const isRepo = await window.api.gitIsRepo(projectPath)
    const s = useProjectStore.getState()
    s.setIsGitRepo(isRepo)
    if (isRepo) {
      const status = await window.api.gitStatus(projectPath)
      s.setGitStatus(status)
      s.setGitBranch(status.branch)
    }
  } catch {
    useProjectStore.getState().setIsGitRepo(false)
  }

  try {
    const entries = await window.api.findBibInProject(projectPath)
    useProjectStore.getState().setBibEntries(entries)
  } catch {
    // ignore
  }

  try {
    const labels = await window.api.scanLabels(projectPath)
    useProjectStore.getState().setLabels(labels)
  } catch {
    // ignore
  }

  try {
    await window.api.addRecentProject(projectPath)
  } catch {
    // ignore
  }
}
