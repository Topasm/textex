import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, X } from 'lucide-react'
import type { BibEntry } from '../../../shared/types'
import {
  buildProjectReferenceDragPayload,
  setReferenceDragData
} from '../research/referenceActions'
import { ICON_SIZE } from '../ui/IconSystem'

interface BibEntryCardProps {
  entry: BibEntry
  onInsert: (citeText: string) => void
  /** If provided, shows a remove button */
  onRemove?: () => void
  /** If provided, shows an add button with this label */
  onAdd?: () => void
  addTitle?: string
  onAddToChat?: (payload: ReturnType<typeof buildProjectReferenceDragPayload>) => void
}

export const BibEntryCard = React.memo(function BibEntryCard({
  entry,
  onInsert,
  onRemove,
  onAdd,
  addTitle,
  onAddToChat
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
      setReferenceDragData(e, buildProjectReferenceDragPayload(entry))
    },
    [entry]
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
        {onAddToChat && (
          <button
            type="button"
            className="bib-entry-action-btn"
            onClick={(event) => {
              event.stopPropagation()
              onAddToChat(buildProjectReferenceDragPayload(entry))
            }}
            title={t('researchPanel.referenceCard.addToChat')}
            aria-label={t('researchPanel.referenceCard.addNamedToChat', { name: cleanTitle })}
          >
            <MessageSquarePlus size={ICON_SIZE.micro} />
          </button>
        )}
        {onRemove && (
          <button
            className="bib-entry-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title={t('bibPanel.removeFromGroup')}
            aria-label={t('bibPanel.removeFromGroup')}
          >
            <X size={ICON_SIZE.micro} />
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
