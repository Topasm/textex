import { useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

function getFileIcon(name: string, type: 'file' | 'directory', expanded?: boolean): string {
  if (type === 'directory') return expanded ? '\u{1F4C2}' : '\u{1F4C1}'
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tex': return '\u{1F4DD}'
    case 'bib': return '\u{1F4DA}'
    case 'sty': case 'cls': return '\u{2699}'
    case 'pdf': return '\u{1F4C4}'
    case 'png': case 'jpg': case 'jpeg': case 'svg': return '\u{1F5BC}'
    default: return '\u{1F4C3}'
  }
}

interface FileTreeNodeProps {
  entry: DirectoryEntry
  depth: number
  gitFiles?: GitFileStatus[]
}

function getGitDecoration(filePath: string, gitFiles?: GitFileStatus[]): { label: string; className: string } | null {
  if (!gitFiles) return null
  const relative = filePath
  const file = gitFiles.find((f) => relative.endsWith(f.path))
  if (!file) return null
  if (file.index === '?' && file.working_dir === '?') return { label: 'U', className: 'untracked' }
  if (file.index === 'A' || file.working_dir === 'A') return { label: 'A', className: 'added' }
  if (file.index === 'M' || file.working_dir === 'M') return { label: 'M', className: 'modified' }
  if (file.index === 'D' || file.working_dir === 'D') return { label: 'D', className: 'deleted' }
  return null
}

function FileTreeNode({ entry, depth, gitFiles }: FileTreeNodeProps): JSX.Element {
  const [expanded, setExpanded] = useState(depth < 1)
  const [children, setChildren] = useState<DirectoryEntry[] | null>(null)
  const activeFilePath = useAppStore((s) => s.activeFilePath)

  const handleClick = useCallback(async () => {
    if (entry.type === 'directory') {
      if (!expanded && !children) {
        try {
          const entries = await window.api.readDirectory(entry.path)
          setChildren(entries)
        } catch {
          // ignore
        }
      }
      setExpanded(!expanded)
    } else {
      try {
        const result = await window.api.readFile(entry.path)
        useAppStore.getState().openFileInTab(result.filePath, result.content)
      } catch {
        // ignore
      }
    }
  }, [entry, expanded, children])

  const isSelected = entry.path === activeFilePath
  const gitDeco = entry.type === 'file' ? getGitDecoration(entry.path, gitFiles) : null

  return (
    <>
      <div
        className={`file-tree-item${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
      >
        <span className="file-tree-icon">
          {getFileIcon(entry.name, entry.type, expanded)}
        </span>
        <span className="file-tree-name">{entry.name}</span>
        {gitDeco && (
          <span className={`file-tree-git ${gitDeco.className}`}>{gitDeco.label}</span>
        )}
      </div>
      {expanded && entry.type === 'directory' && children && (
        children.map((child) => (
          <FileTreeNode key={child.path} entry={child} depth={depth + 1} gitFiles={gitFiles} />
        ))
      )}
    </>
  )
}

function FileTree(): JSX.Element {
  const directoryTree = useAppStore((s) => s.directoryTree)
  const gitStatus = useAppStore((s) => s.gitStatus)

  if (!directoryTree || directoryTree.length === 0) {
    return (
      <div className="file-tree">
        <div className="git-empty">No folder open</div>
      </div>
    )
  }

  return (
    <div className="file-tree">
      {directoryTree.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          gitFiles={gitStatus?.files}
        />
      ))}
    </div>
  )
}

export default FileTree
