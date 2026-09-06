import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readEvidencePage } from '../../renderer/services/pdfEvidence'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), getPage: vi.fn(), destroy: vi.fn() }))
vi.mock('react-pdf', () => ({ pdfjs: { getDocument: mocks.getDocument, GlobalWorkerOptions: {} } }))
beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ projectRoot: '/project' })
  vi.stubGlobal('crypto', {
    subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) }
  })
  window.api.readFileBase64 = vi.fn().mockResolvedValue({
    data: 'data:application/pdf;base64,JVBERg==',
    mimeType: 'application/pdf'
  })
  mocks.getPage.mockResolvedValue({
    getTextContent: async () => ({ items: [{ str: 'Page content.', hasEOL: true }] })
  })
  mocks.destroy.mockResolvedValue(undefined)
  mocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }),
    destroy: mocks.destroy
  })
})
afterEach(() => vi.unstubAllGlobals())
it('reads through the native boundary, fingerprints bytes and releases the worker document', async () => {
  const result = await readEvidencePage(
    '/project',
    'refs/paper.pdf',
    2,
    new AbortController().signal
  )
  expect(window.api.readFileBase64).toHaveBeenCalledWith('/project/refs/paper.pdf')
  expect(result).toMatchObject({ text: 'Page content.', page: 2, pages: 2, sha256: '0'.repeat(64) })
  expect(mocks.destroy).toHaveBeenCalledOnce()
})
it('rejects outside paths before native access', async () => {
  await expect(
    readEvidencePage('/project', '../paper.pdf', 1, new AbortController().signal)
  ).rejects.toThrow()
  expect(window.api.readFileBase64).not.toHaveBeenCalled()
})
it('rejects nonexistent pages and still destroys the document', async () => {
  await expect(
    readEvidencePage('/project', 'paper.pdf', 3, new AbortController().signal)
  ).rejects.toThrow(/valid PDF/)
  expect(mocks.destroy).toHaveBeenCalledOnce()
})
it('rejects a stale native result before creating a worker', async () => {
  vi.mocked(window.api.readFileBase64).mockImplementation(async () => {
    useProjectStore.setState({ projectRoot: '/other' })
    return { data: 'data:application/pdf;base64,JVBERg==', mimeType: 'application/pdf' }
  })
  await expect(
    readEvidencePage('/project', 'paper.pdf', 1, new AbortController().signal)
  ).rejects.toThrow(/project changed/)
  expect(mocks.getDocument).not.toHaveBeenCalled()
})
it('reports image-only pages without manufacturing text', async () => {
  mocks.getPage.mockResolvedValue({ getTextContent: async () => ({ items: [] }) })
  await expect(
    readEvidencePage('/project', 'paper.pdf', 1, new AbortController().signal)
  ).rejects.toThrow(/No extractable text/)
  expect(mocks.destroy).toHaveBeenCalledOnce()
})
