import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronRight,
  CircleX,
  Info,
  LoaderCircle,
  MessageSquareText,
  SquareTerminal,
  TriangleAlert
} from 'lucide-react'
import { useCompileStore } from '../store/useCompileStore'
import type { Diagnostic, DiagnosticSeverity } from '../../shared/types'
import { navigateToDiagnostic } from '../services/diagnosticNavigation'
import { ICON_SIZE } from './ui/IconSystem'
import { buildDiagnosticRepairPrompt } from '../services/diagnosticRepair'

type SeverityFilter = 'error' | 'warning' | 'info'

interface LogPanelProps {
  onFixWithChat?: (prompt: string) => void
  onFixWithCli?: (prompt: string) => Promise<void>
  cliName?: string
}

function LogPanel({ onFixWithChat, onFixWithCli, cliName = 'Codex CLI' }: LogPanelProps) {
  const { t } = useTranslation()
  const logs = useCompileStore((s) => s.logs)
  const diagnostics = useCompileStore((s) => s.diagnostics)
  const logViewMode = useCompileStore((s) => s.logViewMode)
  const scrollRef = useRef<HTMLPreElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [activeFilters, setActiveFilters] = useState<Set<SeverityFilter>>(
    new Set(['error', 'warning', 'info'])
  )
  const [cliBusy, setCliBusy] = useState(false)

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

  const handleEntryClick = (diagnostic: Diagnostic): void => {
    void navigateToDiagnostic(diagnostic)
  }

  const severityIcon = (severity: DiagnosticSeverity): React.ReactNode => {
    switch (severity) {
      case 'error':
        return <CircleX size={ICON_SIZE.compact} />
      case 'warning':
        return <TriangleAlert size={ICON_SIZE.compact} />
      default:
        return <Info size={ICON_SIZE.compact} />
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
  const hasRepairContext =
    diagnostics.some((item) => item.severity !== 'info') || Boolean(logs.trim())
  const repairPrompt = useMemo(
    () => buildDiagnosticRepairPrompt(diagnostics, logs),
    [diagnostics, logs]
  )

  const fixWithCli = async (): Promise<void> => {
    if (!onFixWithCli || cliBusy || !hasRepairContext) return
    setCliBusy(true)
    try {
      await onFixWithCli(repairPrompt)
    } finally {
      setCliBusy(false)
    }
  }

  return (
    <section className="log-panel log-panel-embedded" aria-labelledby="log-panel-title">
      <div className="log-panel-header">
        <span id="log-panel-title">{t('logPanel.compilationLog')}</span>
        <div className="log-actions">
          <div className="log-view-tabs" role="tablist" aria-label={t('logPanel.compilationLog')}>
            <button
              type="button"
              id="log-view-tab-structured"
              role="tab"
              aria-controls="log-view-content"
              aria-selected={logViewMode === 'structured'}
              className={logViewMode === 'structured' ? 'log-tab-active' : ''}
              onClick={() => useCompileStore.getState().setLogViewMode('structured')}
            >
              {problemsLabel}
            </button>
            <button
              type="button"
              id="log-view-tab-raw"
              role="tab"
              aria-controls="log-view-content"
              aria-selected={logViewMode === 'raw'}
              className={logViewMode === 'raw' ? 'log-tab-active' : ''}
              onClick={() => useCompileStore.getState().setLogViewMode('raw')}
            >
              {t('logPanel.output')}
            </button>
          </div>
          {onFixWithChat && (
            <button
              type="button"
              className="log-repair-action"
              disabled={!hasRepairContext}
              onClick={() => onFixWithChat(repairPrompt)}
              title={t('logPanel.reviewInChat')}
              aria-label={t('logPanel.reviewInChat')}
            >
              <MessageSquareText size={ICON_SIZE.compact} />
            </button>
          )}
          {onFixWithCli && (
            <button
              type="button"
              className="log-repair-action"
              disabled={!hasRepairContext || cliBusy}
              onClick={() => void fixWithCli()}
              title={t('logPanel.fixWithCli', { cli: cliName })}
              aria-label={t('logPanel.fixWithCli', { cli: cliName })}
            >
              {cliBusy ? (
                <LoaderCircle className="spin" size={ICON_SIZE.compact} />
              ) : (
                <SquareTerminal size={ICON_SIZE.compact} />
              )}
            </button>
          )}
          <button type="button" onClick={() => useCompileStore.getState().clearLogs()}>
            {t('logPanel.clear')}
          </button>
        </div>
      </div>
      <div
        id="log-view-content"
        className="log-panel-body"
        role="tabpanel"
        aria-labelledby={`log-view-tab-${logViewMode}`}
      >
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
    </section>
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
  onEntryClick: (diagnostic: Diagnostic) => void
  severityIcon: (severity: DiagnosticSeverity) => React.ReactNode
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
          type="button"
          className={`log-filter-btn log-filter-error ${activeFilters.has('error') ? 'active' : ''}`}
          onClick={() => onToggleFilter('error')}
          title={t('logPanel.toggleErrors')}
          aria-label={t('logPanel.toggleErrors')}
          aria-pressed={activeFilters.has('error')}
        >
          <CircleX size={ICON_SIZE.compact} /> {errorCount}
        </button>
        <button
          type="button"
          className={`log-filter-btn log-filter-warning ${activeFilters.has('warning') ? 'active' : ''}`}
          onClick={() => onToggleFilter('warning')}
          title={t('logPanel.toggleWarnings')}
          aria-label={t('logPanel.toggleWarnings')}
          aria-pressed={activeFilters.has('warning')}
        >
          <TriangleAlert size={ICON_SIZE.compact} /> {warningCount}
        </button>
        <button
          type="button"
          className={`log-filter-btn log-filter-info ${activeFilters.has('info') ? 'active' : ''}`}
          onClick={() => onToggleFilter('info')}
          title={t('logPanel.toggleInfo')}
          aria-label={t('logPanel.toggleInfo')}
          aria-pressed={activeFilters.has('info')}
        >
          <Info size={ICON_SIZE.compact} /> {infoCount}
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="log-empty">{t('logPanel.noMatching')}</div>
      ) : (
        Array.from(grouped.entries()).map(([file, items], groupIndex) => {
          const isCollapsed = collapsedFiles.has(file)
          const fileErrors = items.filter((d) => d.severity === 'error').length
          const fileWarnings = items.filter((d) => d.severity === 'warning').length
          const fileName = file.replace(/\\/g, '/').split('/').pop() || file
          const groupId = `log-file-diagnostics-${groupIndex}`

          return (
            <div key={file} className="log-file-group">
              <button
                type="button"
                className="log-file-header"
                onClick={() => onToggleFile(file)}
                aria-controls={groupId}
                aria-expanded={!isCollapsed}
                aria-label={file}
                title={file}
              >
                <span className="log-file-chevron">
                  {isCollapsed ? (
                    <ChevronRight size={ICON_SIZE.micro} />
                  ) : (
                    <ChevronDown size={ICON_SIZE.micro} />
                  )}
                </span>
                <span className="log-file-name">{fileName}</span>
                <span className="log-file-counts">
                  {fileErrors > 0 && (
                    <span className="log-file-count-error">
                      <CircleX size={ICON_SIZE.micro} /> {fileErrors}
                    </span>
                  )}
                  {fileWarnings > 0 && (
                    <span className="log-file-count-warning">
                      <TriangleAlert size={ICON_SIZE.micro} /> {fileWarnings}
                    </span>
                  )}
                </span>
              </button>
              <div id={groupId} className="log-file-entries" hidden={isCollapsed}>
                {items.map((d, i) => (
                  <button
                    type="button"
                    key={`${d.line}:${d.column ?? 1}:${d.severity}:${d.message}:${i}`}
                    className={`log-entry log-entry-${d.severity}`}
                    onClick={() => onEntryClick(d)}
                    aria-label={`${d.severity}, ${file}, ${t('logPanel.ln')} ${d.line}${d.column ? `:${d.column}` : ''}, ${d.message}`}
                    title={file}
                  >
                    <span className="log-entry-icon">{severityIcon(d.severity)}</span>
                    <span className="log-entry-location">
                      {t('logPanel.ln')} {d.line}
                      {d.column ? `:${d.column}` : ''}
                    </span>
                    <span className="log-entry-message">{d.message}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
})

export default LogPanel
