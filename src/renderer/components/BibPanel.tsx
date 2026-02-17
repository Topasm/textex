import { useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

function BibPanel() {
  const bibEntries = useAppStore((s) => s.bibEntries)
  const [filter, setFilter] = useState('')

  const handleInsert = useCallback((key: string) => {
    // Insert \cite{key} by updating content at cursor
    const state = useAppStore.getState()
    const { content, cursorLine, cursorColumn } = state
    const lines = content.split('\n')
    const lineIdx = cursorLine - 1
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx]
      const col = cursorColumn - 1
      const citeText = `\\cite{${key}}`
      lines[lineIdx] = line.slice(0, col) + citeText + line.slice(col)
      state.setContent(lines.join('\n'))
    }
  }, [])

  const filtered = bibEntries.filter((e) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      e.key.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q) ||
      e.author.toLowerCase().includes(q)
    )
  })

  if (bibEntries.length === 0) {
    return (
      <div className="bib-panel">
        <div className="git-empty">No bibliography entries found. Open a project with .bib files.</div>
      </div>
    )
  }

  return (
    <div className="bib-panel">
      <div className="bib-search">
        <input
          type="text"
          placeholder="Filter citations..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="bib-list">
        {filtered.map((entry) => {
          const cleanTitle = (entry.title || '(no title)').replace(/[{}]/g, '')
          // Truncate authors if too long
          let authors = entry.author || 'Unknown Author'
          if (authors.length > 50) {
            authors = authors.slice(0, 50) + '...'
          }

          return (
            <div
              key={entry.key}
              className="bib-entry"
              onClick={() => handleInsert(entry.key)}
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
    </div>
  )
}

export default BibPanel
