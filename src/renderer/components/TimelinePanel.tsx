import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { GitCommitHorizontal, History } from 'lucide-react'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useProjectStore } from '../store/useProjectStore'
import { errorMessage, logError } from '../utils/errorMessage'
import type { GitLogEntry, HistoryItem } from '../../shared/types'
import { ICON_SIZE } from './ui/IconSystem'

interface TimelineEntry {
  type: 'git' | 'local'
  date: Date
  message: string
  author?: string
  hash?: string
  snapshotPath?: string
}

function mergeTimeline(commits: GitLogEntry[], snapshots: HistoryItem[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const c of commits) {
    entries.push({
      type: 'git',
      date: new Date(c.date),
      message: c.message,
      author: c.author,
      hash: c.hash
    })
  }

  for (const s of snapshots) {
    entries.push({
      type: 'local',
      date: new Date(s.timestamp),
      message: '__LOCAL_SAVE__',
      snapshotPath: s.path
    })
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  return entries
}

export function TimelinePanel() {
  const { t } = useTranslation()
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isGitRepo = useProjectStore((s) => s.isGitRepo)
  const isDirty = useEditorStore((s) => s.isDirty)

  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const prevDirtyRef = useRef(isDirty)
  const refreshRequestRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current
    const requestedFilePath = activeFilePath
    if (!activeFilePath) {
      setEntries([])
      return
    }

    setLoading(true)
    try {
      const [commits, snapshots] = await Promise.all([
        isGitRepo && projectRoot
          ? window.api.gitFileLog(projectRoot, activeFilePath)
          : Promise.resolve([]),
        window.api.getHistoryList(activeFilePath)
      ])
      if (
        refreshRequestRef.current !== requestId ||
        useEditorStore.getState().activeFilePath !== requestedFilePath
      ) {
        return
      }
      setEntries(mergeTimeline(commits, snapshots))
    } catch (err) {
      logError('TimelinePanel:refresh', err)
      if (refreshRequestRef.current === requestId) setEntries([])
    } finally {
      if (refreshRequestRef.current === requestId) setLoading(false)
    }
  }, [activeFilePath, projectRoot, isGitRepo])

  // Refresh when active file changes
  useEffect(() => {
    refresh()
    return () => {
      refreshRequestRef.current += 1
    }
  }, [refresh])

  // Refresh after a save completes (isDirty transitions from true to false)
  useEffect(() => {
    if (prevDirtyRef.current && !isDirty) {
      const timer = setTimeout(refresh, 500)
      return () => clearTimeout(timer)
    }
    prevDirtyRef.current = isDirty
  }, [isDirty, refresh])

  const handleEntryClick = async (entry: TimelineEntry) => {
    if (activeFilePath && entry.type === 'local' && entry.snapshotPath) {
      const editorState = useEditorStore.getState()
      if (editorState.activeFilePath !== activeFilePath) return
      const confirmationKey = editorState.isDirty
        ? 'timelinePanel.restoreDirtyConfirm'
        : 'timelinePanel.restoreConfirm'
      if (!window.confirm(t(confirmationKey))) return

      const requestedFilePath = activeFilePath
      const requestedRevision = documentRegistry.revisionSnapshot(requestedFilePath)
      if (!requestedRevision) return

      try {
        const content = await window.api.loadHistorySnapshot(requestedFilePath, entry.snapshotPath)
        const currentEditorState = useEditorStore.getState()
        const currentModel = documentRegistry.getModel(requestedFilePath)
        if (
          currentEditorState.activeFilePath !== requestedFilePath ||
          !currentModel?.isCurrent(requestedRevision)
        ) {
          useNotificationStore.getState().pushNotification({
            id: 'timeline-restore-stale',
            message: t('timelinePanel.restoreStale'),
            tone: 'warning'
          })
          return
        }

        const restored = currentEditorState.updateActiveDocument(content, 'history-restore')
        if (!restored) return
        useNotificationStore.getState().pushNotification({
          id: 'timeline-restore-success',
          message: t('timelinePanel.restoreSuccess'),
          tone: 'success'
        })
      } catch (err) {
        logError('TimelinePanel:loadSnapshot', err)
        useNotificationStore.getState().pushNotification({
          id: 'timeline-restore-failed',
          message: t('timelinePanel.restoreFailed', { reason: errorMessage(err) }),
          tone: 'error'
        })
      }
    }
  }

  if (!activeFilePath) {
    return (
      <div className="timeline-panel">
        <div className="timeline-empty">{t('timelinePanel.noFile')}</div>
      </div>
    )
  }

  if (loading && entries.length === 0) {
    return (
      <div className="timeline-panel">
        <div className="timeline-empty">{t('timelinePanel.loading')}</div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="timeline-panel">
        <div className="timeline-empty">{t('timelinePanel.noHistory')}</div>
      </div>
    )
  }

  return (
    <div className="timeline-panel">
      {entries.map((entry, i) => (
        <div
          key={`${entry.type}-${entry.date.getTime()}-${i}`}
          className={`timeline-entry${entry.type === 'local' ? ' timeline-entry--local' : ''}`}
          onClick={() => handleEntryClick(entry)}
          role={entry.type === 'local' ? 'button' : undefined}
          tabIndex={entry.type === 'local' ? 0 : undefined}
          onKeyDown={
            entry.type === 'local'
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleEntryClick(entry)
                  }
                }
              : undefined
          }
        >
          <div className="timeline-icon">
            {entry.type === 'git' ? (
              <GitCommitHorizontal size={ICON_SIZE.compact} />
            ) : (
              <History size={ICON_SIZE.compact} />
            )}
          </div>
          <div className="timeline-info">
            <span className="timeline-message">
              {entry.message === '__LOCAL_SAVE__' ? t('timelinePanel.localSave') : entry.message}
            </span>
            <span className="timeline-meta">
              {formatDistanceToNow(entry.date, { addSuffix: true })}
              {entry.author && ` · ${entry.author}`}
              {entry.hash && ` · ${entry.hash.slice(0, 7)}`}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
