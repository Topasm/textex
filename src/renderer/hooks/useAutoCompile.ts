import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { documentRegistry } from '../models/documentRegistry'
import { errorMessage } from '../utils/errorMessage'
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
import { syncRecoveryForFiles } from '../services/crashRecovery'

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

        const dirtyDocuments = documentRegistry
          .dirtySnapshots()
          .filter(({ filePath }) => !documentRegistry.getModel(filePath)?.requiresExplicitSave)
        if (dirtyDocuments.length > 0) {
          try {
            await window.api.saveFileBatch(
              dirtyDocuments.map(({ filePath, snapshot }) => ({
                content: snapshot.text,
                filePath
              }))
            )
            for (const { filePath, snapshot } of dirtyDocuments) {
              useEditorStore.getState().markDocumentSaved(filePath, snapshot.revision)
            }
            await syncRecoveryForFiles(dirtyDocuments.map(({ filePath }) => filePath))
          } catch (err: unknown) {
            if (!isCurrentRun()) return
            appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
            setCompileStatus('error')
            return
          }
        }

        if (!isCurrentRun()) return
        if (!documentRegistry.getModel(currentFilePath)?.isCurrent(sourceSnapshot)) return

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

          try {
            const auxPath = currentFilePath.replace(/\.tex$/, '.aux')
            const { content: auxContent } = await window.api.readFile(auxPath)
            if (isCurrentRun() && canPublishCompileTicket(ticket)) {
              useProjectStore.getState().setAuxCitationMap(parseAuxContent(auxContent))
            }
          } catch {
            if (isCurrentRun() && canPublishCompileTicket(ticket)) {
              useProjectStore.getState().setAuxCitationMap(null)
            }
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
          const message = errorMessage(err)
          if (message.includes('Compilation was cancelled')) return
          useCompileStore.getState().appendLog(message)
          useCompileStore.getState().setCompileStatus('error')
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
