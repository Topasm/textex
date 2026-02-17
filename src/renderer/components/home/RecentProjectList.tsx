import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Clock, MoreVertical, Pin, Tag, Trash2 } from 'lucide-react'
import type { RecentProject } from '../../../shared/types'
import { openProject } from '../../utils/openProject'
import { logError } from '../../utils/errorMessage'

function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  return date.toLocaleDateString()
}

interface RecentProjectListProps {
  recentProjects: RecentProject[]
  setRecentProjects: (projects: RecentProject[]) => void
}

export function RecentProjectList({ recentProjects, setRecentProjects }: RecentProjectListProps) {
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null)
  const [editingTagPath, setEditingTagPath] = useState<string | null>(null)
  const [tagInputValue, setTagInputValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const tagEditorRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Click-outside handler
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuOpenPath && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenPath(null)
      }
      if (
        editingTagPath &&
        tagEditorRef.current &&
        !tagEditorRef.current.contains(e.target as Node)
      ) {
        setEditingTagPath(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpenPath, editingTagPath])

  useEffect(() => {
    if (editingTagPath) {
      setTimeout(() => tagInputRef.current?.focus(), 50)
    }
  }, [editingTagPath])

  const sortedProjects = useMemo(() => {
    const pinned = recentProjects.filter((p) => p.pinned)
    const unpinned = recentProjects.filter((p) => !p.pinned)
    return [...pinned, ...unpinned]
  }, [recentProjects])

  const handleOpenRecent = useCallback(
    async (project: RecentProject) => {
      try {
        await window.api.readDirectory(project.path)
        await openProject(project.path)
      } catch (err) {
        logError('RecentProject:open', err)
        window.api
          .removeRecentProject(project.path)
          .then((settings) => {
            setRecentProjects(settings.recentProjects ?? [])
          })
          .catch((err) => logError('recentProject', err))
      }
    },
    [setRecentProjects]
  )

  const handleRemoveRecent = useCallback(
    (e: React.MouseEvent, projectPath: string) => {
      e.stopPropagation()
      setMenuOpenPath(null)
      window.api
        .removeRecentProject(projectPath)
        .then((settings) => {
          setRecentProjects(settings.recentProjects ?? [])
        })
        .catch((err) => logError('recentProject', err))
    },
    [setRecentProjects]
  )

  const handleToggleMenu = useCallback((e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation()
    setMenuOpenPath((prev) => (prev === projectPath ? null : projectPath))
    setEditingTagPath(null)
  }, [])

  const handleTogglePin = useCallback(
    (e: React.MouseEvent, project: RecentProject) => {
      e.stopPropagation()
      setMenuOpenPath(null)
      window.api
        .updateRecentProject(project.path, { pinned: !project.pinned })
        .then((settings) => {
          setRecentProjects(settings.recentProjects ?? [])
        })
        .catch((err) => logError('recentProject', err))
    },
    [setRecentProjects]
  )

  const handleEditTag = useCallback((e: React.MouseEvent, project: RecentProject) => {
    e.stopPropagation()
    setMenuOpenPath(null)
    setTagInputValue(project.tag ?? '')
    setEditingTagPath(project.path)
  }, [])

  const handleSaveTag = useCallback(
    (projectPath: string) => {
      const trimmed = tagInputValue.trim()
      window.api
        .updateRecentProject(projectPath, { tag: trimmed || undefined })
        .then((settings) => {
          setRecentProjects(settings.recentProjects ?? [])
        })
        .catch((err) => logError('recentProject', err))
      setEditingTagPath(null)
    },
    [tagInputValue, setRecentProjects]
  )

  if (sortedProjects.length === 0) return null

  return (
    <div className="home-recent">
      <h2 className="home-recent-title">
        <Clock size={16} />
        Recent Projects
      </h2>
      <div className="home-recent-list">
        {sortedProjects.map((project) => (
          <div
            key={project.path}
            className={`home-recent-item${project.pinned ? ' pinned' : ''}`}
            onClick={() => handleOpenRecent(project)}
          >
            {project.pinned && (
              <span className="home-recent-item-pin-indicator">
                <Pin size={12} />
              </span>
            )}
            <FolderOpen size={20} className="home-recent-item-icon" />
            <div className="home-recent-item-info">
              <span className="home-recent-item-title">{project.title || project.name}</span>
              <span className="home-recent-item-folder">{project.name}</span>
            </div>
            <div className="home-recent-item-meta">
              <span className="home-recent-item-date">
                {formatRelativeDate(project.lastOpened)}
              </span>
              {project.tag && <span className="home-recent-item-tag">{project.tag}</span>}
            </div>

            <div
              className="home-recent-item-menu-wrapper"
              ref={menuOpenPath === project.path ? menuRef : undefined}
            >
              <button
                className="home-recent-item-menu-btn"
                onClick={(e) => handleToggleMenu(e, project.path)}
                title="More actions"
              >
                <MoreVertical size={14} />
              </button>

              {menuOpenPath === project.path && (
                <div className="home-recent-item-dropdown">
                  <button onClick={(e) => handleTogglePin(e, project)}>
                    <Pin size={14} />
                    {project.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button onClick={(e) => handleEditTag(e, project)}>
                    <Tag size={14} />
                    Edit Tag
                  </button>
                  <button className="danger" onClick={(e) => handleRemoveRecent(e, project.path)}>
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              )}

              {editingTagPath === project.path && (
                <div
                  className="home-recent-item-tag-editor"
                  ref={tagEditorRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={tagInputRef}
                    className="home-recent-item-tag-input"
                    type="text"
                    placeholder="e.g. NeurIPS 2025"
                    value={tagInputValue}
                    onChange={(e) => setTagInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSaveTag(project.path)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingTagPath(null)
                      }
                    }}
                  />
                  <button
                    className="home-recent-item-tag-save"
                    onClick={() => handleSaveTag(project.path)}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
