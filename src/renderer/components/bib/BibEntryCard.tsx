import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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

export const BibEntryCard = React.memo(function BibEntryCard({
  entry,
  onInsert,
  onRemove,
  onAdd,
  addTitle
}: BibEntryCardProps) {
  const { t } = useTranslation()
  const cleanTitle = (entry.title || t('bibPanel.noTitle')).replace(/[{}]/g, '')
  let authors = entry.author || t('bibPanel.unknownAuthor')
  const authorList = authors.split(/\s+and\s+/)
  if (authorList.length > 1) {
    authors = authorList[0].trim() + ' et al.'
  }

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
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onInsert(`\\cite{${entry.key}}`)
        }
      }}
    >
      <div className="bib-entry-header">
        <span className="bib-title">{cleanTitle}</span>
        {onRemove && (
          <button
            className="bib-entry-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title={t('bibPanel.removeFromGroup')}
          >
            ×
          </button>
        )}
        {onAdd && (
          <button
            className="bib-entry-action-btn bib-entry-add-btn"
            onClick={(e) => {
              e.stopPropagation()
              onAdd()
            }}
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
})
