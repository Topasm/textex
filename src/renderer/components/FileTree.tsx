import { memo, useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Archive,
  BookOpenText,
  ChevronRight,
  File,
  FileCode2,
  FileCog,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Eye,
  EyeOff,
  PencilLine,
  Trash2,
  type LucideIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { errorMessage, logError } from '../utils/errorMessage'
import { isImageFile } from '../utils/imageExtensions'
import { generateFigureSnippet } from '../utils/figureSnippet'
import { ImagePreviewTooltip } from './ImagePreviewTooltip'
import {
  buildProjectTreeIndex,
  calculateVirtualRowRange,
  flattenVisibleProjectTree,
  projectPathKey
} from '../services/projectIndex'
import type { ProjectTreeRow } from '../services/projectIndex'
import type { DirectoryEntry, GitFileStatus, ProjectIndexEntry } from '../../shared/types'
import { ICON_SIZE } from './ui/IconSystem'
import {
  filterGeneratedDirectoryEntries,
  filterGeneratedProjectEntries
} from '../services/generatedFiles'
import { useNotificationStore } from '../store/useNotificationStore'

function iconWrapper(kind: string, Icon: LucideIcon): ReactNode {
  return (
    <span className={`file-tree-icon file-tree-icon-${kind}`} aria-hidden="true">
      <Icon size={ICON_SIZE.compact} />
    </span>
  )
}

function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      className={`file-tree-disclosure-icon${expanded ? ' expanded' : ''}`}
      size={ICON_SIZE.micro}
    />
  )
}

function getFileIcon(name: string, type: 'file' | 'directory', expanded?: boolean): ReactNode {
  if (type === 'directory') {
    return expanded ? iconWrapper('folder-open', FolderOpen) : iconWrapper('folder', Folder)
  }
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tex':
      return iconWrapper('tex', FileCode2)
    case 'bib':
      return iconWrapper('bib', BookOpenText)
    case 'sty':
    case 'cls':
      return iconWrapper('style', FileCog)
    case 'pdf':
      return iconWrapper('pdf', FileText)
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
      return iconWrapper('image', FileImage)
    default:
      return iconWrapper('file', File)
  }
}

interface FileTreeNodeProps {
  entry: DirectoryEntry
  depth: number
  gitFiles?: GitFileStatus[]
  onChanged?: () => void | Promise<void>
  showGenerated: boolean
}

import { getGitFileDecoration } from '../utils/gitStatus'

interface InlineInputProps {
  depth: number
  icon: ReactNode
  initialValue?: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

function InlineInput({ depth, icon, initialValue = '', onSubmit, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialValue)

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

function pathIdentity(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
}

function isPathInside(candidate: string, parent: string): boolean {
  const candidateId = pathIdentity(candidate)
  const parentId = pathIdentity(parent).replace(/\/$/, '')
  return candidateId === parentId || candidateId.startsWith(`${parentId}/`)
}

function siblingPath(filePath: string, name: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return `${filePath.slice(0, separatorIndex + 1)}${name}`
}

function remapChildPath(filePath: string, source: string, destination: string): string {
  return `${destination}${filePath.slice(source.length)}`
}

function FileTreeNode({ entry, depth, gitFiles, onChanged, showGenerated }: FileTreeNodeProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(depth < 1)
  const [children, setChildren] = useState<DirectoryEntry[] | null>(null)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [hoverPreview, setHoverPreview] = useState<DOMRect | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadRequestIdRef = useRef(0)
  const loadedRefreshVersionRef = useRef(-1)
  const itemRef = useRef<HTMLDivElement>(null)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const refreshVersion = useProjectStore(
    (s) => s.directoryRefreshVersions[projectPathKey(entry.path)] ?? 0
  )

  const isImage = entry.type === 'file' && isImageFile(entry.name)
  const visibleChildren = useMemo(
    () => (showGenerated && children ? children : filterGeneratedDirectoryEntries(children ?? [])),
    [children, showGenerated]
  )

  const loadChildren = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    const requestedRefreshVersion = refreshVersion
    try {
      const entries = await window.api.readDirectory(entry.path)
      if (requestId === loadRequestIdRef.current) {
        loadedRefreshVersionRef.current = requestedRefreshVersion
        setChildren(entries)
      }
    } catch (err) {
      if (requestId === loadRequestIdRef.current) logError('FileTree:loadChildren', err)
    }
  }, [entry.path, refreshVersion])

