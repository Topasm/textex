import { useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { BibEntry } from '../types/api'

type BibGroupMode = 'flat' | 'author' | 'year' | 'type'

interface GroupedBib {
  label: string
  entries: BibEntry[]
}

function extractGroupKey(entry: BibEntry, mode: BibGroupMode): string {
  switch (mode) {
    case 'author': {
      const author = entry.author?.split(/\band\b/i)[0]?.trim() ?? 'Unknown'
      // Handle "Last, First" format — take the surname
      return author.split(',')[0]?.trim() || author
    }
    case 'year':
      return entry.year || 'Unknown'
    case 'type':
      return entry.type || 'misc'
    default:
      return ''
  }
}

function groupEntries(entries: BibEntry[], mode: BibGroupMode): GroupedBib[] {
  if (mode === 'flat') {
    return [{ label: '', entries }]
  }

  const buckets: Record<string, BibEntry[]> = {}
  for (const entry of entries) {
    const key = extractGroupKey(entry, mode)
    ;(buckets[key] ??= []).push(entry)
  }

  return Object.entries(buckets)
    .map(([label, entries]) => ({ label, entries }))
    .sort((a, b) => b.entries.length - a.entries.length)
}

function BibPanel() {
  const bibEntries = useAppStore((s) => s.bibEntries)
  const bibGroupMode = useAppStore((s) => s.settings.bibGroupMode)
  const updateSetting = useAppStore((s) => s.updateSetting)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const handleInsert = useCallback((citeText: string) => {
    const state = useAppStore.getState()
    const { content, cursorLine, cursorColumn } = state
    const lines = content.split('\n')
    const lineIdx = cursorLine - 1
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx]
      const col = cursorColumn - 1
      lines[lineIdx] = line.slice(0, col) + citeText + line.slice(col)
      state.setContent(lines.join('\n'))
    }
  }, [])

  const filtered = useMemo(
    () =>
      bibEntries.filter((e) => {
        if (!filter) return true
        const q = filter.toLowerCase()
        return (
          e.key.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          e.author.toLowerCase().includes(q)
        )
      }),
    [bibEntries, filter]
  )

  const groups = useMemo(() => groupEntries(filtered, bibGroupMode), [filtered, bibGroupMode])

  const toggle = useCallback(
    (label: string) => setCollapsed((prev) => ({ ...prev, [label]: !prev[label] })),
    []
  )

  if (bibEntries.length === 0) {
    return (
      <div className="bib-panel">
        <div className="git-empty">No bibliography entries found. Open a project with .bib files.</div>
      </div>
    )
  }

  return (
    <div className="bib-panel">
      <div className="bib-panel-header">
        <input
          type="text"
          placeholder="Filter citations..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          value={bibGroupMode}
          onChange={(e) => updateSetting('bibGroupMode', e.target.value as BibGroupMode)}
          title="Group citations by"
        >
          <option value="flat">Flat</option>
          <option value="author">By Author</option>
          <option value="year">By Year</option>
          <option value="type">By Type</option>
        </select>
      </div>

      <div className="bib-list">
        {groups.map((group) => (
          <div key={group.label || '__flat__'} className="bib-group">
            {bibGroupMode !== 'flat' && (
              <div
                className="bib-group-header"
                onClick={() => toggle(group.label)}
                draggable
                onDragStart={(e) => {
                  const keys = group.entries.map((entry) => entry.key).join(',')
                  e.dataTransfer.setData('text/plain', `\\cite{${keys}}`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                title={`Drag to insert \\cite{} for all ${group.entries.length} entries`}
              >
                <span className="bib-group-chevron">
                  {collapsed[group.label] ? '\u25B8' : '\u25BE'}
                </span>
                <span className="bib-group-label">{group.label}</span>
                <span className="bib-group-count">({group.entries.length})</span>
              </div>
            )}

            {!collapsed[group.label] &&
              group.entries.map((entry) => {
                const cleanTitle = (entry.title || '(no title)').replace(/[{}]/g, '')
                let authors = entry.author || 'Unknown Author'
                if (authors.length > 50) {
                  authors = authors.slice(0, 50) + '...'
                }

                return (
                  <div
                    key={entry.key}
                    className="bib-entry"
                    onClick={() => handleInsert(`\\cite{${entry.key}}`)}
                    title={`Insert \\cite{${entry.key}}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `\\cite{${entry.key}}`)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    <div className="bib-entry-header">
                      <span className="bib-title">{cleanTitle}</span>
                    </div>
                    <div className="bib-authors">{authors}</div>
                    <div className="bib-meta-row">
                      <span className="bib-key">@{entry.key}</span>
                      {entry.year && <span className="bib-year">{entry.year}</span>}
                    </div>
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default BibPanel
