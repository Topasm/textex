import { useState } from 'react'
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
  const [locationsExpanded, setLocationsExpanded] = useState(false)
  const payload = buildProjectReferenceDragPayload(status.entry)
  return (
    <article
      className="reference-card reference-health-card"
      draggable
      onDragStart={(event) => setReferenceDragData(event, payload)}
    >
      <div>
        {status.citationCount > 0 ? (
          <Check className="zotero-project-state in-project" size={14} aria-hidden="true" />
        ) : (
          <Circle className="zotero-project-state" size={12} aria-hidden="true" />
        )}
        <strong>{status.entry.title || status.entry.key}</strong>
        <span>@{status.entry.key}</span>
      </div>
      <span>
        {status.entry.author || 'Unknown author'}
        {status.entry.year ? ` · ${status.entry.year}` : ''}
        {status.citationCount === 0 ? ' · UNUSED' : ''}
      </span>
      {status.citationCount > 0 &&
        (status.citationLocations.length > 0 ? (
          <button
            type="button"
            className="reference-citation-count"
            aria-expanded={locationsExpanded}
            onClick={() => setLocationsExpanded((current) => !current)}
          >
            CITED ×{status.citationCount}
          </button>
        ) : (
          <span>CITED ×{status.citationCount}</span>
        ))}
      {locationsExpanded && status.citationLocations.length > 0 && (
        <div className="reference-citation-locations" aria-label="Citation locations">
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
              Showing the first {status.citationLocations.length} of {status.citationCount}
            </small>
          )}
        </div>
      )}
      {status.possibleDuplicates.length > 0 && (
        <div className="reference-duplicate-warning" role="status">
          ⚠ Possible duplicate:{' '}
          {status.possibleDuplicates.map(({ entry }) => `@${entry.key}`).join(', ')}
          <small>
            Matched by {status.possibleDuplicates.map(({ matchKind }) => matchKind).join(', ')}; no
            entries were merged.
          </small>
        </div>
      )}
      <span className={status.zoteroItem ? 'reference-link-state linked' : 'reference-link-state'}>
        {zoteroState === 'checking'
          ? 'Cross-checking Zotero…'
          : zoteroState === 'unavailable'
            ? 'Zotero unavailable'
            : zoteroState === 'error'
              ? 'Zotero cross-check unavailable'
              : status.zoteroItem
                ? `✓ Zotero · matched by ${status.matchKind}`
                : status.possibleMatch
                  ? `Possible Zotero match: ${status.possibleMatch.title}`
                  : '○ Not linked to Zotero'}
      </span>
      <div className="reference-card-actions">
        {onAddToChat && (
          <button
            type="button"
            onClick={() => onAddToChat(payload)}
            aria-label={`Add ${status.entry.title || status.entry.key} to Chat`}
          >
            <MessageSquarePlus size={13} /> Add to Chat
          </button>
        )}
        <button type="button" onClick={() => onCite(status.entry.key)}>
          <Plus size={13} /> Cite
        </button>
      </div>
    </article>
  )
}