  useEffect(() => {
    if (
      !expanded ||
      loadedRefreshVersionRef.current < 0 ||
      refreshVersion <= loadedRefreshVersionRef.current
    )
      return
    void loadChildren()
  }, [expanded, loadChildren, refreshVersion])

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

  const handleRename = useCallback(
    async (name: string) => {
      setRenaming(false)
      if (name === entry.name) return
      if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        window.alert(t('fileTree.invalidName'))
        return
      }

      const editor = useEditorStore.getState()
      const affected = Object.entries(editor.openFiles).filter(([filePath]) =>
        isPathInside(filePath, entry.path)
      )
      if (affected.some(([, file]) => file.isDirty)) {
        window.alert(t('fileTree.saveBeforeRename'))
        return
      }

      const destination = siblingPath(entry.path, name)
      try {
        await window.api.renamePath(entry.path, destination)
        const activePath = editor.activeFilePath
        const reopen = affected
          .map(([filePath]) => ({
            oldPath: filePath,
            newPath: remapChildPath(filePath, entry.path, destination),
            wasActive: filePath === activePath
          }))
          .sort((left, right) => Number(left.wasActive) - Number(right.wasActive))
        for (const file of reopen) editor.closeTab(file.oldPath)
        for (const file of reopen) {
          const result = await window.api.readFile(file.newPath)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        }
        await onChanged?.()
      } catch (error) {
        logError('FileTree:rename', error)
      }
    },
    [entry, onChanged, t]
  )

  const handleDelete = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation()
      const editor = useEditorStore.getState()
      const affected = Object.entries(editor.openFiles).filter(([filePath]) =>
        isPathInside(filePath, entry.path)
      )
      if (affected.some(([, file]) => file.isDirty)) {
        window.alert(t('fileTree.saveBeforeDelete'))
        return
      }
      if (!window.confirm(t('fileTree.confirmDelete', { name: entry.name }))) return

      try {
        await window.api.deletePath(entry.path)
        for (const [filePath] of affected) useEditorStore.getState().closeTab(filePath)
        await onChanged?.()
      } catch (error) {
        logError('FileTree:delete', error)
      }
    },
    [entry, onChanged, t]
  )

  const isSelected = entry.path === activeFilePath
  const gitDeco = entry.type === 'file' ? getGitFileDecoration(entry.path, gitFiles) : null

  if (renaming) {
    return (
      <InlineInput
        depth={depth}
        icon={getFileIcon(entry.name, entry.type, expanded)}
        initialValue={entry.name}
        onSubmit={handleRename}
        onCancel={() => setRenaming(false)}
      />
    )
  }

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
        <span className="file-tree-actions">
          {entry.type === 'directory' && (
            <>
              <button
                className="file-tree-action-btn"
                onClick={handleCreateFile}
                title={t('fileTree.newFile')}
                aria-label={t('fileTree.newFile')}
              >
                <FilePlus2 size={ICON_SIZE.micro} />
              </button>
              <button
                className="file-tree-action-btn"
                onClick={handleCreateFolder}
                title={t('fileTree.newFolder')}
                aria-label={t('fileTree.newFolder')}
              >
                <FolderPlus size={ICON_SIZE.micro} />
              </button>
            </>
          )}
          <button
            className="file-tree-action-btn"
            onClick={(event) => {
              event.stopPropagation()
              setRenaming(true)
            }}
            title={t('fileTree.rename')}
            aria-label={t('fileTree.rename')}
          >
            <PencilLine size={ICON_SIZE.micro} />
          </button>
          <button
            className="file-tree-action-btn file-tree-delete-btn"
            onClick={handleDelete}
            title={t('fileTree.delete')}
            aria-label={t('fileTree.delete')}
          >
            <Trash2 size={ICON_SIZE.micro} />
          </button>
        </span>
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
            visibleChildren.map((child) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                gitFiles={gitFiles}
                onChanged={loadChildren}
                showGenerated={showGenerated}
              />
            ))}
        </div>
      )}
    </>
  )
}

