import { useRef, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { normalizeDocumentId } from '../models/documentRegistry'
import { flushPendingDocumentEdits } from '../services/pendingDocumentEdits'
import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { errorMessage } from '../utils/errorMessage'
import { ICON_SIZE } from './ui/IconSystem'

export function PdfExportControls() {
  const { t } = useTranslation()
  const filePath = useEditorStore((s) => s.filePath)
  const revision = useEditorStore((s) => s.revision)
  const pdfPath = useCompileStore((s) => s.pdfPath)
  const pdfDocumentId = useCompileStore((s) => s.pdfDocumentId)
  const pdfDocumentRevision = useCompileStore((s) => s.pdfDocumentRevision)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const ready = Boolean(
    filePath &&
    pdfPath &&
    pdfDocumentId === normalizeDocumentId(filePath) &&
    pdfDocumentRevision === revision &&
    compileStatus === 'success'
  )

  const handleExport = async (share: boolean) => {
    if (busyRef.current || !ready || !filePath || !pdfPath) return
    flushPendingDocumentEdits(filePath)
    const editor = useEditorStore.getState()
    const compiled = useCompileStore.getState()
    const stillCurrent = () => {
      const currentEditor = useEditorStore.getState()
      const currentPdf = useCompileStore.getState()
      return (
        currentEditor.filePath === filePath &&
        currentEditor.revision === pdfDocumentRevision &&
        currentEditor.tabMutationEpoch === editor.tabMutationEpoch &&
        currentPdf.pdfRevision === compiled.pdfRevision &&
        currentPdf.compileStatus === 'success'
      )
    }
    const notify = useNotificationStore.getState().pushNotification
    if (!stillCurrent()) {
      notify({ message: t('pdfExport.compileFirst'), tone: 'info' })
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      if (share) {
        const { data } = await window.api.readCompiledPdf(pdfPath)
        if (!stillCurrent()) return
        const fileName = pdfPath.split(/[/\\]/).pop() || 'document.pdf'
        const result = await window.api.sharePdf(data, fileName)
        if (result !== 'unsupported' || !stillCurrent()) return
        notify({ message: t('pdfExport.shareFallback'), tone: 'info' })
      }
      const result = await window.api.exportPdf(pdfPath, share)
      if (!result || !stillCurrent()) return
      notify({
        message: t(
          share
            ? result.folderOpened
              ? 'pdfExport.readyToAttach'
              : 'pdfExport.folderFailed'
            : 'pdfExport.saved',
          { path: result.outputPath }
        ),
        tone: share && !result.folderOpened ? 'warning' : 'success',
        timeoutMs: null
      })
    } catch (error) {
      if (stillCurrent()) {
        notify({
          message: t('pdfExport.failed', { reason: errorMessage(error) }),
          tone: 'error'
        })
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="toolbar-sync-controls">
      <button
        className="toolbar-btn toolbar-compact-btn"
        aria-label={t('pdfExport.save')}
        title={t(ready ? 'pdfExport.save' : 'pdfExport.compileFirst')}
        disabled={!ready || busy}
        onClick={() => void handleExport(false)}
      >
        <Download size={ICON_SIZE.compact} />
      </button>
      <button
        className="toolbar-btn toolbar-compact-btn"
        aria-label={t('pdfExport.share')}
        title={t(ready ? 'pdfExport.share' : 'pdfExport.compileFirst')}
        disabled={!ready || busy}
        onClick={() => void handleExport(true)}
      >
        <Share2 size={ICON_SIZE.compact} />
      </button>
    </div>
  )
}
