import { useEffect, useRef } from 'react'
import i18n from '../i18n'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { documentRegistry } from '../models/documentRegistry'
import { hasNativeErrorCode } from '../../shared/appError'
import { describeNativeError } from '../services/nativeErrors'
import { clearCompileFailure, reportCompileFailure } from '../services/compileFeedback'
import { AUTO_COMPILE_DELAY_MS } from '../constants'
import { parseAuxContent } from '../../shared/auxparser'
import {
  beginCompileTicket,
  canPublishCompileResponse,
  canPublishCompileTicket,
  isLatestCompileTicket,
  onPendingAutoCompileCancellation,
  toCompileRequest
} from '../services/compileCoordinator'
import { prepareDocumentsForCompile } from '../services/compilePersistenceCoordinator'

export function useAutoCompile(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let enabled = useSettingsStore.getState().settings.autoCompile
    let generation = 0

    const cancelScheduled = (): void => {
      generation += 1
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }

    const schedule = (): void => {
      cancelScheduled()
      if (!enabled) return

      const scheduledFile = useEditorStore.getState().filePath
      if (!scheduledFile?.toLowerCase().endsWith('.tex')) return
      if (documentRegistry.getModel(scheduledFile)?.requiresExplicitSave) return
      const scheduledGeneration = generation

      timerRef.current = setTimeout(async () => {
        timerRef.current = undefined
        const isCurrentRun = (): boolean => enabled && generation === scheduledGeneration
        if (!isCurrentRun()) return

        const { appendLog, setCompileStatus, clearLogs } = useCompileStore.getState()
        const currentFilePath = useEditorStore.getState().filePath
        if (!currentFilePath || currentFilePath !== scheduledFile) return
        if (documentRegistry.getModel(currentFilePath)?.requiresExplicitSave) return
        const sourceSnapshot = documentRegistry.snapshot(currentFilePath)
        if (!sourceSnapshot) return

        try {
          const preparation = await prepareDocumentsForCompile({
            activeFilePath: currentFilePath,
            activeSnapshot: sourceSnapshot,
            mode: 'automatic'
          })
          if (preparation.status !== 'ready') return
        } catch (err: unknown) {
          if (!isCurrentRun()) return
          appendLog(
            i18n.t('logPanel.saveFailedSkippingCompile', { reason: describeNativeError(err) })
          )
          setCompileStatus('error')
          reportCompileFailure(err, 'automatic')
          return
        }

        if (!isCurrentRun()) return

        const ticket = beginCompileTicket(currentFilePath, sourceSnapshot)
        setCompileStatus('compiling')
        clearLogs()
        try {
          const result = await window.api.compile(toCompileRequest(ticket, 'normal'))
          if (
            !isCurrentRun() ||
            useEditorStore.getState().filePath !== currentFilePath ||
            !canPublishCompileResponse(ticket, result)
          ) {
            if (isLatestCompileTicket(ticket)) setCompileStatus('idle')
            return
          }
          useCompileStore.getState().setPdfPath(result.pdfPath, {
            documentId: sourceSnapshot.documentId,
            revision: sourceSnapshot.revision
          })
          useCompileStore.getState().setCompileStatus('success')
          clearCompileFailure()

          if (isCurrentRun() && canPublishCompileTicket(ticket)) {
            useProjectStore
              .getState()
              .setAuxCitationMap(result.auxContent ? parseAuxContent(result.auxContent) : null)
          }
        } catch (err: unknown) {
          if (!isCurrentRun()) {
            if (isLatestCompileTicket(ticket)) setCompileStatus('idle')
            return
          }
          if (!isLatestCompileTicket(ticket)) return
          if (!documentRegistry.getModel(ticket.filePath)?.isCurrent(ticket.snapshot)) {
            setCompileStatus('idle')
            return
          }
          // A cancelled or superseded compile is the expected outcome of typing
          // during a build, not a failure the author needs to see.
          if (hasNativeErrorCode(err, 'compilationCancelled', 'compilationSuperseded')) {
            setCompileStatus('idle')
            return
          }
          useCompileStore.getState().appendLog(describeNativeError(err))
          useCompileStore.getState().setCompileStatus('error')
          reportCompileFailure(err, 'automatic')
        }
      }, AUTO_COMPILE_DELAY_MS)
    }

    const unsubscribeRevision = useEditorStore.subscribe(
      (state) => state.revision,
      () => schedule()
    )
    const unsubscribeFile = useEditorStore.subscribe(
      (state) => state.filePath,
      () => schedule()
    )
    const unsubscribeAutoCompile = useSettingsStore.subscribe(
      (state) => state.settings.autoCompile,
      (autoCompile) => {
        enabled = autoCompile
        if (enabled) schedule()
        else cancelScheduled()
      }
    )
    const unsubscribePendingCancellation = onPendingAutoCompileCancellation(cancelScheduled)
    schedule()

    return () => {
      enabled = false
      cancelScheduled()
      unsubscribeRevision()
      unsubscribeFile()
      unsubscribeAutoCompile()
      unsubscribePendingCancellation()
    }
  }, [])
}
