import { ExternalLink, BookOpen } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'
import { lazy, Suspense, useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
const CitationEvidencePanel = lazy(() => import('./CitationEvidencePanel'))
import { useTranslation } from 'react-i18next'
import { errorMessage } from '../../utils/errorMessage'

/** Metadata/abstract context is never presented as verified full-text support. */
export function ReferenceEvidence({
  abstract,
  citekey,
  url
}: {
  citekey?: string | null
  abstract?: string | null
  url?: string | null
}) {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const root = useProjectStore((s) => s.projectRoot)
  const safeUrl = url && /^https?:\/\//iu.test(url) ? url : null
  return (
    <div className="reference-evidence">
      <p className="research-muted">
        {t(abstract ? 'referenceEvidence.abstractOnly' : 'referenceEvidence.metadataOnly')}
      </p>
      {abstract && <blockquote>{abstract}</blockquote>}
      <div className="reference-evidence-actions">
        {safeUrl && (
          <button
            type="button"
            className="workspace-button workspace-button-icon"
            aria-label={t('referenceEvidence.openSource')}
            title={t('referenceEvidence.openSource')}
            onClick={(event) => {
              event.stopPropagation()
              setError('')
              void window.api
                .openExternal(safeUrl)
                .catch((reason) => setError(errorMessage(reason)))
            }}
          >
            <ExternalLink size={ICON_SIZE.compact} />
          </button>
        )}
        {citekey && (
          <button
            type="button"
            className="workspace-button"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            <BookOpen size={ICON_SIZE.compact} />
            {t('citationEvidence.title')}
          </button>
        )}
      </div>
      {citekey && expanded && (
        <Suspense fallback={<p>{t('citationEvidence.busy')}</p>}>
          <CitationEvidencePanel key={`${root}:${citekey}`} citekey={citekey} />
        </Suspense>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
