import { useCallback } from 'react'
import type { BibEntry } from '../../../shared/types'

interface BibEntryCardProps {
  entry: BibEntry
  onInsert: (citeText: string) => void
  /** If provided, shows a remove button */
  onRemove?: () => void
  /** If provided, shows an add button with this label */
  onAdd?: () => void
  addTitle?: string
}

export function BibEntryCard({ entry, onInsert, onRemove, onAdd, addTitle }: BibEntryCardProps) {
  const cleanTitle = (entry.title || '(no title)').replace(/[{}]/g, '')
  let authors = entry.author || 'Unknown Author'
  if (authors.length > 50) authors = authors.slice(0, 50) + '...'

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', `\\cite{${entry.key}}`)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [entry.key]
  )

  return (
    <div
      className="bib-entry"
      onClick={() => onInsert(`\\cite{${entry.key}}`)}
      title={`Insert \\cite{${entry.key}}`}
      draggable
      onDragStart={handleDragStart}
      style={{ cursor: 'grab' }}
    >
      <div className="bib-entry-header">
        <span className="bib-title">{cleanTitle}</span>
        {onRemove && (
          <button
            className="bib-entry-action-btn"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            title="Remove from group"
          >
            ×
          </button>
        )}
        {onAdd && (
          <button
            className="bib-entry-action-btn bib-entry-add-btn"
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            title={addTitle}
          >
            +
          </button>
        )}
      </div>
      <div className="bib-authors">{authors}</div>
      <div className="bib-meta-row">
        <span className="bib-key">@{entry.key}</span>
        {entry.year && <span className="bib-year">{entry.year}</span>}
      </div>
    </div>
  )
}
