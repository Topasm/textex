import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  FolderOpen,
  Clock,
  MoreVertical,
  Pin,
  RotateCcw,
  Tag,
  Trash2
} from 'lucide-react'
import type { RecentProject } from '../../../shared/types'
import { openProject } from '../../utils/openProject'
import { logError } from '../../utils/errorMessage'
import { nativeErrorCode } from '../../../shared/appError'
import { describeNativeError } from '../../services/nativeErrors'
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

interface RecentProjectOpenFailure {
  projectPath: string
  reason: string
  replacementPath: string
  replacementError: string | null
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
  const [openFailure, setOpenFailure] = useState<RecentProjectOpenFailure | null>(null)
  const [isSavingRecovery, setIsSavingRecovery] = useState(false)
  const [isRetryingPath, setIsRetryingPath] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const tagEditorRef = useRef<HTMLDivElement>(null)
  const pathEditorRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)

  // Native path failures are matched by code, never by their English text.
  const getPathErrorMessage = useCallback(
    (err: unknown) => {
      switch (nativeErrorCode(err)) {
        case 'invalidPath':
        case 'nonUtf8Path':
          return t('recentProjects.invalidPath')
        case 'io':
        case 'notADirectory':
        case 'notAFile':
          return t('recentProjects.pathNotFound')
        case 'recentProjectUnauthorized':
          return t('recentProjects.pathNotAuthorized')
        default:
          return t('recentProjects.pathSaveFailed')
      }
    },
    [t]
  )

  const getOpenErrorMessage = useCallback(
    (err: unknown) => {
      if (nativeErrorCode(err) !== null) return getPathErrorMessage(err)
      return describeNativeError(err).trim() || t('recentProjects.pathSaveFailed')
    },
    [getPathErrorMessage, t]
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
      setIsRetryingPath(true)
      try {
        const snapshot = await openProject(project.path)
        if (snapshot) {
          setOpenFailure((failure) => (failure?.projectPath === project.path ? null : failure))
        }
      } catch (err) {
        logError('RecentProject:open', err)
        setMenuOpenPath(null)
        setEditingProjectPath(null)
        setOpenFailure((failure) => ({
          projectPath: project.path,
          reason: getOpenErrorMessage(err),
          replacementPath:
            failure?.projectPath === project.path ? failure.replacementPath : project.path,
          replacementError: failure?.projectPath === project.path ? failure.replacementError : null
        }))
      } finally {
        setIsRetryingPath(false)
      }
    },
    [getOpenErrorMessage]
  )

  const handleRemoveRecent = useCallback(
    (projectPath: string) => {
      setMenuOpenPath(null)
      window.api
        .removeRecentProject(projectPath)
        .then((settings) => {
          setRecentProjects(settings.recentProjects ?? [])
          setOpenFailure((failure) => (failure?.projectPath === projectPath ? null : failure))
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

  const handleBrowseRecovery = useCallback(
    async (projectPath: string) => {
      try {
        const selectedPath = await window.api.openDirectory()
        if (!selectedPath) return
        setOpenFailure((failure) =>
          failure?.projectPath === projectPath
            ? { ...failure, replacementPath: selectedPath, replacementError: null }
            : failure
        )
      } catch (err) {
        logError('recentProject:browseRecovery', err)
        setOpenFailure((failure) =>
          failure?.projectPath === projectPath
            ? { ...failure, replacementError: t('recentProjects.pathSaveFailed') }
            : failure
        )
      }
    },
    [t]
  )

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
        setOpenFailure((failure) => (failure?.projectPath === projectPath ? null : failure))
      } catch (err) {
        logError('recentProject:path', err)
        setPathError(getPathErrorMessage(err))
      } finally {
        setIsSavingPath(false)
      }
    },
    [getPathErrorMessage, pathInputValue, setRecentProjects]
  )

  const handleSaveRecovery = useCallback(
    async (projectPath: string) => {
      const failure = openFailure
      if (failure?.projectPath !== projectPath) return

      setIsSavingRecovery(true)
      setOpenFailure({ ...failure, replacementError: null })
      try {
        const settings = await window.api.updateRecentProject(projectPath, {
          path: failure.replacementPath.trim()
        })
        setRecentProjects(settings.recentProjects ?? [])
        setOpenFailure((current) => (current?.projectPath === projectPath ? null : current))
      } catch (err) {
        logError('recentProject:recoveryPath', err)
        const replacementError = getPathErrorMessage(err)
        setOpenFailure((current) =>
          current?.projectPath === projectPath ? { ...current, replacementError } : current
        )
      } finally {
        setIsSavingRecovery(false)
      }
    },
    [getPathErrorMessage, openFailure, setRecentProjects]
  )

  if (sortedProjects.length === 0) return null

  return (
    <div className="home-recent">
      <h2 className="home-recent-title">
        <Clock size={ICON_SIZE.control} />
        {t('recentProjects.title')}
      </h2>
      <div className="home-recent-list">
        {sortedProjects.map((project, index) => {
          const failure = openFailure?.projectPath === project.path ? openFailure : null
          const recoveryId = `recent-project-recovery-${index}`
          return (
            <div
              key={project.path}
              className={`home-recent-item${project.pinned ? ' pinned' : ''}${failure ? ' has-error' : ''}`}
            >
              <button
                type="button"
                className="home-recent-item-open"
                aria-label={project.title || project.name}
                aria-describedby={failure ? `${recoveryId}-message` : undefined}
                disabled={isRetryingPath && failure !== null}
                onClick={() => void handleOpenRecent(project)}
              >
                {project.pinned && (
                  <span className="home-recent-item-pin-indicator">
                    <Pin size={ICON_SIZE.micro} />
                  </span>
                )}
                <FolderOpen size={ICON_SIZE.prominent} className="home-recent-item-icon" />
                <span className="home-recent-item-info">
                  <span className="home-recent-item-title">{project.title || project.name}</span>
                  <span className="home-recent-item-folder">{project.name}</span>
                </span>
                <span className="home-recent-item-meta">
                  <span className="home-recent-item-date">
                    {formatRelativeDate(project.lastOpened, t)}
                  </span>
                  {project.tag && <span className="home-recent-item-tag">{project.tag}</span>}
                </span>
              </button>

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
                  <MoreVertical size={ICON_SIZE.compact} />
                </button>

                {menuOpenPath === project.path && (
                  <div className="home-recent-item-dropdown">
                    <button onClick={(e) => handleTogglePin(e, project)}>
                      <Pin size={ICON_SIZE.compact} />
                      {project.pinned ? t('recentProjects.unpin') : t('recentProjects.pin')}
                    </button>
                    <button onClick={(e) => handleEditTag(e, project)}>
                      <Tag size={ICON_SIZE.compact} />
                      {t('recentProjects.editTag')}
                    </button>
                    <button onClick={(e) => handleEditPath(e, project)}>
                      <FolderOpen size={ICON_SIZE.compact} />
                      {t('recentProjects.editPath')}
                    </button>
                    <button
                      className="danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveRecent(project.path)
                      }}
                    >
                      <Trash2 size={ICON_SIZE.compact} />
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
                      aria-label={t('recentProjects.replacementPath')}
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
                    {pathError && (
                      <div className="home-recent-item-path-error" role="alert">
                        {pathError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {failure && (
                <div
                  id={recoveryId}
                  className="home-recent-item-recovery"
                  role="group"
                  aria-labelledby={`${recoveryId}-message`}
                >
                  <div
                    id={`${recoveryId}-message`}
                    className="home-recent-item-recovery-message"
                    role="alert"
                  >
                    <AlertTriangle size={ICON_SIZE.control} aria-hidden="true" />
                    <span>
                      {t('recentProjects.openFailed', {
                        path: failure.projectPath,
                        reason: failure.reason
                      })}
                    </span>
                  </div>
                  <label className="home-recent-item-recovery-label" htmlFor={`${recoveryId}-path`}>
                    {t('recentProjects.replacementPath')}
                  </label>
                  <input
                    id={`${recoveryId}-path`}
                    className="home-recent-item-path-input"
                    type="text"
                    value={failure.replacementPath}
                    aria-invalid={failure.replacementError !== null}
                    aria-describedby={failure.replacementError ? `${recoveryId}-error` : undefined}
                    onChange={(e) => {
                      const replacementPath = e.target.value
                      setOpenFailure((current) =>
                        current?.projectPath === project.path
                          ? { ...current, replacementPath, replacementError: null }
                          : current
                      )
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSaveRecovery(project.path)
                      }
                    }}
                  />
                  {failure.replacementError && (
                    <div
                      id={`${recoveryId}-error`}
                      className="home-recent-item-path-error"
                      role="alert"
                    >
                      {failure.replacementError}
                    </div>
                  )}
                  <div className="home-recent-item-recovery-actions">
                    <button
                      type="button"
                      disabled={isRetryingPath}
                      onClick={() => void handleOpenRecent(project)}
                    >
                      <RotateCcw size={ICON_SIZE.compact} aria-hidden="true" />
                      {t('recentProjects.retry')}
                    </button>
                    <button type="button" onClick={() => void handleBrowseRecovery(project.path)}>
                      <FolderOpen size={ICON_SIZE.compact} aria-hidden="true" />
                      {t('recentProjects.browse')}
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={isSavingRecovery}
                      onClick={() => void handleSaveRecovery(project.path)}
                    >
                      {t('recentProjects.save')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleRemoveRecent(project.path)}
                    >
                      <Trash2 size={ICON_SIZE.compact} aria-hidden="true" />
                      {t('recentProjects.remove')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
