import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { logError } from '../utils/errorMessage'
import type { GitLogEntry, HistoryItem } from '../../shared/types'

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

  const refresh = useCallback(async () => {
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
      setEntries(mergeTimeline(commits, snapshots))
    } catch (err) {
      logError('TimelinePanel:refresh', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [activeFilePath, projectRoot, isGitRepo])

  // Refresh when active file changes
  useEffect(() => {
    refresh()
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
    if (entry.type === 'local' && entry.snapshotPath) {
      try {
        await window.api.loadHistorySnapshot(entry.snapshotPath)
      } catch (err) {
        logError('TimelinePanel:loadSnapshot', err)
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.5 7.75a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm1.43.75a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.001 4.001 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5h-3.32z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-3.25A.75.75 0 0 1 7.25 8V4.75A.75.75 0 0 1 8 4z" />
              </svg>
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
