import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileInput } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useProjectStore } from '../../store/useProjectStore'
import { describeNativeError } from '../../services/nativeErrors'

export function PdfAnnotationImport({ onImport }: { onImport: (lines: string[]) => void }) {
  const { t } = useTranslation()
  const root = useProjectStore((state) => state.projectRoot)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(
    () => () => {
      request.current?.abort()
    },
    [root]
  )

  const read = async (file: File) => {
    if (request.current || !root) return
    const controller = new AbortController()
    request.current = controller
    const current = () =>
      !controller.signal.aborted && useProjectStore.getState().projectRoot === root
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const { readPdfAnnotations, annotationNotes } = await import('../../services/pdfAnnotations')
      if (!current()) return
      const annotations = await readPdfAnnotations(file, controller.signal)
      if (!current()) return
      if (annotations.length) onImport(annotationNotes(file.name, annotations))
      setMessage(
        t(annotations.length ? 'pdfAnnotations.imported' : 'pdfAnnotations.empty', {
          count: annotations.length
        })
      )
    } catch (reason) {
      if (current()) setError(describeNativeError(reason))
    } finally {
      if (current()) {
        request.current = null
        setBusy(false)
      }
    }
  }

  return (
    <div className="notes-panel__import">
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        aria-label={t('pdfAnnotations.import')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void read(file)
        }}
      />
      <button
        type="button"
        className="workspace-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <FileInput size={ICON_SIZE.compact} aria-hidden="true" />
        {t(busy ? 'pdfAnnotations.busy' : 'pdfAnnotations.import')}
      </button>
      {busy && (
        <button
          type="button"
          className="workspace-button"
          onClick={() => {
            request.current?.abort()
            request.current = null
            setBusy(false)
          }}
        >
          {t('pdfAnnotations.cancel')}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
