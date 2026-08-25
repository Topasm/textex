import { useEffect, useState } from 'react'
import { ArrowLeft, BookMarked, Globe2 } from 'lucide-react'
import BibPanel from '../BibPanel'
import { useProjectStore } from '../../store/useProjectStore'
import { ICON_SIZE } from '../ui/IconSystem'
import { OnlineReferences } from './OnlineReferences'
import type { ReferenceDragPayload } from './referenceActions'
import { ZoteroReferences } from './ZoteroReferences'

interface ReferencesPanelProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

export function ReferencesPanel({ onAddToChat }: ReferencesPanelProps = {}) {
  const requestedSource = useProjectStore((state) => state.researchReferenceSource)
  const [secondaryView, setSecondaryView] = useState<'local' | 'groups' | 'online'>(
    requestedSource === 'online' ? 'online' : 'local'
  )

  useEffect(() => {
    setSecondaryView(requestedSource === 'online' ? 'online' : 'local')
  }, [requestedSource])

  if (secondaryView !== 'local') {
    const online = secondaryView === 'online'
    return (
      <div className="references-panel reference-online-mode">
        <div className="reference-manager-secondary-header">
          <button
            type="button"
            onClick={() => {
              setSecondaryView('local')
              useProjectStore.getState().setResearchReferenceSource('project')
            }}
          >
            <ArrowLeft size={ICON_SIZE.compact} aria-hidden="true" />
            Back to local references
          </button>
          <span>
            {online ? (
              <Globe2 size={ICON_SIZE.compact} aria-hidden="true" />
            ) : (
              <BookMarked size={ICON_SIZE.compact} aria-hidden="true" />
            )}
            {online ? 'Crossref / arXiv' : 'Project citation groups'}
          </span>
        </div>
        {online ? (
          <OnlineReferences onAddToChat={onAddToChat} />
        ) : (
          <BibPanel onAddToChat={onAddToChat} />
        )}
      </div>
    )
  }

  return (
    <div className="references-panel">
      <ZoteroReferences
        onAddToChat={onAddToChat}
        onOpenProjectGroups={() => setSecondaryView('groups')}
        onSearchOnline={() => {
          setSecondaryView('online')
          useProjectStore.getState().setResearchReferenceSource('online')
        }}
      />
    </div>
  )
}
