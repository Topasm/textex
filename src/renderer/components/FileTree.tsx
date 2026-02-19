import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { logError } from '../utils/errorMessage'
import { isImageFile } from '../utils/imageExtensions'
import { generateFigureSnippet } from '../utils/figureSnippet'
import { ImagePreviewTooltip } from './ImagePreviewTooltip'

function getFileIcon(name: string, type: 'file' | 'directory', expanded?: boolean): string {
  if (type === 'directory') return expanded ? '\u{1F4C2}' : '\u{1F4C1}'
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tex':
      return '\u{1F4DD}'
    case 'bib':
      return '\u{1F4DA}'
    case 'sty':
    case 'cls':
      return '\u{2699}'
    case 'pdf':
      return '\u{1F4C4}'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
      return '\u{1F5BC}'
    default:
      return '\u{1F4C3}'
  }
}

interface FileTreeNodeProps {
  entry: DirectoryEntry
  depth: number
  gitFiles?: GitFileStatus[]
}

import { getGitFileDecoration } from '../utils/gitStatus'

interface InlineInputProps {
  depth: number
  icon: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

function InlineInput({ depth, icon, onSubmit, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed) onSubmit(trimmed)
      else onCancel()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div
      className="file-tree-item file-tree-inline-input"
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <span className="file-tree-icon">{icon}</span>
      <input
        ref={inputRef}
        className="file-tree-name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        placeholder="name"
      />
    </div>
  )
}

