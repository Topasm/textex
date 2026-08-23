import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exportDocumentWithFeedback,
  type DocumentExportMessages
} from '../../renderer/services/documentExportLifecycle'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'

const messages: DocumentExportMessages = {
  exporting: 'Exporting DOCX document...',
  complete: (path) => `DOCX export saved to ${path}.`,
  failed: 'Could not export the DOCX document.',
  retry: 'Try again'
}

beforeEach(() => {
  useEditorStore.getState().resetEditor()
  documentRegistry.clear()
  useProjectStore.getState().setProjectRoot('/project')
  useEditorStore.getState().openFileInTab('/project/paper.tex', 'Original document')
  vi.mocked(window.api.saveFile).mockReset().mockResolvedValue({ success: true })
  vi.mocked(window.api.exportDocument).mockReset()
  useNotificationStore.getState().clearNotifications()
  useUiStore.setState({ exportStatus: 'idle' })
  useCompileStore.setState({ logs: '' })
})

describe('documentExportLifecycle', () => {
  it('transitions one task from progress to transient success', async () => {
    vi.mocked(window.api.exportDocument).mockResolvedValue({
      success: true,
      outputPath: '/tmp/paper.docx'
    })

    await expect(exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)).resolves.toBe(
      'success'
    )

    expect(useUiStore.getState().exportStatus).toBe('success')
    expect(window.api.saveFile).toHaveBeenCalledWith('Original document', '/project/paper.tex')
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({
        id: 'document-export',
        tone: 'success',
        message: 'DOCX export saved to /tmp/paper.docx.',
        timeoutMs: 4_500
      })
    ])
  })

  it('treats a cancelled save dialog as neutral and removes progress', async () => {
    vi.mocked(window.api.exportDocument).mockResolvedValue(null)

    await expect(exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)).resolves.toBe(
      'cancelled'
    )

    expect(useUiStore.getState().exportStatus).toBe('idle')
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('keeps failures visible with a retry that reuses the same task', async () => {
    vi.mocked(window.api.exportDocument)
      .mockRejectedValueOnce(new Error('Pandoc unavailable'))
      .mockResolvedValueOnce({ success: true, outputPath: '/tmp/retried.docx' })

    await exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)

    const failed = useNotificationStore.getState().notifications[0]
    expect(failed).toMatchObject({ tone: 'error', message: messages.failed, timeoutMs: null })
    expect(useCompileStore.getState().logs).toContain('Pandoc unavailable')

    await failed?.action?.run()

    expect(window.api.exportDocument).toHaveBeenCalledTimes(2)
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({
        tone: 'success',
        message: 'DOCX export saved to /tmp/retried.docx.'
      })
    ])
  })

  it('deduplicates concurrent export requests while the native dialog is active', async () => {
    let resolveExport:
      ((value: { success: boolean; outputPath: string } | null) => void) | undefined
    vi.mocked(window.api.exportDocument).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve
        })
    )

    const first = exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)
    const second = exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)

    expect(first).toBe(second)
    await vi.waitFor(() => expect(window.api.exportDocument).toHaveBeenCalledOnce())
    expect(window.api.exportDocument).toHaveBeenCalledTimes(1)

    resolveExport?.({ success: true, outputPath: '/tmp/paper.docx' })
    await first
  })

  it('saves the current dirty revision before invoking the native export', async () => {
    useEditorStore.getState().updateActiveDocument('Edited document')
    vi.mocked(window.api.exportDocument).mockResolvedValue({
      success: true,
      outputPath: '/tmp/paper.docx'
    })

    await exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)

    expect(window.api.saveFile).toHaveBeenCalledWith('Edited document', '/project/paper.tex')
    expect(window.api.exportDocument).toHaveBeenCalledWith('/project/paper.tex', 'docx')
    expect(documentRegistry.getModel('/project/paper.tex')?.isDirty).toBe(false)
  })

  it('suppresses stale completion when the document changes during export', async () => {
    let resolveExport:
      ((value: { success: boolean; outputPath: string } | null) => void) | undefined
    vi.mocked(window.api.exportDocument).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve
        })
    )

    const pending = exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)
    await vi.waitFor(() => expect(window.api.exportDocument).toHaveBeenCalledOnce())
    useEditorStore.getState().updateActiveDocument('Changed while exporting')
    resolveExport?.({ success: true, outputPath: '/tmp/stale.docx' })

    await expect(pending).resolves.toBe('stale')
    expect(useUiStore.getState().exportStatus).toBe('idle')
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('queues a fresh export when the active native request has become stale', async () => {
    let resolveFirst: ((value: { success: boolean; outputPath: string } | null) => void) | undefined
    vi.mocked(window.api.exportDocument)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ success: true, outputPath: '/tmp/current.docx' })

    const stale = exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)
    await vi.waitFor(() => expect(window.api.exportDocument).toHaveBeenCalledOnce())
    useEditorStore.getState().updateActiveDocument('Current revision')

    const queued = exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)
    expect(queued).not.toBe(stale)
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({ tone: 'progress' })

    resolveFirst?.({ success: true, outputPath: '/tmp/stale.docx' })
    await expect(stale).resolves.toBe('stale')
    await expect(queued).resolves.toBe('success')

    expect(window.api.exportDocument).toHaveBeenCalledTimes(2)
    expect(window.api.saveFile).toHaveBeenNthCalledWith(2, 'Current revision', '/project/paper.tex')
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      tone: 'success',
      message: 'DOCX export saved to /tmp/current.docx.'
    })
  })

  it('removes a failed retry when project ownership changes', async () => {
    vi.mocked(window.api.exportDocument).mockRejectedValue(new Error('Pandoc unavailable'))

    await exportDocumentWithFeedback('/project/paper.tex', 'docx', messages)
    const retry = useNotificationStore.getState().notifications[0]?.action?.run
    expect(retry).toBeDefined()

    useProjectStore.getState().setProjectRoot('/other-project')

    expect(useUiStore.getState().exportStatus).toBe('idle')
    expect(useNotificationStore.getState().notifications).toEqual([])
    await retry?.()
    expect(window.api.exportDocument).toHaveBeenCalledTimes(1)
  })
})
