/**
 * Shared git file status utility.
 * Deduplicates logic previously in FileTree.tsx and GitPanel.tsx.
 */

interface GitFileStatus {
  path: string
  index: string
  working_dir: string
}

export interface GitDecoration {
  label: string
  className: string
}

/**
 * Derive a git decoration (label + CSS class) from a file's git status.
 * Used by both the file tree and git panel.
 *
 * @param filePath - The file path to look up
 * @param gitFiles - Array of git file statuses (from git status result)
 * @param matchMode - 'endsWith' for file tree (path may be absolute), 'exact' for git panel
 */
export function getGitFileDecoration(
  filePath: string,
  gitFiles: GitFileStatus[] | undefined,
  matchMode: 'endsWith' | 'exact' = 'endsWith'
): GitDecoration | null {
  if (!gitFiles) return null
  const file = matchMode === 'exact'
    ? gitFiles.find((f) => f.path === filePath)
    : gitFiles.find((f) => filePath.endsWith(f.path))
  if (!file) return null
  if (file.index === '?' && file.working_dir === '?') return { label: 'U', className: 'untracked' }
  if (file.index === 'A' || file.working_dir === 'A') return { label: 'A', className: 'added' }
  if (file.index === 'M' || file.working_dir === 'M') return { label: 'M', className: 'modified' }
  if (file.index === 'D' || file.working_dir === 'D') return { label: 'D', className: 'deleted' }
  return null
}
