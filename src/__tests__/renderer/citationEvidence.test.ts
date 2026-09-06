import { beforeEach, expect, it, vi } from 'vitest'
import {
  evidenceQuoteMatches,
  isRelativeEvidencePdf,
  parseCitationEvidence,
  type CitationEvidence
} from '../../shared/citationEvidence'
import {
  loadCitationEvidence,
  saveCitationEvidence,
  removeCitationEvidence
} from '../../renderer/services/citationEvidence'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const root = '/project'
const path = '/project/citation-evidence.json'
const entry: CitationEvidence = {
  id: 'a2345678-1234-1234-1234-123456789abc',
  citekey: 'paper2026',
  pdf: 'references/source.pdf',
  page: 2,
  quote: 'The result is significant.',
  sha256: 'a'.repeat(64),
  savedAt: '2026-09-06T00:00:00.000Z'
}
let content: string | null
beforeEach(() => {
  vi.clearAllMocks()
  content = null
  useProjectStore.setState({ projectRoot: root })
  vi.mocked(window.api.readDirectory).mockImplementation(async () =>
    content === null ? [] : [{ name: 'citation-evidence.json', path, type: 'file' }]
  )
  vi.mocked(window.api.readFile).mockImplementation(async () => ({
    filePath: path,
    content: content!
  }))
  vi.mocked(window.api.saveFile).mockImplementation(async (next) => {
    content = next
    return { success: true }
  })
})
it('matches normalized whitespace and ligatures, without fuzzy or invented evidence', () => {
  expect(evidenceQuoteMatches('The efﬁcient\nmethod works.', 'efficient method')).toBe(true)
  expect(evidenceQuoteMatches('The method failed.', 'The method worked.')).toBe(false)
  expect(evidenceQuoteMatches('any text', '   ')).toBe(false)
})
it.each([
  '../secret.pdf',
  '/outside.pdf',
  'C:\\outside.pdf',
  'refs/../outside.pdf',
  'refs/source.tex'
])('rejects invalid source paths: %s', (pdf) => {
  expect(isRelativeEvidencePdf(pdf)).toBe(false)
  expect(() =>
    parseCitationEvidence(JSON.stringify({ version: 1, entries: [{ ...entry, pdf }] }))
  ).toThrow()
})
it('round trips evidence and serializes simultaneous saves without losing entries', async () => {
  await Promise.all([
    saveCitationEvidence(root, entry, new AbortController().signal),
    saveCitationEvidence(
      root,
      { ...entry, id: 'b2345678-1234-1234-1234-123456789abc' },
      new AbortController().signal
    )
  ])
  expect(await loadCitationEvidence(root)).toHaveLength(2)
  await removeCitationEvidence(root, entry.id, new AbortController().signal)
  expect(await loadCitationEvidence(root)).toMatchObject([
    { id: 'b2345678-1234-1234-1234-123456789abc' }
  ])
})
it('does not overwrite malformed existing data', async () => {
  content = 'unrelated user content'
  await expect(saveCitationEvidence(root, entry, new AbortController().signal)).rejects.toThrow()
  expect(window.api.saveFile).not.toHaveBeenCalled()
  expect(content).toBe('unrelated user content')
})
it('does not save after cancellation or a project change while loading', async () => {
  const abort = new AbortController()
  abort.abort()
  await expect(saveCitationEvidence(root, entry, abort.signal)).rejects.toThrow()
  vi.mocked(window.api.readDirectory).mockImplementation(async () => {
    useProjectStore.setState({ projectRoot: '/other' })
    return []
  })
  await expect(saveCitationEvidence(root, entry, new AbortController().signal)).rejects.toThrow(
    /project changed/
  )
  expect(window.api.saveFile).not.toHaveBeenCalled()
})
it('preserves native containment failures without replacing the file', async () => {
  content = JSON.stringify({ version: 1, entries: [entry] })
  vi.mocked(window.api.readFile).mockRejectedValue(new Error('Outside project'))
  await expect(saveCitationEvidence(root, entry, new AbortController().signal)).rejects.toThrow(
    'Outside project'
  )
  expect(window.api.saveFile).not.toHaveBeenCalled()
})
it('rejects duplicate ids and invalid pages on disk', () => {
  expect(() =>
    parseCitationEvidence(JSON.stringify({ version: 1, entries: [entry, entry] }))
  ).toThrow()
  expect(() =>
    parseCitationEvidence(JSON.stringify({ version: 1, entries: [{ ...entry, page: 0 }] }))
  ).toThrow()
})
