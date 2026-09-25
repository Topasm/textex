import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Pencil, Sparkles, X } from 'lucide-react'
import { ICON_SIZE } from './ui/IconSystem'
import { usePdfStore } from '../store/usePdfStore'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { documentRegistry } from '../models/documentRegistry'
import { describeNativeError } from '../services/nativeErrors'
import {
  applyPdfSentence,
  refinePdfSentence,
  type AppliedPdfSentence,
  type PdfSentenceSelection
} from '../services/pdfSentenceEditing'
import { flushAllPendingDocumentEdits } from '../services/pendingDocumentEdits'
import './PdfSentenceEditor.css'

export default function PdfSentenceEditor({
  selection,
  onClose,
  onCompile
}: {
  selection: PdfSentenceSelection
  onClose: () => void
  onCompile?: () => Promise<void>
}) {
  const { t } = useTranslation()
  const target = selection.target
  const [draft, setDraft] = useState(target?.original ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [undone, setUndone] = useState(false)
  const [applied, setApplied] = useState<AppliedPdfSentence | null>(null)
  const alive = useRef(new AbortController())
  const field = useRef<HTMLTextAreaElement>(null)
  const choice = useRef<HTMLButtonElement>(null)
  const aiEnabled = useSettingsStore((state) => state.settings.aiEnabled)
  useEditorStore((state) => state.revision)
  useEditorStore((state) => state.openFiles)
  useEditorStore((state) => state.tabMutationEpoch)
  useProjectStore((state) => state.projectRoot)
  const compileStatus = useCompileStore((state) => state.compileStatus)
  useCompileStore((state) => state.pdfRevision)
  const current = target?.isCurrent() ?? false

  useEffect(() => {
    const controller = new AbortController()
    alive.current = controller
    choice.current?.focus()
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (editing) field.current?.focus()
  }, [editing])

  const refine = async () => {
    if (!target || busy) return
    setBusy(true)
    setError('')
    setEditing(true)
    try {
      const result = await refinePdfSentence(target, draft)
      if (!alive.current.signal.aborted) {
        setDraft(result)
        setStatus(t('pdfSentenceEditor.review'))
      }
    } catch (reason) {
      if (!alive.current.signal.aborted) setError(describeNativeError(reason))
    } finally {
      if (!alive.current.signal.aborted) {
        setBusy(false)
        field.current?.focus()
      }
    }
  }

  const refreshPdf = async () => {
    if (!target || !onCompile || useProjectStore.getState().projectRoot !== target.projectRoot)
      return
    useEditorStore.getState().setActiveTab(target.compilePath)
    const source = documentRegistry.snapshot(target.compilePath)
    const edited = documentRegistry.snapshot(target.filePath)
    const previousPdf = useCompileStore.getState().pdfRevision
    await onCompile()
    if (alive.current.signal.aborted) return
    const result = useCompileStore.getState()
    const refreshed =
      result.compileStatus === 'success' &&
      result.pdfRevision > previousPdf &&
      result.pdfDocumentId === source?.documentId &&
      result.pdfDocumentRevision === source?.revision &&
      useProjectStore.getState().projectRoot === target.projectRoot &&
      Boolean(edited && documentRegistry.getModel(target.filePath)?.isCurrent(edited))
    setStatus(t(refreshed ? 'pdfSentenceEditor.updated' : 'pdfSentenceEditor.compileFailed'))
    return refreshed
  }

  const apply = async () => {
    if (!target || busy || !current || !onCompile) return
    setBusy(true)
    setError('')
    try {
      const result = await applyPdfSentence(target, draft, alive.current.signal)
      setApplied(result)
      setStatus(t('pdfSentenceEditor.refreshing'))
      await refreshPdf()
    } catch (reason) {
      if (!alive.current.signal.aborted) setError(describeNativeError(reason))
    } finally {
      if (!alive.current.signal.aborted) setBusy(false)
    }
  }

  const undo = async () => {
    flushAllPendingDocumentEdits()
    if (busy || !applied?.undo()) return
    setBusy(true)
    setApplied(null)
    setUndone(true)
    setError('')
    try {
      const refreshed = await refreshPdf()
      if (!alive.current.signal.aborted && refreshed) setStatus(t('pdfSentenceEditor.undone'))
    } catch (reason) {
      if (!alive.current.signal.aborted) setError(describeNativeError(reason))
    } finally {
      if (!alive.current.signal.aborted) setBusy(false)
    }
  }

  return createPortal(
    <section
      className="pdf-sentence-editor"
      role="dialog"
      aria-modal="false"
      aria-labelledby="pdf-sentence-editor-title"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          onClose()
        }
      }}
    >
      <header>
        <h3 id="pdf-sentence-editor-title">{t('pdfSentenceEditor.title')}</h3>
        <button
          type="button"
          className="workspace-button workspace-button-icon"
          aria-label={t('pdfSentenceEditor.close')}
          onClick={onClose}
        >
          <X size={ICON_SIZE.compact} />
        </button>
      </header>
      <blockquote>{selection.text}</blockquote>
      {selection.loading ? (
        <p role="status">{t('pdfSentenceEditor.locating')}</p>
      ) : !target ? (
        <p role="status">{t('pdfSentenceEditor.unmapped')}</p>
      ) : (
        <>
          {!editing && !applied && !undone && (
            <div className="pdf-sentence-editor__actions">
              <button
                ref={choice}
                type="button"
                className="workspace-button"
                disabled={!current}
                onClick={() => setEditing(true)}
              >
                <Pencil size={ICON_SIZE.compact} />
                {t('pdfSentenceEditor.manual')}
              </button>
              <button
                type="button"
                className="workspace-button"
                disabled={!current || !aiEnabled || busy}
                onClick={() => void refine()}
              >
                <Sparkles size={ICON_SIZE.compact} />
                {t('pdfSentenceEditor.ai')}
              </button>
            </div>
          )}
          {!aiEnabled && !applied && !undone && (
            <p className="research-muted">{t('pdfSentenceEditor.aiSetup')}</p>
          )}
          {editing && !applied && !undone && (
            <>
              <label>
                {t('pdfSentenceEditor.sentence')}
                <textarea
                  ref={field}
                  value={draft}
                  disabled={busy || !current}
                  maxLength={16000}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setStatus('')
                  }}
                />
              </label>
              <p className="research-muted">{t('pdfSentenceEditor.formatHint')}</p>
              <div className="pdf-sentence-editor__actions">
                <button
                  type="button"
                  className="workspace-button"
                  disabled={busy || !current || !aiEnabled}
                  onClick={() => void refine()}
                >
                  {t('pdfSentenceEditor.ai')}
                </button>
                <button
                  type="button"
                  className="workspace-button workspace-button-primary"
                  disabled={
                    busy || !current || !draft.trim() || draft === target.original || !onCompile
                  }
                  onClick={() => void apply()}
                >
                  {t('pdfSentenceEditor.apply')}
                </button>
              </div>
            </>
          )}
          {!current && !applied && !busy && !undone && (
            <p role="alert">{t('pdfSentenceEditor.stale')}</p>
          )}
          {applied && (
            <button
              type="button"
              className="workspace-button"
              disabled={busy || compileStatus === 'compiling' || !applied.isCurrent()}
              onClick={() => void undo()}
            >
              {t('pdfSentenceEditor.undo')}
            </button>
          )}
        </>
      )}
      <button
        type="button"
        className="workspace-button"
        disabled={busy}
        onClick={() => {
          usePdfStore.getState().setSourceEditorOpen(true)
          if (target?.isCurrent()) {
            useEditorStore
              .getState()
              .requestJumpToLine(target.range.start.line, target.range.start.column)
          }
          onClose()
        }}
      >
        {t('pdfWorkspace.source')}
      </button>
      {busy && <p role="status">{t('pdfSentenceEditor.busy')}</p>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>,
    document.body
  )
}
