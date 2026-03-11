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
  useProjectStore.getState().setProjectRoot(dirPath)

  let tree: DirectoryEntry[] = []
  try {
    tree = await window.api.readDirectory(dirPath)
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
      const s = useEditorStore.getState()
      s.openFileInTab(result.filePath, result.content)
      s.setFilePath(result.filePath)
      s.setDirty(false)
    } catch {
      // ignore
    }
  }

  try {
    await window.api.watchDirectory(dirPath)
  } catch {
    // ignore
  }

  try {
    const isRepo = await window.api.gitIsRepo(dirPath)
    const s = useProjectStore.getState()
    s.setIsGitRepo(isRepo)
    if (isRepo) {
      const status = await window.api.gitStatus(dirPath)
      s.setGitStatus(status)
      s.setGitBranch(status.branch)
    }
  } catch {
    useProjectStore.getState().setIsGitRepo(false)
  }

  try {
    const entries = await window.api.findBibInProject(dirPath)
    useProjectStore.getState().setBibEntries(entries)
  } catch {
    // ignore
  }

  try {
    const labels = await window.api.scanLabels(dirPath)
    useProjectStore.getState().setLabels(labels)
  } catch {
    // ignore
  }

  try {
    await window.api.addRecentProject(dirPath)
  } catch {
    // ignore
  }
}
