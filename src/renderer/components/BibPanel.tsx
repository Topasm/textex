import { useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

function BibPanel(): JSX.Element {
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
      {filtered.map((entry) => (
        <div key={entry.key} className="bib-entry" onClick={() => handleInsert(entry.key)}>
          <span className="bib-key">{entry.key}</span>
          <div className="bib-details">
            <div className="bib-title">{entry.title || '(no title)'}</div>
            <div className="bib-meta">
              {entry.author}{entry.year ? `, ${entry.year}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default BibPanel
