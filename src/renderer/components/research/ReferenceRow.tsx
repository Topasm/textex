import { ReferenceEvidence } from './ReferenceEvidence'
import { useEditorStore } from '../../store/useEditorStore'
import { documentRegistry } from '../../models/documentRegistry'
import { parseCitationUsages } from '../../services/citationUsageOverlay'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookPlus,
  Check,
  Circle,
  ExternalLink,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Search
} from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'
import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from '../ui/ContextMenu'
import type { CitationLocation, ZoteroItemDetail } from '../../../shared/types'
import type { ReferenceRow as ReferenceRowModel } from '../../services/referenceListModel'
import {
  getCachedZoteroItemDetail,
  loadZoteroItemDetail
} from '../../services/zoteroItemDetailCache'
import {
  buildProjectReferenceDragPayload,
  setReferenceDragData,
  type ReferenceDragPayload
} from './referenceActions'

export type ZoteroLinkState = 'checking' | 'ready' | 'unavailable' | 'error'

interface ReferenceRowProps {
  row: ReferenceRowModel
  projectRoot: string | null
  port: number
  expanded: boolean
  busy: boolean
  zoteroState: ZoteroLinkState
  onToggleExpanded: (id: string) => void
  onCite: (row: ReferenceRowModel) => void
  onAddToBibliography: (row: ReferenceRowModel) => void
  onAddAndCite: (row: ReferenceRowModel) => void
  onOpenInZotero: (row: ReferenceRowModel) => void
  onOpenLocation: (location: CitationLocation) => void
  onFindSource: (citekey: string) => void
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

function citationLocationLabel(file: string, projectRoot: string | null): string {
  if (projectRoot) {
    const root = projectRoot.replace(/[\\/]$/u, '')
    if (file === root) return file.split(/[\\/]/u).at(-1) ?? file
    if (file.startsWith(`${root}/`) || file.startsWith(`${root}\\`)) {
      return file.slice(root.length + 1).replace(/\\/gu, '/')
    }
  }
  return file.split(/[\\/]/u).at(-1) ?? file
}

function dragPayload(row: ReferenceRowModel, port: number): ReferenceDragPayload | null {
  if (!row.citekey) return null
  if (row.entry) return buildProjectReferenceDragPayload(row.entry)
  return {
    source: 'zotero',
    citekey: row.citekey,
    port,
    metadata: {
      title: row.title,
      authors: row.author
        .split(/\s+and\s+|;\s*/u)
        .map((author) => author.trim())
        .filter(Boolean),
      year: row.year,
      type: row.zoteroItem?.type ?? 'article'
    }
  }
}

/**
 * One row of the unified reference list.
 *
 * Clicking only selects: the row expands in place and the document is left
 * alone. Everything that writes — inserting a citation, adding to the
 * bibliography — is an explicit action in the expanded row or the context menu,
 * because the previous one-click "Add & cite" button edited both the `.bib`
 * file and the open document from a single stray click.
 */
export function ReferenceRow({
  row,
  projectRoot,
  port,
  expanded,
  busy,
  zoteroState,
  onToggleExpanded,
  onCite,
  onAddToBibliography,
  onAddAndCite,
  onOpenInZotero,
  onOpenLocation,
  onFindSource,
  onAddToChat
}: ReferenceRowProps) {
  const { t } = useTranslation()
  useEditorStore((state) => state.revision)
  useEditorStore((state) => state.openFiles)
  const articleRef = useRef<HTMLElement | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<ContextMenuAnchor | null>(null)
  const [detail, setDetail] = useState<ZoteroItemDetail | null>(() =>
    row.itemKey ? getCachedZoteroItemDetail(port, row.itemKey) : null
  )
  const [detailLoading, setDetailLoading] = useState(false)
  const payload = dragPayload(row, port)
  const inProject = row.entry !== null

  useEffect(() => {
    const itemKey = row.itemKey
    if (!expanded || !itemKey || detail?.itemKey === itemKey) return
    let cancelled = false
    setDetailLoading(true)
    void loadZoteroItemDetail(port, itemKey)
      .then((loaded) => {
        if (!cancelled) setDetail(loaded)
      })
      // A missing abstract is not worth an error banner; the row simply shows
      // the metadata it already has.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detail?.itemKey, expanded, port, row.itemKey])

  const openMenu = (x: number, y: number): void => setMenuAnchor({ x, y })

  const menuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'preview',
        label: expanded
          ? t('researchPanel.referenceRow.collapse')
          : t('researchPanel.referenceRow.preview'),
        icon: <Search size={ICON_SIZE.micro} />,
        run: () => onToggleExpanded(row.id)
      },
      {
        id: 'cite',
        label: t('researchPanel.referenceRow.insertCitation'),
        icon: <Plus size={ICON_SIZE.micro} />,
        disabled: !row.citekey || !inProject,
        run: () => onCite(row)
      },
      {
        id: 'add',
        label: t('researchPanel.referenceRow.addToBibliography'),
        icon: <BookPlus size={ICON_SIZE.micro} />,
        disabled: !row.citable || inProject || busy,
        run: () => onAddToBibliography(row)
      },
      {
        id: 'add-and-cite',
        label: t('researchPanel.referenceRow.addAndCite'),
        icon: <Plus size={ICON_SIZE.micro} />,
        disabled: !row.citable || inProject || busy,
        run: () => onAddAndCite(row)
      },
      {
        id: 'open-in-zotero',
        label: t('researchPanel.referenceRow.openInZotero'),
        icon: <ExternalLink size={ICON_SIZE.micro} />,
        disabled: !row.itemKey,
        run: () => onOpenInZotero(row)
      }
    ]
    if (row.broken) {
      items.push({
        id: 'find-source',
        label: t('researchPanel.zotero.findSource'),
        icon: <Search size={ICON_SIZE.micro} />,
        disabled: !row.citekey,
        run: () => {
          if (row.citekey) onFindSource(row.citekey)
        }
      })
    }
    if (onAddToChat && payload) {
      items.push({
        id: 'add-to-chat',
        label: t('researchPanel.referenceCard.addToChat'),
        icon: <MessageSquarePlus size={ICON_SIZE.micro} />,
        run: () => onAddToChat(payload)
      })
    }
    return items
  }

