import { RotateCcw, Trash2 } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  evidenceQuoteMatches,
  isRelativeEvidencePdf,
  MAX_EVIDENCE_QUOTE,
  type CitationEvidence
} from '../../../shared/citationEvidence'
import {
  loadCitationEvidence,
  removeCitationEvidence,
  saveCitationEvidence,
  subscribeCitationEvidence
} from '../../services/citationEvidence'
import { readEvidencePage, type EvidencePage } from '../../services/pdfEvidence'
import { useProjectStore } from '../../store/useProjectStore'
import { normalizeDocumentId } from '../../models/documentRegistry'
import { describeNativeError } from '../../services/nativeErrors'

export default function CitationEvidencePanel({ citekey }: { citekey: string }) {
  const { t } = useTranslation()
  const root = useProjectStore((s) => s.projectRoot)
  const [files, setFiles] = useState<string[]>([])
  const [records, setRecords] = useState<CitationEvidence[]>([])
  const [pdf, setPdf] = useState('')
  const [page, setPage] = useState('1')
  const [source, setSource] = useState<EvidencePage | null>(null)
  const [quote, setQuote] = useState('')
  const [pageOpen, setPageOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null)
  const readButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let active = true
    let generation = 0
    const reload = async () => {
      if (!root) return
      const request = ++generation
      try {
        const entries = await loadCitationEvidence(root)
        if (active && request === generation) {
          setRecords(entries.filter((entry) => entry.citekey === citekey))
          setLoaded(true)
        }
      } catch (reason) {
        if (active && request === generation) {
          setLoaded(false)
          setError(describeNativeError(reason))
        }
      }
    }
    void reload()
    if (root)
      void window.api
        .getProjectIndex()
        .then((index) => {
          if (!active || normalizeDocumentId(index.root) !== normalizeDocumentId(root)) return
          setFiles(
            index.entries
              .filter((entry) => entry.type === 'file' && isRelativeEvidencePdf(entry.relativePath))
              .map((entry) => entry.relativePath)
          )
        })
        .catch((reason) => {
          if (active) setError(describeNativeError(reason))
        })
    const unsubscribe = subscribeCitationEvidence(() => {
      void reload()
    })
    return () => {
      active = false
      unsubscribe()
      controller.current?.abort()
    }
  }, [root, citekey])

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current || !root) return
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    try {
      await action(request.signal)
    } catch (reason) {
      if (!request.signal.aborted) setError(describeNativeError(reason))
    } finally {
      if (!request.signal.aborted) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  const read = () =>
    void run(async (signal) => {
      const result = await readEvidencePage(root!, pdf, Number(page), signal)
      signal.throwIfAborted()
      setSource(result)
      setPageOpen(true)
      setQuote('')
    })
  const save = () =>
    void run(async (signal) => {
      if (!source || !evidenceQuoteMatches(source.text, quote)) return
      // Re-read at save time so an on-disk replacement cannot inherit the old match.
      const latest = await readEvidencePage(root!, source.pdf, source.page, signal)
      if (latest.sha256 !== source.sha256 || !evidenceQuoteMatches(latest.text, quote))
        throw new Error(t('citationEvidence.changed'))
      signal.throwIfAborted()
      const entry: CitationEvidence = {
        id: crypto.randomUUID(),
        citekey,
        pdf: source.pdf,
        page: source.page,
        quote: quote.trim(),
        sha256: latest.sha256,
        savedAt: new Date().toISOString()
      }
      await saveCitationEvidence(root!, entry, signal)
      signal.throwIfAborted()
      setChecks((previous) => ({ ...previous, [entry.id]: 'matched' }))
      setQuote('')
      setSource(null)
      setPageOpen(false)
      requestAnimationFrame(() => readButton.current?.focus())
    })
  if (!root) return <p>{t('citationEvidence.projectRequired')}</p>
  return (
    <section
      className="citation-evidence-panel"
      aria-label={t('citationEvidence.title')}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <details className="workspace-disclosure">
        <summary>{t('citationEvidence.scopeLabel')}</summary>
        <p className="research-muted">{t('citationEvidence.scope')}</p>
      </details>
      <label className="citation-evidence-file-field">
        <span>{t('citationEvidence.pdf')}</span>
        <select
          value={pdf}
          disabled={busy}
          onChange={(event) => {
            setPdf(event.target.value)
            setSource(null)
            setQuote('')
          }}
        >
          <option value="">{t('citationEvidence.choose')}</option>
          {files.map((file) => (
            <option key={file} value={file}>
              {file}
            </option>
          ))}
        </select>
      </label>
      {!files.length && <p>{t('citationEvidence.noPdfs')}</p>}
      <div className="citation-evidence-page-controls">
        <label>
          <span>{t('citationEvidence.page')}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={page}
            disabled={busy}
            onChange={(event) => {
              setPage(event.target.value)
              setSource(null)
              setQuote('')
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !pdf || !Number.isSafeInteger(Number(page)) || Number(page) < 1}
          onClick={read}
          ref={readButton}
          className="workspace-button"
        >
          {t('citationEvidence.read')}
        </button>
      </div>
      {source && (
        <>
          <details
            className="citation-evidence-page-preview"
            open={pageOpen}
            onToggle={(event) => setPageOpen(event.currentTarget.open)}
          >
            <summary>
              {t('citationEvidence.pageCount', { page: source.page, count: source.pages })}
            </summary>
            <label>
              {t('citationEvidence.pageText')}
              <textarea
                readOnly
                value={source.text}
                onSelect={(event) => {
                  const area = event.currentTarget
                  const selected = area.value.slice(area.selectionStart, area.selectionEnd)
                  if (selected.trim() && selected.length <= MAX_EVIDENCE_QUOTE) setQuote(selected)
                }}
              />
            </label>
          </details>
          <label>
            {t('citationEvidence.quote')}
            <textarea
              value={quote}
              maxLength={MAX_EVIDENCE_QUOTE}
              disabled={busy}
              onChange={(event) => setQuote(event.target.value)}
            />
          </label>
          {quote.trim() && !evidenceQuoteMatches(source.text, quote) && (
            <p role="status">{t('citationEvidence.noMatch')}</p>
          )}
          <button
            type="button"
            disabled={busy || !loaded || !evidenceQuoteMatches(source.text, quote)}
            onClick={save}
            className="workspace-button workspace-button-primary citation-evidence-save"
          >
            {t('citationEvidence.save')}
          </button>
        </>
      )}
      {busy && <p role="status">{t('citationEvidence.busy')}</p>}
      {error && <p role="alert">{error}</p>}
      {records.map((entry) => (
        <article key={entry.id} className="citation-evidence-record">
          <strong>
            {entry.pdf} · {t('citationEvidence.page')} {entry.page}
          </strong>
          <blockquote>{entry.quote}</blockquote>
          <p role="status">{t(`citationEvidence.${checks[entry.id] ?? 'saved'}`)}</p>
          <div className="citation-evidence-record-actions">
            <button
              type="button"
              className="workspace-button"
              aria-label={t('citationEvidence.recheck')}
              title={t('citationEvidence.recheck')}
              disabled={busy}
              onClick={() =>
                void run(async (signal) => {
                  setChecks((previous) => ({ ...previous, [entry.id]: 'saved' }))
                  const latest = await readEvidencePage(root, entry.pdf, entry.page, signal)
                  signal.throwIfAborted()
                  setSource(latest)
                  setPageOpen(true)
                  setPdf(entry.pdf)
                  setPage(String(entry.page))
                  setQuote('')
                  setChecks((previous) => ({
                    ...previous,
                    [entry.id]:
                      latest.sha256 !== entry.sha256
                        ? 'changed'
                        : evidenceQuoteMatches(latest.text, entry.quote)
                          ? 'matched'
                          : 'noMatch'
                  }))
                })
              }
            >
              <RotateCcw size={ICON_SIZE.compact} />
              {t('citationEvidence.recheckShort')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run((signal) => removeCitationEvidence(root, entry.id, signal))}
              className="workspace-button workspace-button-icon"
              aria-label={t('citationEvidence.remove')}
              title={t('citationEvidence.remove')}
            >
              <Trash2 size={ICON_SIZE.compact} />
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
