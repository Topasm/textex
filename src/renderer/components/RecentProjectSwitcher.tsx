import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, FolderKanban, Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RecentProject } from '../../shared/types'
import { projectPathKey } from '../services/projectIndex'
import { useProjectStore } from '../store/useProjectStore'
import { focusCollectionItem, type CollectionFocusPosition } from '../utils/collectionFocus'
import { errorMessage, logError } from '../utils/errorMessage'
import { openProject } from '../utils/openProject'
import './RecentProjectSwitcher.css'

function projectNameFromPath(projectPath: string): string {
  const normalized = projectPath.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || projectPath
}

function projectLabel(project: RecentProject): string {
  return project.title || project.name
}

export function RecentProjectSwitcher() {
  const { t } = useTranslation()
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [switchingPath, setSwitchingPath] = useState<string | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pendingInitialFocus = useRef<Extract<CollectionFocusPosition, 'first' | 'last'> | null>(
    null
  )
  const menuId = useId()
  const loadFailedLabel = t('projectSwitcher.loadFailed')

  const currentPathKey = projectRoot ? projectPathKey(projectRoot) : null
  const displayedProjects = useMemo(() => {
    if (!projectRoot || !currentPathKey) return []

    const projectsByPath = new Map<string, RecentProject>()
    for (const project of recentProjects) {
      projectsByPath.set(projectPathKey(project.path), project)
    }
    if (!projectsByPath.has(currentPathKey)) {
      projectsByPath.set(currentPathKey, {
        path: projectRoot,
        name: projectNameFromPath(projectRoot),
        lastOpened: ''
      })
    }

    return [...projectsByPath.values()].sort((left, right) => {
      const pinOrder = Number(right.pinned === true) - Number(left.pinned === true)
      if (pinOrder !== 0) return pinOrder
      const leftOpenedAt = Date.parse(left.lastOpened || '') || 0
      const rightOpenedAt = Date.parse(right.lastOpened || '') || 0
      return rightOpenedAt - leftOpenedAt
    })
  }, [currentPathKey, projectRoot, recentProjects])

  const currentProject = useMemo(
    () => displayedProjects.find((project) => projectPathKey(project.path) === currentPathKey),
    [currentPathKey, displayedProjects]
  )
  const currentProjectName = currentProject
    ? projectLabel(currentProject)
    : projectRoot
      ? projectNameFromPath(projectRoot)
      : ''

  const closeMenu = useCallback((restoreFocus = false) => {
    pendingInitialFocus.current = null
    setIsOpen(false)
    setMenuError(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    closeMenu()
  }, [closeMenu, projectRoot])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setIsLoading(true)
    setMenuError(null)
    void window.api
      .loadSettings()
      .then((settings) => {
        if (!cancelled) setRecentProjects(settings.recentProjects ?? [])
      })
      .catch((error) => {
        if (cancelled) return
        logError('RecentProjectSwitcher:loadSettings', error)
        setMenuError(loadFailedLabel)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, loadFailedLabel])

  useEffect(() => {
    if (!isOpen || isLoading) return
    const position = pendingInitialFocus.current ?? 'first'
    const focused = focusCollectionItem<HTMLButtonElement>(
      menuRef.current,
      '[role="menuitem"]:not(:disabled)',
      position
    )
    if (focused) pendingInitialFocus.current = null
    if (!focused) menuRef.current?.focus()
  }, [displayedProjects, isLoading, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleOutsideMouseDown = (event: MouseEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) closeMenu()
    }
    document.addEventListener('mousedown', handleOutsideMouseDown)
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown)
  }, [closeMenu, isOpen])

  if (!projectRoot || !currentPathKey) return null

  const focusMenuItem = (position: 'first' | 'last' | 'next' | 'previous'): void => {
    const focused = focusCollectionItem<HTMLButtonElement>(
      menuRef.current,
      '[role="menuitem"]:not(:disabled)',
      position
    )
    if (!focused) menuRef.current?.focus()
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusMenuItem('next')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusMenuItem('previous')
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusMenuItem('first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusMenuItem('last')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    } else if (event.key === 'Tab') {
      closeMenu()
    }
  }

  const handleOpenProject = async (project: RecentProject): Promise<void> => {
    if (switchingPath || projectPathKey(project.path) === currentPathKey) return
    setSwitchingPath(project.path)
    setMenuError(null)
    try {
      const transition = await openProject(project.path)
      if (transition) closeMenu()
    } catch (error) {
      logError('RecentProjectSwitcher:openProject', error)
      setMenuError(
        t('projectSwitcher.openFailed', {
          name: projectLabel(project),
          reason: errorMessage(error)
        })
      )
    } finally {
      setSwitchingPath(null)
    }
  }

  return (
    <div className="recent-project-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="recent-project-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={t('projectSwitcher.currentProject', { name: currentProjectName })}
        title={t('projectSwitcher.switchProject')}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          pendingInitialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
          setIsOpen(true)
        }}
      >
        <FolderKanban size={15} aria-hidden="true" />
        <span className="recent-project-switcher-name">{currentProjectName}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          ref={menuRef}
          className="recent-project-switcher-menu"
          role="menu"
          aria-label={t('projectSwitcher.menuLabel')}
          aria-busy={isLoading || switchingPath !== null}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="recent-project-switcher-heading" role="presentation">
            {t('projectSwitcher.menuLabel')}
          </div>
          {isLoading ? (
            <div className="recent-project-switcher-state" role="status">
              {t('projectSwitcher.loading')}
            </div>
          ) : (
            displayedProjects.map((project) => {
              const isCurrent = projectPathKey(project.path) === currentPathKey
              const isSwitching = switchingPath === project.path
              const label = projectLabel(project)
              return (
                <button
                  type="button"
                  role="menuitem"
                  key={projectPathKey(project.path)}
                  className={`recent-project-switcher-item${isCurrent ? ' current' : ''}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={isCurrent ? t('projectSwitcher.currentItem', { name: label }) : label}
                  disabled={isCurrent || switchingPath !== null}
                  title={project.path}
                  onClick={() => void handleOpenProject(project)}
                >
                  <span className="recent-project-switcher-item-icon" aria-hidden="true">
                    {isCurrent ? (
                      <Check size={14} />
                    ) : project.pinned ? (
                      <Pin size={13} />
                    ) : (
                      <span />
                    )}
                  </span>
                  <span className="recent-project-switcher-item-copy">
                    <span>{label}</span>
                    <span>{project.path}</span>
                  </span>
                  {isCurrent && (
                    <span className="recent-project-switcher-current">
                      {t('projectSwitcher.current')}
                    </span>
                  )}
                  {isSwitching && (
                    <span className="recent-project-switcher-current">
                      {t('projectSwitcher.switching')}
                    </span>
                  )}
                </button>
              )
            })
          )}
          {menuError && (
            <div className="recent-project-switcher-error" role="alert">
              {menuError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
