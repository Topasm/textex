import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink, X } from 'lucide-react'
import type { CitationTooltipData } from '../hooks/preview/useCitationTooltip'
import { useZoteroCitationPreview } from '../hooks/preview/useZoteroCitationPreview'
import { errorMessage } from '../utils/errorMessage'
import { ICON_SIZE } from './ui/IconSystem'

interface CitationTooltipProps extends CitationTooltipData {
  onClose: () => void
}

function CitationTooltip({
  entries,
  anchorRect,
  containerRect,
  pinned,
  onClose
}: CitationTooltipProps) {
  const { t } = useTranslation()
  const zotero = useZoteroCitationPreview(entries, pinned)
  const elementRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: anchorRect.left, top: anchorRect.bottom + 8 })
  const [error, setError] = useState('')
  const leftEdge = Math.max(8, containerRect.left + 8)
  const rightEdge = Math.min(window.innerWidth - 8, containerRect.right - 8)
  const topEdge = Math.max(8, containerRect.top + 8)
  const bottomEdge = Math.min(window.innerHeight - 8, containerRect.bottom - 8)
  const width = Math.min(360, Math.max(0, rightEdge - leftEdge))
  const maxHeight = Math.max(0, bottomEdge - topEdge)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    const updatePosition = () => {
      const height = element.getBoundingClientRect().height
      const below = anchorRect.bottom + 8
      const top = below + height <= bottomEdge ? below : anchorRect.top - height - 8
      setPosition({
        left: Math.max(leftEdge, Math.min(anchorRect.left, rightEdge - width)),
        top: Math.max(topEdge, Math.min(top, bottomEdge - height))
      })
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    observer.observe(element)
    return () => observer.disconnect()
  }, [anchorRect, bottomEdge, leftEdge, rightEdge, topEdge, width])

  useLayoutEffect(() => {
    if (pinned) elementRef.current?.focus({ preventScroll: true })
    setError('')
  }, [pinned, entries])

  if (!entries.length) return null
  return createPortal(
    <div
      ref={elementRef}
      className={`citation-tooltip${pinned ? ' citation-tooltip-pinned' : ''}`}
      style={{ ...position, width, maxHeight }}
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={t('citationPreview.title')}
      tabIndex={pinned ? -1 : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      {pinned && (
        <div className="citation-tooltip-header">
          <span>{t('citationPreview.title')}</span>
          <button
            type="button"
            className="toolbar-btn toolbar-compact-btn"
            aria-label={t('citationPreview.close')}
            onClick={onClose}
          >
            <X size={ICON_SIZE.compact} />
          </button>
        </div>
      )}
      {entries.map((entry) => {
        const match = zotero.matches?.get(entry.key)
        const title = match?.item.title || entry.title
        const author = match?.item.author || entry.author
        const doi = (match?.item.doi || entry.doi)
          ?.trim()
          .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
        const sourceUrl = match?.detail?.url
        const url =
          doi && /^10\.\d{4,9}\/\S+$/u.test(doi)
            ? `https://doi.org/${encodeURIComponent(doi)}`
            : sourceUrl && /^https?:\/\//iu.test(sourceUrl)
              ? sourceUrl
              : null
        return (
          <div key={entry.key} className="citation-tooltip-entry">
            {match && (
              <div className="citation-tooltip-meta">{t('citationPreview.zoteroSource')}</div>
            )}
            <div className="citation-tooltip-title">{title || entry.key}</div>
            {author && <div className="citation-tooltip-authors">{author}</div>}
            <div className="citation-tooltip-meta">
              {[
                match?.item.year || entry.year,
                match?.detail?.publication || entry.journal,
                match?.item.type || entry.type
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {!title && !author && <p>{t('citationPreview.missingDetails')}</p>}
            {match?.detail?.abstract && (
              <details className="citation-tooltip-abstract" open>
                <summary>{t('citationPreview.abstract')}</summary>
                <p>{match.detail.abstract}</p>
              </details>
            )}
            <div className="citation-tooltip-actions">
              {pinned && match && (
                <button
                  type="button"
                  className="workspace-button citation-tooltip-source"
                  onClick={() => {
                    setError('')
                    void window.api
                      .zoteroOpenItem(match.item.itemKey, zotero.port)
                      .catch((reason) => setError(errorMessage(reason)))
                  }}
                >
                  <ExternalLink size={ICON_SIZE.compact} />
                  {t('researchPanel.referenceRow.openInZotero')}
                </button>
              )}
              {pinned && url && (
                <button
                  type="button"
                  className="workspace-button citation-tooltip-source"
                  onClick={() => {
                    setError('')
                    void window.api
                      .openExternal(url)
                      .catch((reason) => setError(errorMessage(reason)))
                  }}
                >
                  <ExternalLink size={ICON_SIZE.compact} />
                  {t('referenceEvidence.openSource')}
                </button>
              )}
            </div>
          </div>
        )
      })}
      {pinned && (
        <p className="citation-tooltip-meta" role="status">
          {!zotero.enabled
            ? t('citationPreview.zoteroDisabled')
            : zotero.loading
              ? t('researchPanel.zotero.loading')
              : zotero.unavailable
                ? t('citationPreview.zoteroUnavailable')
                : ''}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>,
    document.body
  )
}

export default CitationTooltip
