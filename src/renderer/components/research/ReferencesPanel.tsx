import { useEffect, useState } from 'react'
import { ArrowLeft, BookMarked, FileCheck2, Globe2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BibPanel from '../BibPanel'
import { useProjectStore } from '../../store/useProjectStore'
import { ICON_SIZE } from '../ui/IconSystem'
import { OnlineReferences } from './OnlineReferences'
import type { ReferenceDragPayload } from './referenceActions'
import { ZoteroReferences } from './ZoteroReferences'
import { SubmissionCheckPanel } from './SubmissionCheckPanel'

interface ReferencesPanelProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
  onOpenProblems?: () => void
}

export function ReferencesPanel({ onAddToChat, onOpenProblems }: ReferencesPanelProps = {}) {
  const { t } = useTranslation()
  const requestedSource = useProjectStore((state) => state.researchReferenceSource)
  const [secondaryView, setSecondaryView] = useState<'local' | 'groups' | 'online' | 'submission'>(
    requestedSource === 'online' || requestedSource === 'submission' ? requestedSource : 'local'
  )

  useEffect(() => {
    setSecondaryView(
      requestedSource === 'online' || requestedSource === 'submission' ? requestedSource : 'local'
    )
  }, [requestedSource])

  if (secondaryView !== 'local') {
    const online = secondaryView === 'online'
    const submission = secondaryView === 'submission'
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
            {submission ? t('submissionCheck.backToCurrentPaper') : 'Back to local references'}
          </button>
          <span>
            {online ? (
              <Globe2 size={ICON_SIZE.compact} aria-hidden="true" />
            ) : submission ? (
              <FileCheck2 size={ICON_SIZE.compact} aria-hidden="true" />
            ) : (
              <BookMarked size={ICON_SIZE.compact} aria-hidden="true" />
            )}
            {online
              ? 'Crossref / arXiv'
              : submission
                ? t('submissionCheck.title')
                : 'Project citation groups'}
          </span>
        </div>
        {online ? (
          <OnlineReferences onAddToChat={onAddToChat} />
        ) : submission ? (
          <SubmissionCheckPanel />
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
        onOpenProblems={onOpenProblems}
        onOpenSubmission={() => {
          setSecondaryView('submission')
          useProjectStore.getState().setResearchReferenceSource('submission')
        }}
        onOpenProjectGroups={() => setSecondaryView('groups')}
        onSearchOnline={() => {
          setSecondaryView('online')
          useProjectStore.getState().setResearchReferenceSource('online')
        }}
      />
    </div>
  )
}
