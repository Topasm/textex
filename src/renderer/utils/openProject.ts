import { useAppStore } from '../store/useAppStore'
import type { DirectoryEntry } from '../../shared/types'

export async function openProject(dirPath: string): Promise<void> {
  useAppStore.getState().setProjectRoot(dirPath)

  let tree: DirectoryEntry[] = []
  try {
    tree = await window.api.readDirectory(dirPath)
    useAppStore.getState().setDirectoryTree(tree)
  } catch {
    // ignore
  }

  if (!useAppStore.getState().isSidebarOpen) {
    useAppStore.getState().toggleSidebar()
  }
  useAppStore.getState().setSidebarView('files')

  // Auto-open first .tex file
  const texFile = tree.find((e) => e.type === 'file' && e.name.endsWith('.tex'))
  if (texFile) {
    try {
      const result = await window.api.readFile(texFile.path)
      const s = useAppStore.getState()
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
    const s = useAppStore.getState()
    s.setIsGitRepo(isRepo)
    if (isRepo) {
      const status = await window.api.gitStatus(dirPath)
      s.setGitStatus(status)
      s.setGitBranch(status.branch)
    }
  } catch {
    useAppStore.getState().setIsGitRepo(false)
  }

  try {
    const entries = await window.api.findBibInProject(dirPath)
    useAppStore.getState().setBibEntries(entries)
  } catch {
    // ignore
  }

  try {
    const labels = await window.api.scanLabels(dirPath)
    useAppStore.getState().setLabels(labels)
  } catch {
    // ignore
  }

  try {
    await window.api.addRecentProject(dirPath)
  } catch {
    // ignore
  }
}
