import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'

type SeverityFilter = 'error' | 'warning' | 'info'

function LogPanel() {
  const { t } = useTranslation()
  const isLogPanelOpen = useCompileStore((s) => s.isLogPanelOpen)
  const logs = useCompileStore((s) => s.logs)
  const diagnostics = useCompileStore((s) => s.diagnostics)
  const logViewMode = useCompileStore((s) => s.logViewMode)
  const scrollRef = useRef<HTMLPreElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [activeFilters, setActiveFilters] = useState<Set<SeverityFilter>>(
    new Set(['error', 'warning', 'info'])
  )

  // Counts (must be before early return to satisfy Rules of Hooks)
  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'error').length,
    [diagnostics]
  )
  const warningCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'warning').length,
    [diagnostics]
  )
  const infoCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'info').length,
    [diagnostics]
  )

  useEffect(() => {
    if (logViewMode === 'raw' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, logViewMode])

  if (!isLogPanelOpen) return null

  const handleEntryClick = (line: number, column?: number): void => {
    useEditorStore.getState().requestJumpToLine(line, column ?? 1)
  }

  const severityIcon = (severity: DiagnosticSeverity): string => {
    switch (severity) {
      case 'error':
        return '\u2716'
      case 'warning':
        return '\u26A0'
      default:
        return '\u2139'
    }
  }

  const toggleFile = (file: string): void => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }
      return next
    })
  }

  const toggleFilter = (severity: SeverityFilter): void => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(severity)) {
        // Don't allow disabling all filters
        if (next.size > 1) next.delete(severity)
      } else {
        next.add(severity)
      }
      return next
    })
  }

  // Problems tab label
  const totalCount = diagnostics.length
  const problemsLabel =
    totalCount === 0 ? t('logPanel.problems') : t('logPanel.problemsCount', { count: totalCount })

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <span>{t('logPanel.compilationLog')}</span>
        <div className="log-actions">
          <button
            className={logViewMode === 'structured' ? 'log-tab-active' : ''}
            onClick={() => useCompileStore.getState().setLogViewMode('structured')}
          >
            {problemsLabel}
          </button>
          <button
            className={logViewMode === 'raw' ? 'log-tab-active' : ''}
            onClick={() => useCompileStore.getState().setLogViewMode('raw')}
          >
            {t('logPanel.output')}
          </button>
          <button onClick={() => useCompileStore.getState().clearLogs()}>
            {t('logPanel.clear')}
          </button>
          <button onClick={() => useCompileStore.getState().toggleLogPanel()}>
            {t('logPanel.close')}
          </button>
        </div>
      </div>
      {logViewMode === 'raw' ? (
        <pre ref={scrollRef}>{logs || t('logPanel.noOutput')}</pre>
      ) : (
        <StructuredProblems
          diagnostics={diagnostics}
          activeFilters={activeFilters}
          collapsedFiles={collapsedFiles}
          errorCount={errorCount}
          warningCount={warningCount}
          infoCount={infoCount}
          onToggleFilter={toggleFilter}
          onToggleFile={toggleFile}
          onEntryClick={handleEntryClick}
          severityIcon={severityIcon}
          listRef={listRef}
        />
      )}
    </div>
  )
}

interface StructuredProblemsProps {
  diagnostics: Diagnostic[]
  activeFilters: Set<SeverityFilter>
  collapsedFiles: Set<string>
  errorCount: number
  warningCount: number
  infoCount: number
  onToggleFilter: (severity: SeverityFilter) => void
  onToggleFile: (file: string) => void
  onEntryClick: (line: number, column?: number) => void
  severityIcon: (severity: DiagnosticSeverity) => string
  listRef: React.RefObject<HTMLDivElement | null>
}

const StructuredProblems = React.memo(function StructuredProblems({
  diagnostics,
  activeFilters,
  collapsedFiles,
  errorCount,
  warningCount,
  infoCount,
  onToggleFilter,
  onToggleFile,
  onEntryClick,
  severityIcon,
  listRef
}: StructuredProblemsProps) {
  const { t } = useTranslation()

  // Filter diagnostics by active severity filters
  const filtered = useMemo(
    () => diagnostics.filter((d) => activeFilters.has(d.severity as SeverityFilter)),
    [diagnostics, activeFilters]
  )

  // Group by file
  const grouped = useMemo(() => {
    const map = new Map<string, Diagnostic[]>()
    for (const d of filtered) {
      const key = d.file || '(unknown)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    return map
  }, [filtered])

  if (diagnostics.length === 0) {
    return (
      <div ref={listRef} className="log-structured">
        <div className="log-empty">{t('logPanel.noProblems')}</div>
      </div>
    )
  }

  return (
    <div ref={listRef} className="log-structured">
      <div className="log-filters">
        <button
          className={`log-filter-btn log-filter-error ${activeFilters.has('error') ? 'active' : ''}`}
          onClick={() => onToggleFilter('error')}
          title={t('logPanel.toggleErrors')}
        >
          {'\u2716'} {errorCount}
        </button>
        <button
          className={`log-filter-btn log-filter-warning ${activeFilters.has('warning') ? 'active' : ''}`}
          onClick={() => onToggleFilter('warning')}
          title={t('logPanel.toggleWarnings')}
        >
          {'\u26A0'} {warningCount}
        </button>
        <button
          className={`log-filter-btn log-filter-info ${activeFilters.has('info') ? 'active' : ''}`}
          onClick={() => onToggleFilter('info')}
          title={t('logPanel.toggleInfo')}
        >
          {'\u2139'} {infoCount}
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="log-empty">{t('logPanel.noMatching')}</div>
      ) : (
        Array.from(grouped.entries()).map(([file, items]) => {
          const isCollapsed = collapsedFiles.has(file)
          const fileErrors = items.filter((d) => d.severity === 'error').length
          const fileWarnings = items.filter((d) => d.severity === 'warning').length
          const fileName = file.includes('/') ? file.split('/').pop() : file

          return (
            <div key={file} className="log-file-group">
              <div className="log-file-header" onClick={() => onToggleFile(file)}>
                <span className="log-file-chevron">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                <span className="log-file-name">{fileName}</span>
                <span className="log-file-counts">
                  {fileErrors > 0 && (
                    <span className="log-file-count-error">
                      {'\u2716'} {fileErrors}
                    </span>
                  )}
                  {fileWarnings > 0 && (
                    <span className="log-file-count-warning">
                      {'\u26A0'} {fileWarnings}
                    </span>
                  )}
                </span>
              </div>
              {!isCollapsed &&
                items.map((d, i) => (
                  <div
                    key={i}
                    className={`log-entry log-entry-${d.severity}`}
                    onClick={() => onEntryClick(d.line, d.column)}
                  >
                    <span className="log-entry-icon">{severityIcon(d.severity)}</span>
                    <span className="log-entry-location">
                      {t('logPanel.ln')} {d.line}
                    </span>
                    <span className="log-entry-message">{d.message}</span>
                  </div>
                ))}
            </div>
          )
        })
      )}
    </div>
  )
})

export default LogPanel
