import { useUiStore } from '../../renderer/store/useUiStore'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import PdfSentenceEditor from '../../renderer/components/PdfSentenceEditor'
import {
  createPdfSentenceTarget,
  type PdfSentenceSelection
} from '../../renderer/services/pdfSentenceEditing'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

const path = '/project/main.tex'
const source = 'First sentence. Original sentence. Last sentence.'
let selection: PdfSentenceSelection
let compile: Mock<() => Promise<void>>
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
  window.api.aiProcessCustom = vi.fn().mockResolvedValue('Polished sentence.')
  selection = {
    id: 1,
    text: 'Original sentence.',
    loading: false,
    target: createPdfSentenceTarget(
      path,
      path,
      documentRegistry.snapshot(path)!,
      { start: { line: 1, column: 17 }, end: { line: 1, column: 35 } },
      'Original sentence.',
      1
    )
  }
  compile = vi.fn().mockImplementation(async () => {
    const snapshot = documentRegistry.snapshot(path)!
    useCompileStore
      .getState()
      .setPdfPath('/cache/main.pdf', { documentId: path, revision: snapshot.revision })
    useCompileStore.getState().setCompileStatus('success')
  })
})
it('prefills the sentence, applies a manual edit, refreshes the PDF, and supports undo', async () => {
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={compile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit manually' }))
  const field = screen.getByRole('textbox', { name: 'Sentence' })
  expect(field).toHaveValue('Original sentence.')
  fireEvent.change(field, { target: { value: 'Improved sentence.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply and refresh PDF' }))
  expect(await screen.findByText('PDF refreshed.')).toBeVisible()
  expect(documentRegistry.snapshot(path)?.text).toBe(
    'First sentence. Improved sentence. Last sentence.'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Undo this edit' }))
  expect(
    await screen.findByText('The sentence edit was undone and the PDF refreshed.')
  ).toBeVisible()
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
  expect(compile).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('shows AI output for review and does not apply until requested', async () => {
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={compile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Polish with AI' }))
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Polished sentence.'))
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
  expect(compile).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply and refresh PDF' }))
  expect(await screen.findByText('PDF refreshed.')).toBeVisible()
})
it('keeps manual editing available without AI configuration', () => {
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, aiEnabled: false } }))
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={compile} />)
  expect(screen.getByRole('button', { name: 'Polish with AI' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Edit manually' })).toBeEnabled()
})
it('disables application when the source changes while the draft is open', () => {
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={compile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit manually' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My draft.' } })
  act(() => useEditorStore.getState().updateActiveDocument('Newer text'))
  expect(screen.getByRole('button', { name: 'Apply and refresh PDF' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('source or PDF changed')
})
it('reports compile failure while retaining the applied edit and undo', async () => {
  compile.mockImplementation(async () => {
    useCompileStore.getState().setCompileStatus('error')
  })
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={compile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit manually' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed sentence.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply and refresh PDF' }))
  expect(await screen.findByText(/source was updated, but the PDF/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Undo this edit' })).toBeEnabled()
  expect(documentRegistry.snapshot(path)?.text).toContain('Changed sentence.')
})
it('shows an unmapped sentence without offering a destructive fallback edit', () => {
  render(
    <PdfSentenceEditor
      selection={{ ...selection, target: null }}
      onClose={vi.fn()}
      onCompile={compile}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('could not be matched safely')
  expect(screen.queryByRole('button', { name: 'Edit manually' })).not.toBeInTheDocument()
})

it('edits an included file but recompiles the document that produced the PDF', async () => {
  const included = '/project/chapter.tex'
  useEditorStore.getState().openFileInTab(included, source)
  selection.target = createPdfSentenceTarget(
    included,
    path,
    documentRegistry.snapshot(included)!,
    { start: { line: 1, column: 17 }, end: { line: 1, column: 35 } },
    selection.text,
    1
  )
  window.api.readFile = vi.fn().mockResolvedValue({ filePath: included, content: source })
  let compiledPath: string | null = null
  const onCompile = async () => {
    compiledPath = useEditorStore.getState().filePath
    await compile()
  }
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={onCompile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit manually' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Improved chapter sentence.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply and refresh PDF' }))
  expect(await screen.findByText('PDF refreshed.')).toBeVisible()
  expect(compiledPath).toBe(path)
  expect(documentRegistry.snapshot(included)?.text).toContain('Improved chapter sentence.')
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
})

it('resets a draft without changing the document and applies with the keyboard', async () => {
  const close = vi.fn()
  render(<PdfSentenceEditor selection={selection} onClose={close} onCompile={compile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit manually' }))
  const field = screen.getByRole('textbox')
  fireEvent.change(field, { target: { value: 'Discard this draft.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset draft' }))
  expect(field).toHaveValue('Original sentence.')
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
  expect(compile).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'Reviewed sentence.' } })
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
  expect(await screen.findByText('PDF refreshed.')).toBeVisible()
  expect(screen.getByText('Applied sentence')).toBeVisible()
  expect(screen.getByText('Reviewed sentence.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(close).toHaveBeenCalledOnce()
})

it('opens AI settings without discarding a manual draft', () => {
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, aiEnabled: false } }))
  useUiStore.setState({ settingsRequested: false })
  render(<PdfSentenceEditor selection={selection} onClose={vi.fn()} onCompile={compile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit manually' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep my draft.' } })
  fireEvent.click(screen.getByRole('button', { name: 'AI settings' }))
  expect(useUiStore.getState().settingsRequested).toBe(true)
  expect(screen.getByRole('textbox')).toHaveValue('Keep my draft.')
})
