import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { documentRegistry } from '../models/documentRegistry'
import { errorMessage } from '../utils/errorMessage'
import { AUTO_COMPILE_DELAY_MS } from '../constants'
import { parseAuxContent } from '../../shared/auxparser'
import {
  beginCompileTicket,
  canPublishCompileResponse,
  canPublishCompileTicket,
  isLatestCompileTicket,
  toCompileRequest
} from '../services/compileCoordinator'

export function useAutoCompile(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const schedule = (): void => {
      clearTimeout(timerRef.current)
      const scheduledFile = useEditorStore.getState().filePath
      if (!scheduledFile?.toLowerCase().endsWith('.tex')) return

      timerRef.current = setTimeout(async () => {
        const { appendLog, setCompileStatus, clearLogs } = useCompileStore.getState()
        const currentFilePath = useEditorStore.getState().filePath
        if (!currentFilePath || currentFilePath !== scheduledFile) return
        const sourceSnapshot = documentRegistry.snapshot(currentFilePath)
        if (!sourceSnapshot) return

        const dirtyDocuments = documentRegistry.dirtySnapshots()
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
          } catch (err: unknown) {
            appendLog(`Save failed, skipping compile: ${errorMessage(err)}`)
            setCompileStatus('error')
            return
          }
        }

        if (!documentRegistry.getModel(currentFilePath)?.isCurrent(sourceSnapshot)) return

        const ticket = beginCompileTicket(currentFilePath, sourceSnapshot)
        setCompileStatus('compiling')
        clearLogs()
        try {
          const result = await window.api.compile(toCompileRequest(ticket, 'normal'))
          if (
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
            if (canPublishCompileTicket(ticket)) {
              useProjectStore.getState().setAuxCitationMap(parseAuxContent(auxContent))
            }
          } catch {
            if (canPublishCompileTicket(ticket)) {
              useProjectStore.getState().setAuxCitationMap(null)
            }
          }
        } catch (err: unknown) {
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
    schedule()

    return () => {
      clearTimeout(timerRef.current)
      unsubscribeRevision()
      unsubscribeFile()
    }
  }, [])
}
