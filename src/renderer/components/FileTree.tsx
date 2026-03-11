import { useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { logError } from '../utils/errorMessage'
import { isImageFile } from '../utils/imageExtensions'
import { generateFigureSnippet } from '../utils/figureSnippet'
import { ImagePreviewTooltip } from './ImagePreviewTooltip'

function iconWrapper(kind: string, path: ReactNode): ReactNode {
  return (
    <span className={`file-tree-icon file-tree-icon-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        {path}
      </svg>
    </span>
  )
}

function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`file-tree-disclosure-icon${expanded ? ' expanded' : ''}`}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5.2 3.5 11 8l-5.8 4.5V3.5Z" />
    </svg>
  )
}

function getFileIcon(name: string, type: 'file' | 'directory', expanded?: boolean): ReactNode {
  if (type === 'directory') {
    return expanded
      ? iconWrapper(
          'folder-open',
          <path d="M3.5 7.5c0-1.1.9-2 2-2h4.2l1.5 1.8h7.3c1.1 0 2 .9 2 2v1H7.7c-.9 0-1.7.6-1.9 1.5l-1.6 6.2H4.1c-.9 0-1.6-.7-1.6-1.6V7.5Zm2.4 4.3h14.7c.7 0 1.2.7 1 1.4l-1.3 5c-.1.5-.6.8-1 .8H4.7c-.7 0-1.2-.7-1-1.4l1.3-5c.1-.5.5-.8.9-.8Z" />
        )
      : iconWrapper(
          'folder',
          <path d="M3.5 7.7c0-1.2 1-2.2 2.2-2.2h4l1.6 1.8h7c1.2 0 2.2 1 2.2 2.2v7.8c0 1.2-1 2.2-2.2 2.2H5.7c-1.2 0-2.2-1-2.2-2.2V7.7Z" />
        )
  }
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tex':
      return iconWrapper(
        'tex',
        <>
          <path d="M6.5 3.8h7.6l3.9 3.9v12.5H6.5c-1 0-1.8-.8-1.8-1.8V5.6c0-1 .8-1.8 1.8-1.8Zm7.1 1.7v2.8c0 .5.4.9.9.9h2.8" />
          <path d="M8 12.1h7.8v1.6H8zm2.3 3.1h3.2v1.6h-3.2z" />
        </>
      )
    case 'bib':
      return iconWrapper(
        'bib',
        <>
          <path d="M6.8 5.2h3.7c.6 0 1 .4 1 1v11.6c0 .6-.4 1-1 1H6.8c-.6 0-1-.4-1-1V6.2c0-.6.4-1 1-1Z" />
          <path d="M12.4 5.8h4.1c.6 0 1 .4 1 1v10.9c0 .6-.4 1-1 1h-4.1c-.6 0-1-.4-1-1V6.8c0-.6.4-1 1-1Z" />
        </>
      )
    case 'sty':
    case 'cls':
      return iconWrapper(
        'style',
        <path d="m12 4.5 1 .5 1.1-.2.8.8-.2 1.1.5 1 .9.4v1.2l-.9.4-.5 1 .2 1.1-.8.8-1.1-.2-1 .5-.4.9H11l-.4-.9-1-.5-1.1.2-.8-.8.2-1.1-.5-1-.9-.4V8.1l.9-.4.5-1-.2-1.1.8-.8 1.1.2 1-.5.4-.9h1.2l.4.9Zm0 3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z" />
      )
    case 'pdf':
      return iconWrapper(
        'pdf',
        <>
          <path d="M6.3 3.8h7.7L18 7.8v10.4c0 1.1-.9 2-2 2H6.3c-1.1 0-2-.9-2-2V5.8c0-1.1.9-2 2-2Z" />
          <path d="M13.7 3.8v3.1c0 .6.5 1.1 1.1 1.1H18" />
          <path d="M7.8 13.1h6.8v1.6H7.8z" />
        </>
      )
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
      return iconWrapper(
        'image',
        <>
          <path d="M5.7 5.2h12.6c.9 0 1.5.7 1.5 1.5v10.6c0 .8-.6 1.5-1.5 1.5H5.7c-.9 0-1.5-.7-1.5-1.5V6.7c0-.8.6-1.5 1.5-1.5Z" />
          <path d="M8.4 10.1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-2 6.3 3.2-3.5 2.3 2.5 2.7-3 2.9 4H6.4Z" />
        </>
      )
    default:
      return iconWrapper(
        'file',
        <>
          <path d="M6.3 3.8h7.6L18 7.9v10.3c0 1.1-.9 2-2 2H6.3c-1.1 0-2-.9-2-2V5.8c0-1.1.9-2 2-2Z" />
          <path d="M13.8 3.8v3.1c0 .6.5 1.1 1.1 1.1H18" />
        </>
      )
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
  icon: ReactNode
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
      {icon}
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

  const toggleDirectory = useCallback(async () => {
    if (entry.type !== 'directory') return
    if (!expanded && !children) {
      await loadChildren()
    }
    setExpanded((prev) => !prev)
  }, [entry.type, expanded, children, loadChildren])

  const handleClick = useCallback(async () => {
    if (entry.type === 'directory') {
      await toggleDirectory()
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
  }, [entry, toggleDirectory, isImage, projectRoot])

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
        className={`file-tree-item${isSelected ? ' selected' : ''}${isImage ? ' draggable-image' : ''}${entry.type === 'directory' ? ' is-directory' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={isImage}
        onDragStart={handleDragStart}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {entry.type === 'directory' ? (
          <button
            className={`file-tree-disclosure${expanded ? ' expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              void toggleDirectory()
            }}
            aria-label={expanded ? t('fileTree.collapseFolder') : t('fileTree.expandFolder')}
            aria-expanded={expanded}
          >
            <DisclosureIcon expanded={expanded} />
          </button>
        ) : (
          <span className="file-tree-disclosure-spacer" aria-hidden="true" />
        )}
        {getFileIcon(entry.name, entry.type, expanded)}
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
        <div className="file-tree-children">
          {creatingType && (
            <InlineInput
              depth={depth + 1}
              icon={getFileIcon(
                creatingType === 'folder' ? 'folder' : 'untitled.txt',
                creatingType === 'folder' ? 'directory' : 'file'
              )}
              onSubmit={handleSubmitCreate}
              onCancel={() => setCreatingType(null)}
            />
          )}
          {children &&
            children.map((child) => (
              <FileTreeNode key={child.path} entry={child} depth={depth + 1} gitFiles={gitFiles} />
            ))}
        </div>
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
          icon={getFileIcon(
            creatingType === 'folder' ? 'folder' : 'untitled.txt',
            creatingType === 'folder' ? 'directory' : 'file'
          )}
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
