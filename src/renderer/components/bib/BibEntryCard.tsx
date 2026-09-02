import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, Plus, X } from 'lucide-react'
import type { BibEntry } from '../../../shared/types'
import {
  buildProjectReferenceDragPayload,
  setReferenceDragData
} from '../research/referenceActions'
import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from '../ui/ContextMenu'
import { ICON_SIZE } from '../ui/IconSystem'

interface BibEntryCardProps {
  entry: BibEntry
  onInsert: (citeText: string) => void
  /** If provided, shows a remove button */
  onRemove?: () => void
  /** Groups this entry can be filed into, offered from the context menu. */
  groups?: Array<{ id: string; name: string }>
  onAddToGroup?: (groupId: string) => void
  onAddToChat?: (payload: ReturnType<typeof buildProjectReferenceDragPayload>) => void
}

/**
 * A grouped project reference.
 *
 * The card body used to insert `\cite{}` on a plain click, which put a citation
 * in the document every time someone clicked to read an entry. Citing is an
 * explicit action here, exactly as it is in the References list: the button in
 * the card, the context menu, or a drag into the editor.
 */
export const BibEntryCard = React.memo(function BibEntryCard({
  entry,
  onInsert,
  onRemove,
  groups,
  onAddToGroup,
  onAddToChat
}: BibEntryCardProps) {
  const { t } = useTranslation()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<ContextMenuAnchor | null>(null)
  const cleanTitle = (entry.title || t('bibPanel.noTitle')).replace(/[{}]/g, '')
  let authors = entry.author || t('bibPanel.unknownAuthor')
  const authorList = authors.split(/\s+and\s+/)
  if (authorList.length > 1) {
    authors = authorList[0].trim() + ' et al.'
  }

  const insert = useCallback(() => onInsert(`\\cite{${entry.key}}`), [entry.key, onInsert])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setReferenceDragData(e, buildProjectReferenceDragPayload(entry))
    },
    [entry]
  )

  const menuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'cite',
        label: t('researchPanel.referenceRow.insertCitation'),
        icon: <Plus size={ICON_SIZE.micro} />,
        run: insert
      }
    ]
    if (onAddToChat) {
      items.push({
        id: 'add-to-chat',
        label: t('researchPanel.referenceCard.addToChat'),
        icon: <MessageSquarePlus size={ICON_SIZE.micro} />,
        run: () => onAddToChat(buildProjectReferenceDragPayload(entry))
      })
    }
    if (onAddToGroup) {
      for (const group of groups ?? []) {
        items.push({
          id: `add-to-group:${group.id}`,
          label: t('bibPanel.addToNamedGroup', { name: group.name }),
          icon: <Plus size={ICON_SIZE.micro} />,
          run: () => onAddToGroup(group.id)
        })
      }
    }
    if (onRemove) {
      items.push({
        id: 'remove-from-group',
        label: t('bibPanel.removeFromGroup'),
        icon: <X size={ICON_SIZE.micro} />,
        run: onRemove
      })
    }
    return items
  }

  return (
    <div
      ref={cardRef}
      className="bib-entry"
      draggable
      onDragStart={handleDragStart}
      tabIndex={0}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMenuAnchor({ x: event.clientX, y: event.clientY })
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        setMenuAnchor({ x: rect.left + 16, y: rect.top + 16 })
      }}
    >
      <div className="bib-entry-header">
        <span className="bib-title">{cleanTitle}</span>
        <button
          type="button"
          className="bib-entry-action-btn"
          onClick={insert}
          title={t('researchPanel.referenceRow.insertCitation')}
          aria-label={t('bibPanel.insertNamedCitation', { name: cleanTitle })}
        >
          <Plus size={ICON_SIZE.micro} />
        </button>
        {onAddToChat && (
          <button
            type="button"
            className="bib-entry-action-btn"
            onClick={() => onAddToChat(buildProjectReferenceDragPayload(entry))}
            title={t('researchPanel.referenceCard.addToChat')}
            aria-label={t('researchPanel.referenceCard.addNamedToChat', { name: cleanTitle })}
          >
            <MessageSquarePlus size={ICON_SIZE.micro} />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="bib-entry-action-btn"
            onClick={onRemove}
            title={t('bibPanel.removeFromGroup')}
            aria-label={t('bibPanel.removeFromGroup')}
          >
            <X size={ICON_SIZE.micro} />
          </button>
        )}
      </div>
      <div className="bib-authors">{authors}</div>
      <div className="bib-meta-row">
        <span className="bib-key">@{entry.key}</span>
        {entry.year && <span className="bib-year">{entry.year}</span>}
      </div>
      {menuAnchor && (
        <ContextMenu
          anchor={menuAnchor}
          items={menuItems()}
          label={t('researchPanel.referenceRow.menuLabel', { name: cleanTitle })}
          onClose={(restoreFocus) => {
            setMenuAnchor(null)
            if (restoreFocus) cardRef.current?.focus()
          }}
        />
      )}
    </div>
  )
})
