import { beforeEach, describe, expect, it, vi } from 'vitest'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import {
  beginCompileTicket,
  cancelActiveCompile,
  canPublishCompileResponse,
  canPublishCompileTicket,
  isCompileTicketCancelled,
  isCurrentCompileIdentity,
  isLatestCompileTicket,
  resetCompileTicketsForTests
} from '../../renderer/services/compileCoordinator'

describe('compileCoordinator', () => {
  beforeEach(() => {
    documentRegistry.clear()
    useEditorStore.getState().resetEditor()
    useCompileStore.setState({ compileStatus: 'idle' })
    resetCompileTicketsForTests()
    vi.mocked(window.api.cancelCompile).mockClear()
  })

  describe('cancelActiveCompile', () => {
    it('stops the running compile and refuses its late result', async () => {
      useEditorStore.getState().openFileInTab('/project/main.tex', 'body')
      const snapshot = documentRegistry.snapshot('/project/main.tex')!
      const ticket = beginCompileTicket('/project/main.tex', snapshot)
      useCompileStore.getState().setCompileStatus('compiling')

      await cancelActiveCompile()

      expect(window.api.cancelCompile).toHaveBeenCalledWith(ticket.requestId)
      expect(useCompileStore.getState().compileStatus).toBe('idle')
      expect(isCompileTicketCancelled(ticket)).toBe(true)
      expect(canPublishCompileTicket(ticket)).toBe(false)
      expect(
        canPublishCompileResponse(ticket, {
          requestId: ticket.requestId,
          documentId: snapshot.documentId,
          documentRevision: snapshot.revision,
          pdfPath: '/project/main.pdf',
          compiledFilePath: '/project/main.tex'
        })
      ).toBe(false)
    })

    it('leaves a compile started after the cancellation publishable', async () => {
      useEditorStore.getState().openFileInTab('/project/main.tex', 'body')
      const snapshot = documentRegistry.snapshot('/project/main.tex')!
      beginCompileTicket('/project/main.tex', snapshot)
      useCompileStore.getState().setCompileStatus('compiling')
      await cancelActiveCompile()

      const next = beginCompileTicket('/project/main.tex', snapshot)
      expect(isCompileTicketCancelled(next)).toBe(false)
      expect(canPublishCompileTicket(next)).toBe(true)
    })

    it('does nothing when no compile is running', async () => {
      useEditorStore.getState().openFileInTab('/project/main.tex', 'body')
      const ticket = beginCompileTicket(
        '/project/main.tex',
        documentRegistry.snapshot('/project/main.tex')!
      )
      useCompileStore.getState().setCompileStatus('success')

      await cancelActiveCompile()

      expect(window.api.cancelCompile).not.toHaveBeenCalled()
      expect(useCompileStore.getState().compileStatus).toBe('success')
      expect(canPublishCompileTicket(ticket)).toBe(true)
    })

    it('still returns to idle when the native cancel call fails', async () => {
      useEditorStore.getState().openFileInTab('/project/main.tex', 'body')
      beginCompileTicket('/project/main.tex', documentRegistry.snapshot('/project/main.tex')!)
      useCompileStore.getState().setCompileStatus('compiling')
      vi.mocked(window.api.cancelCompile).mockRejectedValueOnce(new Error('gone'))

      await expect(cancelActiveCompile()).resolves.toBeUndefined()
      expect(useCompileStore.getState().compileStatus).toBe('idle')
    })
  })

  it('publishes only the latest request for its exact source revision', () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'first')
    const firstSnapshot = documentRegistry.snapshot('/project/main.tex')!
    const first = beginCompileTicket('/project/main.tex', firstSnapshot)
    const second = beginCompileTicket('/project/main.tex', firstSnapshot)

    expect(isLatestCompileTicket(first)).toBe(false)
    expect(canPublishCompileTicket(first)).toBe(false)
    expect(canPublishCompileTicket(second)).toBe(true)

    documentRegistry.update('/project/main.tex', 'second')
    expect(canPublishCompileTicket(second)).toBe(false)
  })

  it('rejects a result after the source document is closed and reopened', () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'first')
    const snapshot = documentRegistry.snapshot('/project/main.tex')!
    const ticket = beginCompileTicket('/project/main.tex', snapshot)
    documentRegistry.close('/project/main.tex')
    documentRegistry.open('/project/main.tex', 'first')

    expect(canPublishCompileTicket(ticket)).toBe(false)
  })

  it('keeps a detached PDF workspace root compile current while another tab is active', () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'root')
    const snapshot = documentRegistry.snapshot('/project/main.tex')!
    useEditorStore.getState().openFileInTab('/project/chapter.tex', 'chapter')
    const attached = beginCompileTicket('/project/main.tex', snapshot)
    expect(canPublishCompileTicket(attached)).toBe(false)

    const detached = beginCompileTicket('/project/main.tex', snapshot, {
      detachedFromActiveTab: true
    })
    expect(canPublishCompileTicket(detached)).toBe(true)
    expect(
      isCurrentCompileIdentity({
        requestId: detached.requestId,
        documentId: snapshot.documentId,
        documentRevision: snapshot.revision
      })
    ).toBe(true)
  })
})
