import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Clock, MoreVertical, Pin, Tag, Trash2 } from 'lucide-react'
import type { RecentProject } from '../../../shared/types'
import { openProject } from '../../utils/openProject'
import { errorMessage, logError } from '../../utils/errorMessage'
import type { TFunction } from 'i18next'

function formatRelativeDate(iso: string, t: TFunction): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return t('recentProjects.today')
  if (diffDays === 1) return t('recentProjects.yesterday')
  if (diffDays < 7) return t('recentProjects.daysAgo', { count: diffDays })
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1
      ? t('recentProjects.weekAgo')
      : t('recentProjects.weeksAgo', { count: weeks })
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1
      ? t('recentProjects.monthAgo')
      : t('recentProjects.monthsAgo', { count: months })
  }
  return date.toLocaleDateString()
}

interface RecentProjectListProps {
  recentProjects: RecentProject[]
  setRecentProjects: (projects: RecentProject[]) => void
}

export function RecentProjectList({ recentProjects, setRecentProjects }: RecentProjectListProps) {
  const { t } = useTranslation()
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null)
  const [editingTagPath, setEditingTagPath] = useState<string | null>(null)
  const [editingProjectPath, setEditingProjectPath] = useState<string | null>(null)
  const [tagInputValue, setTagInputValue] = useState('')
  const [pathInputValue, setPathInputValue] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [isSavingPath, setIsSavingPath] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const tagEditorRef = useRef<HTMLDivElement>(null)
  const pathEditorRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)

  const getPathErrorMessage = useCallback(
    (err: unknown) => {
      const message = errorMessage(err)
      if (message.includes('must be absolute') || message.includes('Invalid recent project path')) {
        return t('recentProjects.invalidPath')
      }
      if (message.includes('not found') || message.includes('must be a directory')) {
        return t('recentProjects.pathNotFound')
      }
      return t('recentProjects.pathSaveFailed')
    },
    [t]
  )

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
      if (
        editingProjectPath &&
        pathEditorRef.current &&
        !pathEditorRef.current.contains(e.target as Node)
      ) {
        setEditingProjectPath(null)
        setPathError(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpenPath, editingTagPath, editingProjectPath])

  useEffect(() => {
    if (editingTagPath) {
      setTimeout(() => tagInputRef.current?.focus(), 50)
    }
  }, [editingTagPath])

  useEffect(() => {
    if (editingProjectPath) {
      setTimeout(() => pathInputRef.current?.focus(), 50)
    }
  }, [editingProjectPath])

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
    setEditingProjectPath(null)
    setPathError(null)
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
    setEditingProjectPath(null)
    setPathError(null)
    setTagInputValue(project.tag ?? '')
    setEditingTagPath(project.path)
  }, [])

  const handleEditPath = useCallback((e: React.MouseEvent, project: RecentProject) => {
    e.stopPropagation()
    setMenuOpenPath(null)
    setEditingTagPath(null)
    setPathError(null)
    setPathInputValue(project.path)
    setEditingProjectPath(project.path)
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

  const handleBrowsePath = useCallback(async () => {
    try {
      const selectedPath = await window.api.openDirectory()
      if (!selectedPath) return
      setPathInputValue(selectedPath)
      setPathError(null)
    } catch (err) {
      logError('recentProject:browsePath', err)
      setPathError(t('recentProjects.pathSaveFailed'))
    }
  }, [t])

  const handleSavePath = useCallback(
    async (projectPath: string) => {
      const trimmed = pathInputValue.trim()
      setIsSavingPath(true)
      setPathError(null)
      try {
        const settings = await window.api.updateRecentProject(projectPath, {
          path: trimmed
        })
        setRecentProjects(settings.recentProjects ?? [])
        setEditingProjectPath(null)
      } catch (err) {
        logError('recentProject:path', err)
        setPathError(getPathErrorMessage(err))
      } finally {
        setIsSavingPath(false)
      }
    },
    [getPathErrorMessage, pathInputValue, setRecentProjects]
  )

  if (sortedProjects.length === 0) return null

  return (
    <div className="home-recent">
      <h2 className="home-recent-title">
        <Clock size={16} />
        {t('recentProjects.title')}
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
                {formatRelativeDate(project.lastOpened, t)}
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
                aria-label={t('recentProjects.moreActions')}
                title={t('recentProjects.moreActions')}
              >
                <MoreVertical size={14} />
              </button>

              {menuOpenPath === project.path && (
                <div className="home-recent-item-dropdown">
                  <button onClick={(e) => handleTogglePin(e, project)}>
                    <Pin size={14} />
                    {project.pinned ? t('recentProjects.unpin') : t('recentProjects.pin')}
                  </button>
                  <button onClick={(e) => handleEditTag(e, project)}>
                    <Tag size={14} />
                    {t('recentProjects.editTag')}
                  </button>
                  <button onClick={(e) => handleEditPath(e, project)}>
                    <FolderOpen size={14} />
                    {t('recentProjects.editPath')}
                  </button>
                  <button className="danger" onClick={(e) => handleRemoveRecent(e, project.path)}>
                    <Trash2 size={14} />
                    {t('recentProjects.remove')}
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
                    placeholder={t('recentProjects.tagPlaceholder')}
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
                    {t('recentProjects.save')}
                  </button>
                </div>
              )}

              {editingProjectPath === project.path && (
                <div
                  className="home-recent-item-path-editor"
                  ref={pathEditorRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={pathInputRef}
                    className="home-recent-item-path-input"
                    type="text"
                    placeholder={t('recentProjects.pathPlaceholder')}
                    value={pathInputValue}
                    onChange={(e) => {
                      setPathInputValue(e.target.value)
                      if (pathError) {
                        setPathError(null)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSavePath(project.path)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingProjectPath(null)
                        setPathError(null)
                      }
                    }}
                  />
                  <div className="home-recent-item-path-actions">
                    <button
                      className="home-recent-item-path-browse"
                      type="button"
                      onClick={() => void handleBrowsePath()}
                    >
                      {t('recentProjects.browse')}
                    </button>
                    <button
                      className="home-recent-item-tag-save"
                      type="button"
                      disabled={isSavingPath}
                      onClick={() => void handleSavePath(project.path)}
                    >
                      {t('recentProjects.save')}
                    </button>
                  </div>
                  {pathError && <div className="home-recent-item-path-error">{pathError}</div>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
