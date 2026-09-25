import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Check, Code, Loader, Pencil, RotateCcw, Sparkles, X } from 'lucide-react'
import { ICON_SIZE } from './ui/IconSystem'
import { useUiStore } from '../store/useUiStore'
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
  const [feedbackTone, setFeedbackTone] = useState<'info' | 'success' | 'error'>('info')
  const [undone, setUndone] = useState(false)
  const [applied, setApplied] = useState<AppliedPdfSentence | null>(null)
  const alive = useRef(new AbortController())
  const field = useRef<HTMLTextAreaElement>(null)
  const choice = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const done = useRef<HTMLButtonElement>(null)
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
    if (!selection.loading) (choice.current ?? panel.current)?.focus()
    return () => controller.abort()
  }, [selection.loading])
  useEffect(() => {
    if (editing) field.current?.focus()
  }, [editing])

  useEffect(() => {
    if ((applied || undone) && !busy) done.current?.focus()
  }, [applied, undone, busy])

  const refine = async () => {
    if (!target || busy) return
    setBusy(true)
    setError('')
    setEditing(true)
    try {
      const result = await refinePdfSentence(target, draft)
      if (!alive.current.signal.aborted) {
        setDraft(result)
        setFeedbackTone('info')
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
    setFeedbackTone(refreshed ? 'success' : 'error')
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
      setFeedbackTone('info')
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

  const canApply = Boolean(
    target &&
    current &&
    !busy &&
    draft.trim() &&
    draft !== target.original &&
    onCompile &&
    !applied &&
    !undone
  )
  const close = () => {
    onClose()
    document.querySelector<HTMLElement>('.preview-container')?.focus()
  }
  const shortcut = document.documentElement.dataset.platform === 'darwin' ? '⌘↵' : 'Ctrl+Enter'

  return createPortal(
    <section
      className="pdf-sentence-editor"
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="pdf-sentence-editor-title"
      aria-busy={busy || selection.loading}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && editing) {
          event.preventDefault()
          if (canApply) void apply()
        }
      }}
    >
      <header>
        <h3 id="pdf-sentence-editor-title">
          <Pencil size={ICON_SIZE.control} />
          {t('pdfSentenceEditor.title')}
        </h3>
        <button
          type="button"
          className="workspace-button workspace-button-icon"
          aria-label={t('pdfSentenceEditor.close')}
          onClick={close}
        >
          <X size={ICON_SIZE.compact} />
        </button>
      </header>
      <div className="pdf-sentence-editor__body">
        <div className="pdf-sentence-editor__original">
          <span className="pdf-sentence-editor__caption">{t('pdfSentenceEditor.original')}</span>
          <blockquote>{selection.text}</blockquote>
        </div>
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
                  className="workspace-button workspace-button-primary"
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
              <div className="pdf-sentence-editor__ai-setup">
                <p>{t('pdfSentenceEditor.aiSetup')}</p>
                <button
                  type="button"
                  className="workspace-button workspace-button-quiet"
                  onClick={() => useUiStore.getState().requestSettings()}
                >
                  {t('pdfSentenceEditor.aiSettings')}
                </button>
              </div>
            )}
            {editing && !applied && !undone && (
              <>
                <label className="pdf-sentence-editor__field">
                  {t('pdfSentenceEditor.sentence')}
                  <textarea
                    ref={field}
                    value={draft}
                    disabled={busy || !current}
                    maxLength={16000}
                    aria-describedby="pdf-sentence-format-hint"
                    onChange={(event) => {
                      setDraft(event.target.value)
                      setStatus('')
                      setError('')
                    }}
                  />
                </label>
                <p id="pdf-sentence-format-hint" className="pdf-sentence-editor__hint">
                  {t('pdfSentenceEditor.formatHint')}
                </p>
                <div className="pdf-sentence-editor__actions">
                  <button
                    type="button"
                    className="workspace-button"
                    disabled={busy || !current || !aiEnabled}
                    onClick={() => void refine()}
                  >
                    <Sparkles size={ICON_SIZE.compact} />
                    {t('pdfSentenceEditor.ai')}
                  </button>
                  <button
                    type="button"
                    className="workspace-button workspace-button-quiet"
                    disabled={busy || !current || draft === target.original}
                    onClick={() => {
                      setDraft(target.original)
                      setStatus('')
                      setError('')
                      field.current?.focus()
                    }}
                  >
                    <RotateCcw size={ICON_SIZE.compact} />
                    {t('pdfSentenceEditor.resetDraft')}
                  </button>
                </div>
                <button
                  type="button"
                  className="workspace-button workspace-button-primary pdf-sentence-editor__apply"
                  disabled={!canApply}
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  onClick={() => void apply()}
                >
                  {busy ? (
                    <Loader size={ICON_SIZE.compact} className="spin" />
                  ) : (
                    <Check size={ICON_SIZE.compact} />
                  )}
                  {t('pdfSentenceEditor.apply')}
                  <kbd aria-hidden="true">{shortcut}</kbd>
                </button>
              </>
            )}
            {applied && (
              <div className="pdf-sentence-editor__result">
                <span className="pdf-sentence-editor__caption">
                  {t('pdfSentenceEditor.appliedText')}
                </span>
                <p>{draft}</p>
              </div>
            )}
            {!current && !applied && !busy && !undone && (
              <p role="alert" className="pdf-sentence-editor__feedback is-error">
                {t('pdfSentenceEditor.stale')}
              </p>
            )}
            {applied && (
              <button
                type="button"
                className="workspace-button"
                disabled={busy || compileStatus === 'compiling' || !applied.isCurrent()}
                onClick={() => void undo()}
              >
                <RotateCcw size={ICON_SIZE.compact} />
                {t('pdfSentenceEditor.undo')}
              </button>
            )}
          </>
        )}
        {busy && !status && <p role="status">{t('pdfSentenceEditor.busy')}</p>}
        {status && (
          <p role="status" className={`pdf-sentence-editor__feedback is-${feedbackTone}`}>
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="pdf-sentence-editor__feedback is-error">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button
          type="button"
          className="workspace-button workspace-button-quiet"
          disabled={busy}
          onClick={() => {
            usePdfStore.getState().setSourceEditorOpen(true)
            if (target?.isCurrent())
              useEditorStore
                .getState()
                .requestJumpToLine(target.range.start.line, target.range.start.column)
            onClose()
          }}
        >
          <Code size={ICON_SIZE.compact} />
          {t('pdfWorkspace.source')}
        </button>
        {(applied || undone) && (
          <button
            ref={done}
            type="button"
            className="workspace-button workspace-button-primary"
            disabled={busy}
            onClick={close}
          >
            {t('pdfSentenceEditor.done')}
          </button>
        )}
      </footer>
    </section>,
    document.body
  )
}
