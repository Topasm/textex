import { RotateCcw, CheckCheck } from 'lucide-react'
import { ICON_SIZE } from './ui/IconSystem'
import { isAiEditCompiled, type AiEditReviewData } from '../services/aiEditReview'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { documentRegistry } from '../models/documentRegistry'
import { useTranslation } from 'react-i18next'
import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { flushAllPendingDocumentEdits } from '../services/pendingDocumentEdits'

export function AiEditReview({
  edit,
  onUndo,
  onCompile
}: {
  edit: AiEditReviewData
  onUndo: () => void
  onCompile?: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const root = useProjectStore((s) => s.projectRoot)
  useEditorStore((s) => s.revision)
  useEditorStore((s) => s.openFiles)
  const status = useCompileStore((s) => s.compileStatus)
  const pdfId = useCompileStore((s) => s.pdfDocumentId)
  const pdfRevision = useCompileStore((s) => s.pdfDocumentRevision)
  const model = documentRegistry.getModel(edit.filePath)
  useSyncExternalStore(
    useCallback((notify) => model?.subscribe(notify) ?? (() => {}), [model]),
    useCallback(() => model?.revision ?? -1, [model])
  )
  const current = root === edit.projectRoot && edit.isCurrent()
  const verified =
    current &&
    isAiEditCompiled(edit.appliedSnapshot, {
      compileStatus: status,
      pdfDocumentId: pdfId,
      pdfDocumentRevision: pdfRevision
    })
  const compile = async () => {
    flushAllPendingDocumentEdits()
    if (
      !onCompile ||
      !edit.isCurrent() ||
      useProjectStore.getState().projectRoot !== edit.projectRoot
    )
      return
    setBusy(true)
    setFailed(false)
    try {
      useEditorStore.getState().setActiveTab(edit.filePath)
      await onCompile()
      setFailed(useCompileStore.getState().compileStatus === 'error')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="ai-edit-review" aria-label={t('aiEditReview.title')}>
      <div className="ai-edit-review-header">
        <strong title={edit.filePath}>{edit.filePath.split(/[\\/]/u).at(-1)}</strong>
        <div className="ai-edit-review-actions">
          <button
            type="button"
            className="workspace-button workspace-button-icon"
            aria-label={t('researchPanel.chat.undo')}
            title={t('researchPanel.chat.undo')}
            disabled={!current || busy || status === 'compiling'}
            onClick={() => {
              flushAllPendingDocumentEdits()
              if (useProjectStore.getState().projectRoot === edit.projectRoot && edit.isCurrent())
                onUndo()
            }}
          >
            <RotateCcw size={ICON_SIZE.compact} />
          </button>
          {onCompile && (
            <button
              type="button"
              className="workspace-button workspace-button-primary"
              aria-label={t('aiEditReview.check')}
              title={t('aiEditReview.check')}
              disabled={!current || busy || status === 'compiling'}
              onClick={() => void compile()}
            >
              <CheckCheck size={ICON_SIZE.compact} />
              {t('aiEditReview.checkShort')}
            </button>
          )}
        </div>
      </div>
      <p role="status">
        {t(
          `aiEditReview.${!current ? 'stale' : busy || status === 'compiling' ? 'checking' : verified ? 'verified' : failed ? 'failed' : 'unverified'}`
        )}
      </p>
      <details>
        <summary>{t('aiEditReview.changes')}</summary>
        <span>{t('aiEditReview.before')}</span>
        <pre>{edit.before}</pre>
        <span>{t('aiEditReview.after')}</span>
        <pre>{edit.after}</pre>
      </details>
    </section>
  )
}