const FILE_TREE_ROW_HEIGHT = 24
const FILE_TREE_OVERSCAN = 6

function childPath(parentPath: string, name: string): string {
  const separator = parentPath.includes('\\') ? '\\' : '/'
  return `${parentPath.replace(/[\\/]+$/, '')}${separator}${name}`
}

interface ProjectFileTreeRowProps {
  row: ProjectTreeRow
  expanded: boolean
  gitFiles?: GitFileStatus[]
  onToggle: (relativePath: string) => void
  onCreate: (row: ProjectTreeRow, type: 'file' | 'folder') => void
  onRenamed: (entry: ProjectIndexEntry, destination: string) => void
  onDeleted: (entry: ProjectIndexEntry) => void
}

const ProjectFileTreeRow = memo(function ProjectFileTreeRow({
  row,
  expanded,
  gitFiles,
  onToggle,
  onCreate,
  onRenamed,
  onDeleted
}: ProjectFileTreeRowProps) {
  const { t } = useTranslation()
  const { entry, depth } = row
  const [renaming, setRenaming] = useState(false)
  const [hoverPreview, setHoverPreview] = useState<DOMRect | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const isActiveFile = useEditorStore((state) => state.activeFilePath === entry.path)
  const isImage = entry.type === 'file' && isImageFile(entry.name)

  const handleClick = useCallback(async () => {
    if (entry.type === 'directory') {
      onToggle(entry.relativePath)
      return
    }
    if (isImage) {
      useEditorStore
        .getState()
        .requestInsertAtCursor(generateFigureSnippet(entry.relativePath, entry.name))
      return
    }
    try {
      const result = await window.api.readFile(entry.path)
      useEditorStore.getState().openFileInTab(result.filePath, result.content)
    } catch (error) {
      logError('FileTree:readIndexedFile', error)
    }
  }, [entry, isImage, onToggle])

  const handleRename = useCallback(
    async (name: string) => {
      setRenaming(false)
      if (name === entry.name) return
      if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        window.alert(t('fileTree.invalidName'))
        return
      }

      const editor = useEditorStore.getState()
      const affected = Object.entries(editor.openFiles).filter(([filePath]) =>
        isPathInside(filePath, entry.path)
      )
      if (affected.some(([, file]) => file.isDirty)) {
        window.alert(t('fileTree.saveBeforeRename'))
        return
      }

      const destination = siblingPath(entry.path, name)
      try {
        await window.api.renamePath(entry.path, destination)
        const activePath = editor.activeFilePath
        const reopen = affected
          .map(([filePath]) => ({
            oldPath: filePath,
            newPath: remapChildPath(filePath, entry.path, destination),
            wasActive: filePath === activePath
          }))
          .sort((left, right) => Number(left.wasActive) - Number(right.wasActive))
        for (const file of reopen) editor.closeTab(file.oldPath)
        for (const file of reopen) {
          const result = await window.api.readFile(file.newPath)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        }
        onRenamed(entry, destination)
      } catch (error) {
        logError('FileTree:renameIndexedPath', error)
      }
    },
    [entry, onRenamed, t]
  )

  const handleDelete = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation()
      const editor = useEditorStore.getState()
      const affected = Object.entries(editor.openFiles).filter(([filePath]) =>
        isPathInside(filePath, entry.path)
      )
      if (affected.some(([, file]) => file.isDirty)) {
        window.alert(t('fileTree.saveBeforeDelete'))
        return
      }
      if (!window.confirm(t('fileTree.confirmDelete', { name: entry.name }))) return

      try {
        await window.api.deletePath(entry.path)
        for (const [filePath] of affected) useEditorStore.getState().closeTab(filePath)
        onDeleted(entry)
      } catch (error) {
        logError('FileTree:deleteIndexedPath', error)
      }
    },
    [entry, onDeleted, t]
  )

  const handleMouseEnter = useCallback(() => {
    if (!isImage) return
    hoverTimerRef.current = setTimeout(() => {
      if (itemRef.current) setHoverPreview(itemRef.current.getBoundingClientRect())
    }, 300)
  }, [isImage])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
    setHoverPreview(null)
  }, [])

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    },
    []
  )

  if (renaming) {
    return (
      <div className="file-tree-virtual-row" style={{ height: FILE_TREE_ROW_HEIGHT }}>
        <InlineInput
          depth={depth}
          icon={getFileIcon(entry.name, entry.type, expanded)}
          initialValue={entry.name}
          onSubmit={handleRename}
          onCancel={() => setRenaming(false)}
        />
      </div>
    )
  }

  const gitDeco = entry.type === 'file' ? getGitFileDecoration(entry.path, gitFiles) : null
  return (
    <div className="file-tree-virtual-row" style={{ height: FILE_TREE_ROW_HEIGHT }}>
      <div
        ref={itemRef}
        data-file-tree-path={entry.relativePath}
        className={`file-tree-item${isActiveFile ? ' selected' : ''}${isImage ? ' draggable-image' : ''}${entry.type === 'directory' ? ' is-directory' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px`, height: FILE_TREE_ROW_HEIGHT }}
        onClick={() => void handleClick()}
        onContextMenu={(event) => {
          if (entry.type !== 'directory') return
          event.preventDefault()
          if (!expanded) onToggle(entry.relativePath)
        }}
        draggable={isImage}
        onDragStart={(event) => {
          if (!isImage) return
          event.dataTransfer.setData('application/x-textex-image-path', entry.path)
          event.dataTransfer.effectAllowed = 'copy'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {entry.type === 'directory' ? (
          <button
            className={`file-tree-disclosure${expanded ? ' expanded' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(entry.relativePath)
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
        <span className="file-tree-actions">
          {entry.type === 'directory' && (
            <>
              <button
                className="file-tree-action-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  onCreate(row, 'file')
                }}
                title={t('fileTree.newFile')}
                aria-label={t('fileTree.newFile')}
              >
                <FilePlus2 size={ICON_SIZE.micro} />
              </button>
              <button
                className="file-tree-action-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  onCreate(row, 'folder')
                }}
                title={t('fileTree.newFolder')}
                aria-label={t('fileTree.newFolder')}
              >
                <FolderPlus size={ICON_SIZE.micro} />
              </button>
            </>
          )}
          <button
            className="file-tree-action-btn"
            onClick={(event) => {
              event.stopPropagation()
              setRenaming(true)
            }}
            title={t('fileTree.rename')}
            aria-label={t('fileTree.rename')}
          >
            <PencilLine size={ICON_SIZE.micro} />
          </button>
          <button
            className="file-tree-action-btn file-tree-delete-btn"
            onClick={(event) => void handleDelete(event)}
            title={t('fileTree.delete')}
            aria-label={t('fileTree.delete')}
          >
            <Trash2 size={ICON_SIZE.micro} />
          </button>
        </span>
        {gitDeco && <span className={`file-tree-git ${gitDeco.className}`}>{gitDeco.label}</span>}
      </div>
      {hoverPreview && (
        <ImagePreviewTooltip
          filePath={entry.path}
          fileName={entry.name}
          anchorRect={hoverPreview}
        />
      )}
    </div>
  )
})

interface CreatingProjectRow {
  parentPath: string
  parentRelativePath: string
  depth: number
  type: 'file' | 'folder'
}

type ProjectDisplayRow =
  | { kind: 'entry'; key: string; row: ProjectTreeRow }
  | { kind: 'create'; key: string; creating: CreatingProjectRow }

interface VirtualizedProjectFileTreeProps {
  projectIndex: { root: string; entries: ProjectIndexEntry[] }
  gitFiles?: GitFileStatus[]
  rootCreatingType: 'file' | 'folder' | null
  setRootCreatingType: (type: 'file' | 'folder' | null) => void
  onRootCreate: (name: string) => void
  showGenerated: boolean
  onToggleGenerated: () => void
  onExportOverleaf: () => void
  exportingOverleaf: boolean
}

function VirtualizedProjectFileTree({
  projectIndex,
  gitFiles,
  rootCreatingType,
  setRootCreatingType,
  onRootCreate,
  showGenerated,
  onToggleGenerated,
  onExportOverleaf,
  exportingOverleaf
}: VirtualizedProjectFileTreeProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<CreatingProjectRow | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const initializedRootRef = useRef<string | null>(null)

  useEffect(() => {
    if (initializedRootRef.current === projectIndex.root) return
    initializedRootRef.current = projectIndex.root
    setExpanded(
      new Set(
        projectIndex.entries
          .filter((entry) => entry.type === 'directory' && !entry.parentRelativePath)
          .map((entry) => entry.relativePath)
      )
    )
    setCreating(null)
    setScrollTop(0)
    if (viewportRef.current) viewportRef.current.scrollTop = 0
  }, [projectIndex])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateHeight = (height?: number): void =>
      setViewportHeight(height ?? viewport.clientHeight)
    updateHeight()
    const observer = new ResizeObserver((entries) => {
      updateHeight(entries[0]?.contentRect.height)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const treeIndex = useMemo(
    () => buildProjectTreeIndex(projectIndex.root, projectIndex.entries),
    [projectIndex.root, projectIndex.entries]
  )
  const visibleRows = useMemo(
    () => flattenVisibleProjectTree(treeIndex, expanded),
    [treeIndex, expanded]
  )
  const displayRows = useMemo<ProjectDisplayRow[]>(() => {
    const rows: ProjectDisplayRow[] = []
    for (const row of visibleRows) {
      rows.push({ kind: 'entry', key: row.entry.path, row })
      if (creating?.parentRelativePath === row.entry.relativePath) {
        rows.push({ kind: 'create', key: `create:${row.entry.path}`, creating })
      }
    }
    return rows
  }, [creating, visibleRows])
  const range = calculateVirtualRowRange(
    displayRows.length,
    scrollTop,
    viewportHeight,
    FILE_TREE_ROW_HEIGHT,
    FILE_TREE_OVERSCAN
  )
  const renderedRows = displayRows.slice(range.start, range.end)

  const toggle = useCallback((relativePath: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }, [])

  const requestCreate = useCallback((row: ProjectTreeRow, type: 'file' | 'folder') => {
    setExpanded((current) => new Set(current).add(row.entry.relativePath))
    setCreating({
      parentPath: row.entry.path,
      parentRelativePath: row.entry.relativePath,
      depth: row.depth + 1,
      type
    })
  }, [])

  const submitCreate = useCallback(
    async (name: string) => {
      if (!creating) return
      const fullPath = childPath(creating.parentPath, name)
      try {
        if (creating.type === 'folder') await window.api.createDirectory(fullPath)
        else {
          await window.api.createFile(fullPath)
          const result = await window.api.readFile(fullPath)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        }
      } catch (error) {
        logError('FileTree:createIndexedPath', error)
      } finally {
        setCreating(null)
      }
    },
    [creating]
  )

  const handleRenamed = useCallback((entry: ProjectIndexEntry, destination: string) => {
    if (entry.type !== 'directory') return
    const destinationName = destination.slice(
      Math.max(destination.lastIndexOf('/'), destination.lastIndexOf('\\')) + 1
    )
    const destinationRelativePath = entry.parentRelativePath
      ? `${entry.parentRelativePath}/${destinationName}`
      : destinationName
    setExpanded((current) => {
      const next = new Set<string>()
      for (const path of current) {
        if (path === entry.relativePath || path.startsWith(`${entry.relativePath}/`)) {
          next.add(`${destinationRelativePath}${path.slice(entry.relativePath.length)}`)
        } else next.add(path)
      }
      return next
    })
  }, [])

  const handleDeleted = useCallback((entry: ProjectIndexEntry) => {
    if (entry.type !== 'directory') return
    setExpanded(
      (current) =>
        new Set(
          [...current].filter(
            (path) => path !== entry.relativePath && !path.startsWith(`${entry.relativePath}/`)
          )
        )
    )
  }, [])

  return (
    <div className="file-tree file-tree-virtualized">
      <div className="file-tree-header">
        <button
          className="file-tree-header-btn"
          onClick={() => setRootCreatingType('file')}
          title={t('fileTree.newFile')}
          aria-label={t('fileTree.newFile')}
        >
          <FilePlus2 size={ICON_SIZE.compact} />
        </button>
        <button
          className="file-tree-header-btn"
          onClick={() => setRootCreatingType('folder')}
          title={t('fileTree.newFolder')}
          aria-label={t('fileTree.newFolder')}
        >
          <FolderPlus size={ICON_SIZE.compact} />
        </button>
        <button
          className="file-tree-header-btn"
          onClick={onToggleGenerated}
          title={t(showGenerated ? 'fileTree.hideGenerated' : 'fileTree.showGenerated')}
          aria-label={t(showGenerated ? 'fileTree.hideGenerated' : 'fileTree.showGenerated')}
          aria-pressed={showGenerated}
        >
          {showGenerated ? <EyeOff size={ICON_SIZE.compact} /> : <Eye size={ICON_SIZE.compact} />}
        </button>
        <button
          className="file-tree-header-btn"
          onClick={onExportOverleaf}
          disabled={exportingOverleaf}
          title={t('fileTree.exportOverleaf')}
          aria-label={t('fileTree.exportOverleaf')}
        >
          <Archive size={ICON_SIZE.compact} />
        </button>
      </div>
      {rootCreatingType && (
        <InlineInput
          depth={0}
          icon={getFileIcon(
            rootCreatingType === 'folder' ? 'folder' : 'untitled.txt',
            rootCreatingType === 'folder' ? 'directory' : 'file'
          )}
          onSubmit={onRootCreate}
          onCancel={() => setRootCreatingType(null)}
        />
      )}
      {displayRows.length === 0 ? (
        <div className="git-empty">{t('fileTree.noFolder')}</div>
      ) : (
        <div
          ref={viewportRef}
          className="file-tree-viewport"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div
            className="file-tree-virtual-space"
            style={{ height: displayRows.length * FILE_TREE_ROW_HEIGHT }}
          >
            <div
              className="file-tree-virtual-window"
              style={{ transform: `translateY(${range.start * FILE_TREE_ROW_HEIGHT}px)` }}
            >
              {renderedRows.map((displayRow) =>
                displayRow.kind === 'entry' ? (
                  <ProjectFileTreeRow
                    key={displayRow.key}
                    row={displayRow.row}
                    expanded={expanded.has(displayRow.row.entry.relativePath)}
                    gitFiles={gitFiles}
                    onToggle={toggle}
                    onCreate={requestCreate}
                    onRenamed={handleRenamed}
                    onDeleted={handleDeleted}
                  />
                ) : (
                  <div
                    key={displayRow.key}
                    className="file-tree-virtual-row"
                    style={{ height: FILE_TREE_ROW_HEIGHT }}
                  >
                    <InlineInput
                      depth={displayRow.creating.depth}
                      icon={getFileIcon(
                        displayRow.creating.type === 'folder' ? 'folder' : 'untitled.txt',
                        displayRow.creating.type === 'folder' ? 'directory' : 'file'
                      )}
                      onSubmit={submitCreate}
                      onCancel={() => setCreating(null)}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileTree() {
  const { t } = useTranslation()
  const directoryTree = useProjectStore((s) => s.directoryTree)
  const gitStatus = useProjectStore((s) => s.gitStatus)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const projectIndexRoot = useProjectStore((s) => s.projectIndex?.root ?? null)
  const projectIndexEntries = useProjectStore((s) => s.projectIndex?.entries ?? null)
  const setDirectoryTree = useProjectStore((s) => s.setDirectoryTree)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)
  const [showGenerated, setShowGenerated] = useState(false)
  const [exportingOverleaf, setExportingOverleaf] = useState(false)
  const projectIndex = useMemo(
    () =>
      projectIndexRoot && projectIndexEntries
        ? { root: projectIndexRoot, entries: projectIndexEntries }
        : null,
    [projectIndexEntries, projectIndexRoot]
  )
  const displayedProjectIndex = useMemo(
    () =>
      projectIndex
        ? {
            ...projectIndex,
            entries: showGenerated
              ? projectIndex.entries
              : filterGeneratedProjectEntries(projectIndex.entries)
          }
        : null,
    [projectIndex, showGenerated]
  )
  const visibleDirectoryTree = useMemo(
    () =>
      showGenerated ? (directoryTree ?? []) : filterGeneratedDirectoryEntries(directoryTree ?? []),
    [directoryTree, showGenerated]
  )

  const handleExportOverleaf = useCallback(async () => {
    if (!projectRoot || exportingOverleaf) return
    setExportingOverleaf(true)
    try {
      const result = await window.api.exportOverleafZip()
      if (result) {
        useNotificationStore.getState().pushNotification({
          message: t('fileTree.exportOverleafComplete', { path: result.outputPath }),
          tone: 'success'
        })
      }
    } catch (error) {
      useNotificationStore.getState().pushNotification({
        message: t('fileTree.exportOverleafFailed', { reason: errorMessage(error) }),
        tone: 'error'
      })
    } finally {
      setExportingOverleaf(false)
    }
  }, [exportingOverleaf, projectRoot, t])

  const refreshRoot = useCallback(async () => {
    if (!projectRoot) return
    const entries = await window.api.readDirectory(projectRoot)
    setDirectoryTree(entries)
  }, [projectRoot, setDirectoryTree])

  const handleRootCreate = useCallback(
    async (name: string) => {
      if (!projectRoot) return
      const fullPath = childPath(projectRoot, name)
      try {
        if (creatingType === 'folder') {
          await window.api.createDirectory(fullPath)
        } else {
          await window.api.createFile(fullPath)
          const result = await window.api.readFile(fullPath)
          useEditorStore.getState().openFileInTab(result.filePath, result.content)
        }
        await refreshRoot()
      } catch (err) {
        logError('FileTree:rootCreate', err)
      }
      setCreatingType(null)
    },
    [projectRoot, creatingType, refreshRoot]
  )

  if (projectRoot && displayedProjectIndex) {
    return (
      <VirtualizedProjectFileTree
        projectIndex={displayedProjectIndex}
        gitFiles={gitStatus?.files}
        rootCreatingType={creatingType}
        setRootCreatingType={setCreatingType}
        onRootCreate={(name) => void handleRootCreate(name)}
        showGenerated={showGenerated}
        onToggleGenerated={() => setShowGenerated((current) => !current)}
        onExportOverleaf={() => void handleExportOverleaf()}
        exportingOverleaf={exportingOverleaf}
      />
    )
  }

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
          <FilePlus2 size={ICON_SIZE.compact} />
        </button>
        <button
          className="file-tree-header-btn"
          onClick={() => setCreatingType('folder')}
          title={t('fileTree.newFolder')}
          aria-label={t('fileTree.newFolder')}
        >
          <FolderPlus size={ICON_SIZE.compact} />
        </button>
        <button
          className="file-tree-header-btn"
          onClick={() => setShowGenerated((current) => !current)}
          title={t(showGenerated ? 'fileTree.hideGenerated' : 'fileTree.showGenerated')}
          aria-label={t(showGenerated ? 'fileTree.hideGenerated' : 'fileTree.showGenerated')}
          aria-pressed={showGenerated}
        >
          {showGenerated ? <EyeOff size={ICON_SIZE.compact} /> : <Eye size={ICON_SIZE.compact} />}
        </button>
        <button
          className="file-tree-header-btn"
          onClick={() => void handleExportOverleaf()}
          disabled={exportingOverleaf}
          title={t('fileTree.exportOverleaf')}
          aria-label={t('fileTree.exportOverleaf')}
        >
          <Archive size={ICON_SIZE.compact} />
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
      {visibleDirectoryTree.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          gitFiles={gitStatus?.files}
          onChanged={refreshRoot}
          showGenerated={showGenerated}
        />
      ))}
    </div>
  )
}

export default memo(FileTree)
