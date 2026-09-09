import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfExportControls } from '../../renderer/components/PdfExportControls'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { registerPendingDocumentEditFlusher } from '../../renderer/services/pendingDocumentEdits'

const pdfPath = '/cache/build/project/tectonic/root/main.pdf'
const bytes = new Uint8Array([37, 80, 68, 70])

beforeEach(() => {
  vi.resetAllMocks()
  useEditorStore.setState({ filePath: '/project/main.tex', revision: 3, tabMutationEpoch: 1 })
  useCompileStore.setState({
    compileStatus: 'success',
    pdfPath,
    pdfRevision: 5,
    pdfDocumentId: '/project/main.tex',
    pdfDocumentRevision: 3
  })
  useNotificationStore.getState().clearNotifications()
  vi.mocked(window.api.readCompiledPdf).mockResolvedValue({
    data: bytes,
    mimeType: 'application/pdf'
  })
  vi.mocked(window.api.exportPdf).mockResolvedValue({
    outputPath: '/Downloads/main.pdf',
    folderOpened: false
  })
})

const save = () => screen.getByRole('button', { name: 'Save PDF As…' })
const share = () => screen.getByRole('button', { name: 'Share PDF' })
const notifications = () => useNotificationStore.getState().notifications

describe('PDF export controls', () => {
  it('saves the compiled PDF through a native dialog and reports its destination', async () => {
    render(<PdfExportControls />)
    fireEvent.click(save())
    await waitFor(() => expect(notifications()[0]?.message).toContain('/Downloads/main.pdf'))
    expect(window.api.exportPdf).toHaveBeenCalledWith(pdfPath, false)
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })

  it('does not report a cancelled save as success', async () => {
    vi.mocked(window.api.exportPdf).mockResolvedValue(null)
    render(<PdfExportControls />)
    fireEvent.click(save())
    await waitFor(() => expect(save()).toBeEnabled())
    expect(notifications()).toEqual([])
  })

  it.each(['shared', 'cancelled'] as const)(
    'does not export after sharing is %s',
    async (result) => {
      vi.mocked(window.api.sharePdf).mockResolvedValue(result)
      render(<PdfExportControls />)
      fireEvent.click(share())
      await waitFor(() => expect(share()).toBeEnabled())
      expect(window.api.sharePdf).toHaveBeenCalledWith(bytes, 'main.pdf')
      expect(window.api.exportPdf).not.toHaveBeenCalled()
      expect(notifications()).toEqual([])
    }
  )

  it('saves and opens the folder when native file sharing is unavailable', async () => {
    vi.mocked(window.api.sharePdf).mockResolvedValue('unsupported')
    vi.mocked(window.api.exportPdf).mockResolvedValue({
      outputPath: '/Downloads/main.pdf',
      folderOpened: true
    })
    render(<PdfExportControls />)
    fireEvent.click(share())
    await waitFor(() => expect(notifications().at(-1)?.message).toContain('The folder is open'))
    expect(window.api.exportPdf).toHaveBeenCalledWith(pdfPath, true)
  })

  it('keeps the saved path when the folder cannot be opened', async () => {
    vi.mocked(window.api.sharePdf).mockResolvedValue('unsupported')
    render(<PdfExportControls />)
    fireEvent.click(share())
    await waitFor(() => expect(notifications().at(-1)?.tone).toBe('warning'))
    expect(notifications().at(-1)?.message).toContain('/Downloads/main.pdf')
  })

  it.each([
    { pdfPath: null },
    { compileStatus: 'compiling' as const },
    { compileStatus: 'error' as const },
    { pdfDocumentRevision: 2 },
    { pdfDocumentId: '/project/other.tex' }
  ])('disables actions for unavailable or stale PDFs: %j', (patch) => {
    useCompileStore.setState(patch)
    render(<PdfExportControls />)
    expect(save()).toBeDisabled()
    expect(share()).toBeDisabled()
    expect(save()).toHaveAttribute('title', expect.stringContaining('Compile'))
  })

  it.each(['document', 'revision', 'generation', 'tab'])(
    'discards a pending share when the %s changes',
    async (change) => {
      let resolve!: (value: { data: Uint8Array; mimeType: string }) => void
      vi.mocked(window.api.readCompiledPdf).mockReturnValue(new Promise((r) => (resolve = r)))
      render(<PdfExportControls />)
      fireEvent.click(share())
      expect(save()).toBeDisabled()
      expect(share()).toBeDisabled()
      await act(async () => {
        if (change === 'document') useEditorStore.setState({ filePath: '/project/other.tex' })
        if (change === 'revision') useEditorStore.setState({ revision: 4 })
        if (change === 'generation') useCompileStore.setState({ pdfRevision: 6 })
        if (change === 'tab') useEditorStore.setState({ tabMutationEpoch: 2 })
        resolve({ data: bytes, mimeType: 'application/pdf' })
      })
      expect(window.api.sharePdf).not.toHaveBeenCalled()
      expect(window.api.exportPdf).not.toHaveBeenCalled()
    }
  )

  it('flushes buffered edits before deciding whether the PDF is current', () => {
    const unregister = registerPendingDocumentEditFlusher('/project/main.tex', () => {
      useEditorStore.setState({ revision: 4 })
    })
    try {
      render(<PdfExportControls />)
      fireEvent.click(save())
      expect(window.api.exportPdf).not.toHaveBeenCalled()
      expect(notifications()[0]?.message).toContain('Compile')
    } finally {
      unregister()
    }
  })

  it('reports errors and allows retrying', async () => {
    vi.mocked(window.api.exportPdf).mockRejectedValue(new Error('Disk full'))
    render(<PdfExportControls />)
    fireEvent.click(save())
    await waitFor(() => expect(notifications()[0]?.message).toContain('Disk full'))
    expect(save()).toBeEnabled()
  })
})
