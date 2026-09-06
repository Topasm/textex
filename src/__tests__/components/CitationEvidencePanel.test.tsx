import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import CitationEvidencePanel from '../../renderer/components/research/CitationEvidencePanel'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import {
  loadCitationEvidence,
  saveCitationEvidence
} from '../../renderer/services/citationEvidence'
import { readEvidencePage } from '../../renderer/services/pdfEvidence'

vi.mock('../../renderer/services/citationEvidence', () => ({
  loadCitationEvidence: vi.fn(),
  saveCitationEvidence: vi.fn(),
  removeCitationEvidence: vi.fn(),
  subscribeCitationEvidence: () => () => {}
}))
vi.mock('../../renderer/services/pdfEvidence', () => ({ readEvidencePage: vi.fn() }))
const source = {
  pdf: 'reference.pdf',
  page: 1,
  pages: 2,
  text: 'The efficient method works.',
  sha256: 'a'.repeat(64)
}
beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ projectRoot: '/project' })
  vi.mocked(loadCitationEvidence).mockResolvedValue([])
  vi.mocked(saveCitationEvidence).mockResolvedValue(undefined)
  vi.mocked(readEvidencePage).mockResolvedValue(source)
  window.api.getProjectIndex = vi.fn().mockResolvedValue({
    root: '/project',
    generation: 1,
    entries: [
      {
        path: '/project/reference.pdf',
        relativePath: 'reference.pdf',
        name: 'reference.pdf',
        parentRelativePath: '',
        type: 'file'
      }
    ]
  })
})
async function read() {
  render(<CitationEvidencePanel citekey="method2026" />)
  await screen.findByRole('option', { name: 'reference.pdf' })
  fireEvent.change(screen.getByLabelText('Reference PDF'), { target: { value: 'reference.pdf' } })
  fireEvent.click(screen.getByRole('button', { name: 'Read page' }))
  await screen.findByLabelText('Page text · select an excerpt')
}
it('requires a matching excerpt and re-reads the PDF before saving', async () => {
  await read()
  fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'fabricated claim' } })
  expect(screen.getByRole('button', { name: 'Save excerpt' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'efficient method' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save excerpt' }))
  await waitFor(() => expect(saveCitationEvidence).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Read page' })).toHaveFocus())
  expect(screen.queryByLabelText('Page text · select an excerpt')).not.toBeInTheDocument()
  expect(readEvidencePage).toHaveBeenCalledTimes(2)
  expect(saveCitationEvidence).toHaveBeenCalledWith(
    '/project',
    expect.objectContaining({
      citekey: 'method2026',
      page: 1,
      quote: 'efficient method',
      sha256: source.sha256
    }),
    expect.any(AbortSignal)
  )
})
it('does not save when source bytes changed after reading', async () => {
  await read()
  vi.mocked(readEvidencePage).mockResolvedValue({ ...source, sha256: 'b'.repeat(64) })
  fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'efficient method' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save excerpt' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('PDF has changed')
  expect(saveCitationEvidence).not.toHaveBeenCalled()
})
it('aborts pending extraction when the panel closes', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(readEvidencePage).mockImplementation(async (_root, _path, _page, request) => {
    signal = request
    return new Promise(() => {})
  })
  const view = render(<CitationEvidencePanel citekey="method2026" />)
  await screen.findByRole('option', { name: 'reference.pdf' })
  fireEvent.change(screen.getByLabelText('Reference PDF'), { target: { value: 'reference.pdf' } })
  fireEvent.click(screen.getByRole('button', { name: 'Read page' }))
  view.unmount()
  expect(signal?.aborted).toBe(true)
})
it('does not reuse a page result after the page input changes', async () => {
  await read()
  act(() => fireEvent.change(screen.getByLabelText('PDF page'), { target: { value: '2' } }))
  expect(screen.queryByLabelText('Page text · select an excerpt')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save excerpt' })).not.toBeInTheDocument()
})
