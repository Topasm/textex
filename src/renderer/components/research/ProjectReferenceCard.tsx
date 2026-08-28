import { useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useTranslation } from 'react-i18next'
import { Check, Circle, MessageSquarePlus, Plus } from 'lucide-react'
import type { CitationLocation } from '../../../shared/types'
import type { ProjectReferenceHealth } from '../../services/referenceHealth'
import {
  buildProjectReferenceDragPayload,
  setReferenceDragData,
  type ReferenceDragPayload
} from './referenceActions'

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

interface ProjectReferenceCardProps {
  status: ProjectReferenceHealth
  projectRoot: string | null
  zoteroState: 'checking' | 'ready' | 'unavailable' | 'error'
  onCite: (citekey: string) => void
  onOpenLocation: (location: CitationLocation) => void
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

export function ProjectReferenceCard({
  status,
  projectRoot,
  zoteroState,
  onCite,
  onOpenLocation,
  onAddToChat
}: ProjectReferenceCardProps) {
  const { t } = useTranslation()
  const [locationsExpanded, setLocationsExpanded] = useState(false)
  const matchKindLabel = (kind: string): string =>
    t(`researchPanel.referenceCard.matchKind.${kind}`, { defaultValue: kind })
  const payload = buildProjectReferenceDragPayload(status.entry)
  return (
    <article
      className="reference-card reference-health-card"
      tabIndex={0}
      draggable
      onDragStart={(event) => setReferenceDragData(event, payload)}
    >
      <div>
        {status.citationCount > 0 ? (
          <Check
            className="zotero-project-state in-project"
            size={ICON_SIZE.compact}
            aria-hidden="true"
          />
        ) : (
          <Circle className="zotero-project-state" size={ICON_SIZE.micro} aria-hidden="true" />
        )}
        <strong>{status.entry.title || status.entry.key}</strong>
        <span>@{status.entry.key}</span>
      </div>
      <span>
        {status.entry.author || t('researchPanel.referenceCard.unknownAuthor')}
        {status.entry.year ? ` · ${status.entry.year}` : ''}
        {status.citationCount === 0 ? ` · ${t('researchPanel.referenceCard.unused')}` : ''}
      </span>
      {status.citationCount > 0 &&
        (status.citationLocations.length > 0 ? (
          <button
            type="button"
            className="reference-citation-count"
            aria-expanded={locationsExpanded}
            onClick={() => setLocationsExpanded((current) => !current)}
          >
            {t('researchPanel.referenceCard.cited', { count: status.citationCount })}
          </button>
        ) : (
          <span>{t('researchPanel.referenceCard.cited', { count: status.citationCount })}</span>
        ))}
      {locationsExpanded && status.citationLocations.length > 0 && (
        <div
          className="reference-citation-locations"
          aria-label={t('researchPanel.referenceCard.citationLocations')}
        >
          {status.citationLocations.map((location, index) => (
            <button
              type="button"
              key={`${location.file}:${location.line}:${index}`}
              onClick={() => onOpenLocation(location)}
            >
              {citationLocationLabel(location.file, projectRoot)}:{location.line}
            </button>
          ))}
          {status.citationLocations.length < status.citationCount && (
            <small>
              {t('researchPanel.referenceCard.showingFirst', {
                shown: status.citationLocations.length,
                total: status.citationCount
              })}
            </small>
          )}
        </div>
      )}
      {status.possibleDuplicates.length > 0 && (
        <div className="reference-duplicate-warning" role="status">
          {t('researchPanel.referenceCard.possibleDuplicate', {
            keys: status.possibleDuplicates.map(({ entry }) => `@${entry.key}`).join(', ')
          })}
          <small>
            {t('researchPanel.referenceCard.duplicateMatchedBy', {
              kinds: status.possibleDuplicates
                .map(({ matchKind }) => matchKindLabel(matchKind))
                .join(', ')
            })}
          </small>
        </div>
      )}
      <span className={status.zoteroItem ? 'reference-link-state linked' : 'reference-link-state'}>
        {zoteroState === 'checking'
          ? t('researchPanel.referenceCard.zoteroChecking')
          : zoteroState === 'unavailable'
            ? t('researchPanel.referenceCard.zoteroUnavailable')
            : zoteroState === 'error'
              ? t('researchPanel.referenceCard.zoteroCheckFailed')
              : status.zoteroItem
                ? t('researchPanel.referenceCard.zoteroMatched', {
                    kind: matchKindLabel(status.matchKind ?? '')
                  })
                : status.possibleMatch
                  ? t('researchPanel.referenceCard.zoteroPossibleMatch', {
                      title: status.possibleMatch.title
                    })
                  : t('researchPanel.referenceCard.zoteroNotLinked')}
      </span>
      <div className="reference-card-actions">
        {onAddToChat && (
          <button
            type="button"
            onClick={() => onAddToChat(payload)}
            aria-label={t('researchPanel.referenceCard.addNamedToChat', {
              name: status.entry.title || status.entry.key
            })}
          >
            <MessageSquarePlus size={ICON_SIZE.micro} />{' '}
            {t('researchPanel.referenceCard.addToChat')}
          </button>
        )}
        <button type="button" onClick={() => onCite(status.entry.key)}>
          <Plus size={ICON_SIZE.micro} /> {t('researchPanel.referenceCard.cite')}
        </button>
      </div>
    </article>
  )
}