  const originLabel =
    row.origin === 'missing'
      ? t('researchPanel.referenceRow.originMissing')
      : row.origin === 'cited'
        ? t('researchPanel.referenceCard.cited', { count: row.citationCount })
        : row.origin === 'bibliography'
          ? t('researchPanel.zotero.inProjectUnused')
          : t('researchPanel.zotero.zoteroOnly')

  return (
    <article
      ref={articleRef}
      className={`reference-card reference-row${expanded ? ' expanded' : ''}${row.broken ? ' broken' : ''}`}
      tabIndex={0}
      aria-expanded={expanded}
      draggable={payload !== null && !expanded}
      onDragStart={(event) => payload && setReferenceDragData(event, payload)}
      onClick={(event) => {
        // Portal menu clicks bubble through React, but do not belong to the card surface.
        if (event.currentTarget.contains(event.target as Node)) onToggleExpanded(row.id)
      }}
      onDoubleClick={(event) => {
        if (event.currentTarget.contains(event.target as Node) && row.itemKey) onOpenInZotero(row)
      }}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('textarea, input, select')) return
        event.preventDefault()
        event.stopPropagation()
        openMenu(event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggleExpanded(row.id)
        } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          openMenu(rect.left + 16, rect.top + 16)
        }
      }}
    >
      <div className="reference-row-head">
        {row.citationCount > 0 ? (
          <Check
            className="zotero-project-state in-project"
            size={ICON_SIZE.compact}
            aria-hidden="true"
          />
        ) : (
          <Circle className="zotero-project-state" size={ICON_SIZE.micro} aria-hidden="true" />
        )}
        <strong>{row.title}</strong>
        <span className={`reference-row-origin ${row.origin}`}>{originLabel}</span>
      </div>
      <span className="reference-row-meta">
        {/* A broken row's title is already the citekey; repeating it says nothing. */}
        {row.broken
          ? t('researchPanel.referenceCard.cited', { count: row.citationCount })
          : row.citekey
            ? `@${row.citekey}`
            : t('researchPanel.zotero.citekeyUnavailable')}
        {row.author ? ` · ${row.author}` : ''}
        {row.year ? ` · ${row.year}` : ''}
      </span>

      {expanded && (
        <div
          className="reference-row-detail"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {row.broken ? (
            <p className="research-muted">{t('researchPanel.zotero.missingFromBibliography')}</p>
          ) : detailLoading ? (
            <p className="research-muted">{t('researchPanel.referenceRow.abstractLoading')}</p>
          ) : detail?.abstract ? (
            <ReferenceEvidence citekey={row.citekey} abstract={detail.abstract} url={detail.url} />
          ) : row.itemKey ? (
            <p className="research-muted">{t('researchPanel.referenceRow.abstractUnavailable')}</p>
          ) : null}

          {!detail?.abstract && (
            <ReferenceEvidence
              citekey={row.citekey}
              url={
                detail?.url ??
                (row.entry?.doi
                  ? `https://doi.org/${row.entry.doi}`
                  : row.entry?.arxivId
                    ? `https://arxiv.org/abs/${row.entry.arxivId}`
                    : null)
              }
            />
          )}
          {row.citationLocations.length > 0 && (
            <div
              className="reference-citation-locations"
              aria-label={t('researchPanel.referenceCard.citationLocations')}
            >
              <strong>{t('referenceEvidence.citedPassages')}</strong>
              {row.citationLocations.map((location, index) => (
                <div
                  className="reference-citation-location"
                  key={`${location.file}:${location.line}:${index}`}
                >
                  <button
                    className="workspace-button workspace-button-quiet"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenLocation(location)
                    }}
                  >
                    {citationLocationLabel(location.file, projectRoot)}:{location.line}
                  </button>
                  <CitationPassage
                    file={location.file}
                    line={location.line}
                    citekey={row.citekey}
                  />
                </div>
              ))}
            </div>
          )}

          {row.possibleDuplicates.length > 0 && (
            <div className="reference-duplicate-warning" role="status">
              {t('researchPanel.referenceCard.possibleDuplicate', {
                keys: row.possibleDuplicates.map(({ entry }) => `@${entry.key}`).join(', ')
              })}
            </div>
          )}

          <span className={row.zoteroItem ? 'reference-link-state linked' : 'reference-link-state'}>
            {zoteroState === 'checking'
              ? t('researchPanel.referenceCard.zoteroChecking')
              : zoteroState === 'unavailable'
                ? t('researchPanel.referenceCard.zoteroUnavailable')
                : zoteroState === 'error'
                  ? t('researchPanel.referenceCard.zoteroCheckFailed')
                  : row.zoteroItem
                    ? t('researchPanel.referenceCard.zoteroMatched', {
                        kind: t(`researchPanel.referenceCard.matchKind.${row.matchKind}`, {
                          defaultValue: row.matchKind ?? ''
                        })
                      })
                    : row.possibleMatch
                      ? t('researchPanel.referenceCard.zoteroPossibleMatch', {
                          title: row.possibleMatch.title
                        })
                      : t('researchPanel.referenceCard.zoteroNotLinked')}
          </span>

          <div className="reference-card-actions" onClick={(event) => event.stopPropagation()}>
            {row.broken ? (
              <button
                type="button"
                disabled={busy || !row.citekey}
                onClick={() => row.citekey && onFindSource(row.citekey)}
              >
                <Search size={ICON_SIZE.micro} /> {t('researchPanel.zotero.findSource')}
              </button>
            ) : inProject ? (
              <button type="button" disabled={!row.citekey} onClick={() => onCite(row)}>
                <Plus size={ICON_SIZE.micro} />{' '}
                <span>{t('researchPanel.referenceRow.insertCitation')}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!row.citable || busy}
                onClick={() => onAddAndCite(row)}
              >
                <Plus size={ICON_SIZE.micro} />{' '}
                <span>{t('researchPanel.referenceRow.addAndCite')}</span>
              </button>
            )}
            {onAddToChat && payload && (
              <button
                type="button"
                className="workspace-button-icon"
                title={t('researchPanel.referenceCard.addToChat')}
                onClick={() => onAddToChat(payload)}
                aria-label={t('researchPanel.referenceCard.addNamedToChat', { name: row.title })}
              >
                <MessageSquarePlus size={ICON_SIZE.compact} />
              </button>
            )}
            <button
              type="button"
              className="workspace-button-icon"
              aria-label={t('researchPanel.referenceRow.menuLabel', { name: row.title })}
              title={t('researchPanel.referenceRow.menuLabel', { name: row.title })}
              aria-haspopup="menu"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                openMenu(rect.right, rect.bottom)
              }}
            >
              <MoreHorizontal size={ICON_SIZE.compact} />
            </button>
          </div>
        </div>
      )}

      {menuAnchor && (
        <ContextMenu
          anchor={menuAnchor}
          items={menuItems()}
          label={t('researchPanel.referenceRow.menuLabel', { name: row.title })}
          onClose={(restoreFocus) => {
            setMenuAnchor(null)
            if (restoreFocus) articleRef.current?.focus()
          }}
        />
      )}
    </article>
  )
}

function CitationPassage({
  file,
  line,
  citekey
}: {
  file: string
  line: number
  citekey: string | null
}) {
  const text = documentRegistry.getModel(file)?.snapshot().text
  if (!text || !citekey) return null
  const locations = parseCitationUsages(text, file).find(
    (usage) => usage.citekey === citekey
  )?.locations
  if (!locations?.some((location) => location.line === line)) return null
  const excerpt = text
    .split('\n')
    .slice(Math.max(0, line - 2), line + 1)
    .join('\n')
    .slice(0, 1200)
  return <span className="reference-citation-passage">{excerpt}</span>
}
