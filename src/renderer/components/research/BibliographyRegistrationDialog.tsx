import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { documentRegistry } from '../../models/documentRegistry'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useFeatureModal } from '../../hooks/useFeatureModal'

export function BibliographyRegistrationDialog() {
  const { t } = useTranslation()
  const request = useProjectStore((state) => state.bibliographyRegistrationRequest)
  const [error, setError] = useState('')
  useFeatureModal('bibliographyRegistration', Boolean(request))
  if (!request) return null

  const close = () => {
    setError('')
    useProjectStore.getState().setBibliographyRegistrationRequest(null)
  }
  const apply = () => {
    const editor = useEditorStore.getState()
    const current = documentRegistry.snapshot(request.filePath)?.text
    if (editor.activeFilePath !== request.filePath || current !== request.originalContent) {
      setError(t('researchPanel.bibliographyRegistration.stale'))
      return
    }
    editor.updateActiveDocument(request.proposedContent, 'programmatic')
    close()
  }

  return (
    <div className="modal-overlay bibliography-registration-overlay" role="presentation">
      <section
        className="bibliography-registration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bibliography-registration-title"
      >
        <h2 id="bibliography-registration-title">
          {t('researchPanel.bibliographyRegistration.title')}
        </h2>
        <p>
          <Trans
            i18nKey="researchPanel.bibliographyRegistration.body"
            values={{
              file: request.bibliographyFile,
              format: request.mode === 'biblatex' ? 'BibLaTeX' : 'BibTeX'
            }}
            components={{ file: <strong /> }}
          />
        </p>
        <pre>{request.command}</pre>
        {error && <div className="research-status">{error}</div>}
        <div className="bibliography-registration-actions">
          <button type="button" onClick={close}>
            {t('researchPanel.bibliographyRegistration.notNow')}
          </button>
          <button type="button" className="primary" onClick={apply}>
            {t('researchPanel.bibliographyRegistration.apply')}
          </button>
        </div>
      </section>
    </div>
  )
}