function FileTreeNode({ entry, depth, gitFiles }: FileTreeNodeProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(depth < 1)
  const [children, setChildren] = useState<DirectoryEntry[] | null>(null)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)
  const [hoverPreview, setHoverPreview] = useState<DOMRect | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const projectRoot = useProjectStore((s) => s.projectRoot)

  const isImage = entry.type === 'file' && isImageFile(entry.name)

  const loadChildren = useCallback(async () => {
    try {
      const entries = await window.api.readDirectory(entry.path)
      setChildren(entries)
    } catch (err) {
      logError('FileTree:loadChildren', err)
    }
  }, [entry.path])

  const handleClick = useCallback(async () => {
    if (entry.type === 'directory') {
      if (!expanded && !children) {
        await loadChildren()
      }
      setExpanded(!expanded)
    } else if (isImage && projectRoot) {
      // Insert figure snippet at cursor for image files
      const sep = projectRoot.includes('\\') ? '\\' : '/'
      const relPath = entry.path.startsWith(projectRoot + sep)
        ? entry.path.slice(projectRoot.length + 1).replace(/\\/g, '/')
        : entry.name
      const snippet = generateFigureSnippet(relPath, entry.name)
      useEditorStore.getState().requestInsertAtCursor(snippet)
    } else {
      try {
        const result = await window.api.readFile(entry.path)
        useEditorStore.getState().openFileInTab(result.filePath, result.content)
      } catch (err) {
        logError('FileTree:readFile', err)
      }
    }
  }, [entry, expanded, children, loadChildren, isImage, projectRoot])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!isImage) return
      e.dataTransfer.setData('application/x-textex-image-path', entry.path)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [isImage, entry.path]
  )

  const handleMouseEnter = useCallback(() => {
    if (!isImage) return
    hoverTimerRef.current = setTimeout(() => {
      if (itemRef.current) {
        setHoverPreview(itemRef.current.getBoundingClientRect())
      }
    }, 300)
  }, [isImage])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoverPreview(null)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (entry.type !== 'directory') return
      e.preventDefault()
      e.stopPropagation()
      // Expand if not already
      if (!expanded) {
        if (!children) loadChildren()
        setExpanded(true)
      }
    },
    [entry.type, expanded, children, loadChildren]
  )

  const handleCreateFile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!expanded) {
        if (!children) loadChildren()
        setExpanded(true)
      }
      setCreatingType('file')
    },
    [expanded, children, loadChildren]
  )

  const handleCreateFolder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!expanded) {
        if (!children) loadChildren()
        setExpanded(true)
      }
      setCreatingType('folder')
    },
    [expanded, children, loadChildren]
  )

  const handleSubmitCreate = useCallback(
    async (name: string) => {
      const fullPath = entry.path + '/' + name
      try {
        if (creatingType === 'folder') {
          await window.api.createDirectory(fullPath)
        } else {
          await window.api.createFile(fullPath)
          // Open the newly created file
          const result = await window.api.readFile(fullPath)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        }
        // Refresh children
        await loadChildren()
      } catch (err) {
        logError('FileTree:create', err)
      }
      setCreatingType(null)
    },
    [entry.path, creatingType, loadChildren]
  )

  const isSelected = entry.path === activeFilePath
  const gitDeco = entry.type === 'file' ? getGitFileDecoration(entry.path, gitFiles) : null

  return (
    <>
      <div
        ref={itemRef}
        className={`file-tree-item${isSelected ? ' selected' : ''}${isImage ? ' draggable-image' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={isImage}
        onDragStart={handleDragStart}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="file-tree-icon">{getFileIcon(entry.name, entry.type, expanded)}</span>
        <span className="file-tree-name">{entry.name}</span>
        {entry.type === 'directory' && (
          <span className="file-tree-actions">
            <button
              className="file-tree-action-btn"
              onClick={handleCreateFile}
              title={t('fileTree.newFile')}
              aria-label={t('fileTree.newFile')}
            >
              +
            </button>
            <button
              className="file-tree-action-btn"
              onClick={handleCreateFolder}
              title={t('fileTree.newFolder')}
              aria-label={t('fileTree.newFolder')}
            >
              +&#x2395;
            </button>
          </span>
        )}
        {gitDeco && <span className={`file-tree-git ${gitDeco.className}`}>{gitDeco.label}</span>}
      </div>
      {hoverPreview && (
        <ImagePreviewTooltip
          filePath={entry.path}
          fileName={entry.name}
          anchorRect={hoverPreview}
        />
      )}
      {expanded && entry.type === 'directory' && (
        <>
          {creatingType && (
            <InlineInput
              depth={depth + 1}
              icon={creatingType === 'folder' ? '\u{1F4C1}' : '\u{1F4C3}'}
              onSubmit={handleSubmitCreate}
              onCancel={() => setCreatingType(null)}
            />
          )}
          {children &&
            children.map((child) => (
              <FileTreeNode key={child.path} entry={child} depth={depth + 1} gitFiles={gitFiles} />
            ))}
        </>
      )}
    </>
  )
}

function FileTree() {
  const { t } = useTranslation()
  const directoryTree = useProjectStore((s) => s.directoryTree)
  const gitStatus = useProjectStore((s) => s.gitStatus)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)

  const handleRootCreate = useCallback(
    async (name: string) => {
      if (!projectRoot) return
      const fullPath = projectRoot + '/' + name
      try {
        if (creatingType === 'folder') {
          await window.api.createDirectory(fullPath)
        } else {
          await window.api.createFile(fullPath)
          const result = await window.api.readFile(fullPath)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        }
        // Tree refreshes via directory watcher
      } catch (err) {
        logError('FileTree:rootCreate', err)
      }
      setCreatingType(null)
    },
    [projectRoot, creatingType]
  )

  if (!directoryTree || directoryTree.length === 0) {
    return (
      <div className="file-tree">
        <div className="git-empty">{t('fileTree.noFolder')}</div>
      </div>
    )
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <button
          className="file-tree-header-btn"
          onClick={() => setCreatingType('file')}
          title={t('fileTree.newFile')}
          aria-label={t('fileTree.newFile')}
        >
          +
        </button>
        <button
          className="file-tree-header-btn"
          onClick={() => setCreatingType('folder')}
          title={t('fileTree.newFolder')}
          aria-label={t('fileTree.newFolder')}
        >
          +&#x2395;
        </button>
      </div>
      {creatingType && (
        <InlineInput
          depth={0}
          icon={creatingType === 'folder' ? '\u{1F4C1}' : '\u{1F4C3}'}
          onSubmit={handleRootCreate}
          onCancel={() => setCreatingType(null)}
        />
      )}
      {directoryTree.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} gitFiles={gitStatus?.files} />
      ))}
    </div>
  )
}

export default FileTree
