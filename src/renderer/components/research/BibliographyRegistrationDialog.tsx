import { useState } from 'react'
import { documentRegistry } from '../../models/documentRegistry'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'

export function BibliographyRegistrationDialog() {
  const request = useProjectStore((state) => state.bibliographyRegistrationRequest)
  const [error, setError] = useState('')
  if (!request) return null

  const close = () => {
    setError('')
    useProjectStore.getState().setBibliographyRegistrationRequest(null)
  }
  const apply = () => {
    const editor = useEditorStore.getState()
    const current = documentRegistry.snapshot(request.filePath)?.text
    if (editor.activeFilePath !== request.filePath || current !== request.originalContent) {
      setError(
        'The document changed after this preview was created. Add the bibliography again to refresh it.'
      )
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
        <h2 id="bibliography-registration-title">Register project bibliography?</h2>
        <p>
          TextEx added <strong>{request.bibliographyFile}</strong>. The active document does not
          reference it yet. Review the proposed{' '}
          {request.mode === 'biblatex' ? 'BibLaTeX' : 'BibTeX'} change.
        </p>
        <pre>{request.command}</pre>
        {error && <div className="research-status">{error}</div>}
        <div className="bibliography-registration-actions">
          <button type="button" onClick={close}>
            Not now
          </button>
          <button type="button" className="primary" onClick={apply}>
            Apply change
          </button>
        </div>
      </section>
    </div>
  )
}
