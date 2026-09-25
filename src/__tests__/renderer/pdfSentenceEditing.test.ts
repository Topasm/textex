import { beforeEach, expect, it, vi } from 'vitest'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import {
  applyPdfSentence,
  createPdfSentenceTarget,
  refinePdfSentence
} from '../../renderer/services/pdfSentenceEditing'
import { previewSourceRange } from '../../renderer/utils/previewSelection'

const path = '/project/main.tex'
const source =
  '\\begin{document}\nFirst sentence. The \\textbf{efficient} method works. Last sentence.\n\\end{document}'
const pdfText = 'The efficient method works.'
const target = () =>
  createPdfSentenceTarget(
    path,
    path,
    documentRegistry.snapshot(path)!,
    previewSourceRange(source, pdfText, 2, 2)!,
    pdfText,
    1
  )!
const signal = () => new AbortController().signal
beforeEach(() => {
  useEditorStore.getState().resetEditor()
  useEditorStore.getState().openFileInTab(path, source)
  useProjectStore.setState({ projectRoot: '/project' })
  useCompileStore.setState({
    pdfRevision: 1,
    pdfDocumentId: path,
    pdfDocumentRevision: 0,
    compileStatus: 'success'
  })
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, aiEnabled: true } }))
  window.api.readFile = vi.fn().mockResolvedValue({ filePath: path, content: source })
  window.api.aiProcessCustom = vi
    .fn()
    .mockResolvedValue('The \\textbf{efficient} method performs well.')
})
it('captures an exact formatted sentence and replaces only that range with undo', async () => {
  const selected = target()
  expect(selected.original).toBe('The \\textbf{efficient} method works.')
  const applied = await applyPdfSentence(selected, 'A clearer sentence.', signal())
  expect(documentRegistry.snapshot(path)?.text).toBe(
    source.replace(selected.original, 'A clearer sentence.')
  )
  expect(documentRegistry.getModel(path)?.isDirty).toBe(true)
  expect(window.api.readFile).toHaveBeenCalledWith(path)
  expect(applied.undo()).toBe(true)
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
  expect(applied.undo()).toBe(false)
})
it('does not turn an ambiguous navigation fallback into an editable target', () => {
  const text = 'Repeated sentence. Repeated sentence.'
  useEditorStore.getState().updateActiveDocument(text)
  expect(
    createPdfSentenceTarget(
      path,
      path,
      documentRegistry.snapshot(path)!,
      previewSourceRange(text, 'Repeated sentence.', 1, 1)!,
      'Repeated sentence.',
      1
    )
  ).toBeNull()
})
it('refuses a sentence that cuts through a formatting group', () => {
  const text = '\\textbf{First sentence. Second sentence.}'
  useEditorStore.getState().updateActiveDocument(text)
  expect(
    createPdfSentenceTarget(
      path,
      path,
      documentRegistry.snapshot(path)!,
      previewSourceRange(text, 'Second sentence.', 1, 1)!,
      'Second sentence.',
      1
    )
  ).toBeNull()
})
it('generates an AI suggestion without applying it', async () => {
  expect(await refinePdfSentence(target(), target().original)).toContain('performs well')
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
  expect(window.api.aiProcessCustom).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: path, selectedText: target().original })
  )
})
it.each(['edit', 'project', 'pdf', 'tab'] as const)(
  'rejects delayed AI suggestions after %s changes',
  async (change) => {
    let resolve!: (text: string) => void
    window.api.aiProcessCustom = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const selected = target()
    const promise = refinePdfSentence(selected, selected.original)
    if (change === 'edit') useEditorStore.getState().updateActiveDocument('New text')
    if (change === 'project') useProjectStore.setState({ projectRoot: '/other' })
    if (change === 'pdf') useCompileStore.setState({ pdfRevision: 2 })
    if (change === 'tab') useEditorStore.getState().openFileInTab('/project/other.tex', 'Other')
    resolve('Stale suggestion.')
    await expect(promise).rejects.toThrow(/source or PDF changed/)
  }
)
it.each(['', '```latex\nNew sentence.\n```', '\\textbf{Broken sentence.'])(
  'rejects invalid replacements %j',
  async (draft) => {
    await expect(applyPdfSentence(target(), draft, signal())).rejects.toThrow()
    expect(documentRegistry.snapshot(path)?.text).toBe(source)
  }
)
it('refuses changed disk contents and native boundary failures', async () => {
  window.api.readFile = vi.fn().mockResolvedValue({ filePath: path, content: 'Changed externally' })
  await expect(applyPdfSentence(target(), 'New sentence.', signal())).rejects.toThrow(
    /source or PDF changed/
  )
  window.api.readFile = vi.fn().mockRejectedValue(new Error('Outside project'))
  await expect(applyPdfSentence(target(), 'New sentence.', signal())).rejects.toThrow(
    'Outside project'
  )
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
})
it('does not apply after the sentence editor closes during the native read', async () => {
  const controller = new AbortController()
  window.api.readFile = vi.fn().mockImplementation(async () => {
    controller.abort()
    return { filePath: path, content: source }
  })
  await expect(applyPdfSentence(target(), 'New sentence.', controller.signal)).rejects.toThrow()
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
})
it('does not undo over a subsequent source edit', async () => {
  const applied = await applyPdfSentence(target(), 'New sentence.', signal())
  useEditorStore.getState().updateActiveDocument('Later edit')
  expect(applied.undo()).toBe(false)
  expect(documentRegistry.snapshot(path)?.text).toBe('Later edit')
})
