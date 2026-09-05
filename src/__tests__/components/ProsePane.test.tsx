import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProsePane } from '../../renderer/components/ProsePane'
import { ProsePreview } from '../../renderer/components/ProsePreview'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { proseAnchorFor, proseModeFor, useUiStore } from '../../renderer/store/useUiStore'
import { PROSE_COMMIT_DELAY_MS } from '../../renderer/constants'

const filePath = '/project/main.tex'
const SOURCE = `\\documentclass{article}
\\newcommand{\\method}{TextEx}

\\begin{document}
\\section{Introduction}
\\label{sec:intro}

We propose \\textbf{\\method}~\\cite{kim2026}.
See Figure~\\ref{fig:arch}.

\\begin{equation}
  y = f(x)
\\end{equation}
\\end{document}`

const applyEdits = vi.spyOn(documentRegistry, 'applyEdits')

function source(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Markdown source' }) as HTMLTextAreaElement
}

describe('ProsePane', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    applyEdits.mockClear()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows the document as one Markdown source', () => {
    render(<ProsePane />)

    expect(source().value).toBe(
      [
        '## Introduction',
        '',
        'We propose **\\method**~\\cite{kim2026}.',
        'See Figure~\\ref{fig:arch}.',
        '',
        '\\begin{equation}',
        '  y = f(x)',
        '\\end{equation}'
      ].join('\n')
    )
  })

  it('carries a PDF passage selection into its projected Markdown text', () => {
    useCompileStore.setState({ pdfRevision: 7 })
    useEditorStore.getState().setPreviewSourceHighlight({
      filePath,
      revision: useEditorStore.getState().revision,
      pdfRevision: 7,
      range: { start: { line: 9, column: 1 }, end: { line: 9, column: 11 } },
      text: 'See Figure'
    })
    render(<ProsePane />)
    const area = source()
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('See Figure')
    expect(area).toHaveFocus()
    expect(documentRegistry.snapshot(filePath)?.text).toBe(SOURCE)
  })

  it('does not restore a PDF selection from an older source revision', () => {
    useCompileStore.setState({ pdfRevision: 7 })
    useEditorStore.getState().setPreviewSourceHighlight({
      filePath,
      revision: useEditorStore.getState().revision - 1,
      pdfRevision: 7,
      range: { start: { line: 9, column: 1 }, end: { line: 9, column: 11 } },
      text: 'See Figure'
    })
    render(<ProsePane />)
    expect(source().selectionStart).toBe(source().selectionEnd)
  })

  it('shows compact writing tools, document statistics and TeX sync state', () => {
    render(<ProsePane />)

    expect(screen.getByRole('toolbar', { name: 'Markdown formatting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bold/u })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('Synced to TeX')
    expect(screen.getByLabelText('Document statistics')).toHaveTextContent(/words/u)
    // The header status is the only sync indicator; the footer used to repeat
    // it as a static claim that stayed cheerful even while an edit was blocked.
    expect(screen.queryByText('Changes sync safely to TeX')).not.toBeInTheDocument()
  })

  it('formats a selection through the safe Markdown-to-TeX round trip', () => {
    render(<ProsePane />)
    const area = source()
    const start = area.value.indexOf('propose')
    area.setSelectionRange(start, start + 'propose'.length)
    fireEvent.select(area)

    fireEvent.click(screen.getByRole('button', { name: /Bold/u }))
    expect(area.value).toContain('We **propose**')
    fireEvent.blur(area)

    expect(documentRegistry.snapshot(filePath)?.text).toContain('We \\textbf{propose}')
  })

  it('supports familiar bold and italic keyboard shortcuts', () => {
    render(<ProsePane />)
    const area = source()
    const start = area.value.indexOf('See Figure')
    area.setSelectionRange(start, start + 3)
    fireEvent.select(area)

    fireEvent.keyDown(area, { key: 'i', ctrlKey: true })
    expect(area.value).toContain('*See* Figure')
  })

  it('disables Markdown formatting inside TeX-controlled blocks', () => {
    render(<ProsePane />)
    const area = source()
    const offset = area.value.indexOf('y = f(x)')
    area.setSelectionRange(offset, offset)
    fireEvent.select(area)

    expect(screen.getByRole('button', { name: /Bold/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Inline code/u })).toBeDisabled()
  })

  it('keeps the preamble, macro and label out of view', () => {
    render(<ProsePane />)

    expect(source().value).not.toContain('\\documentclass')
    expect(source().value).not.toContain('\\newcommand')
    expect(source().value).not.toContain('\\label{sec:intro}')
  })

  it('writes an edited sentence back as a ranged edit', () => {
    render(<ProsePane />)
    const area = source()

    fireEvent.change(area, {
      target: {
        value: area.value.replace(
          'See Figure~\\ref{fig:arch}.',
          'See Figure~\\ref{fig:arch} for the layout.'
        )
      }
    })
    fireEvent.blur(area)

    expect(applyEdits).toHaveBeenCalledOnce()
    const [targetPath, origin, edits] = applyEdits.mock.calls[0]
    expect(targetPath).toBe(filePath)
    expect(origin).toBe('prose-view')
    expect(edits).toHaveLength(1)
    expect(edits[0].text).toBe(
      'We propose \\textbf{\\method}~\\cite{kim2026}.\nSee Figure~\\ref{fig:arch} for the layout.'
    )
  })

  it('does nothing when the author changed nothing', () => {
    render(<ProsePane />)
    fireEvent.blur(source())
    expect(applyEdits).not.toHaveBeenCalled()
  })

  it('refuses an edit inside an equation and says why', () => {
    render(<ProsePane />)
    const area = source()

    fireEvent.change(area, { target: { value: area.value.replace('y = f(x)', 'y = g(x)') } })
    fireEvent.blur(area)

    expect(applyEdits).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Equations, figures and tables are edited/u)
  })

  it('restores the projected source on Escape', () => {
    render(<ProsePane />)
    const area = source()
    const original = area.value

    fireEvent.change(area, { target: { value: 'wiped' } })
    fireEvent.keyDown(area, { key: 'Escape' })

    expect(area.value).toBe(original)
    fireEvent.blur(area)
    expect(applyEdits).not.toHaveBeenCalled()
  })

  it('writes back as the author types, without waiting for focus to leave', () => {
    render(<ProsePane />)
    const area = source()

    fireEvent.change(area, {
      target: {
        value: area.value.replace(
          'See Figure~\\ref{fig:arch}.',
          'See Figure~\\ref{fig:arch} for the layout.'
        )
      }
    })
    expect(applyEdits).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(PROSE_COMMIT_DELAY_MS)
    })
    expect(applyEdits).toHaveBeenCalledOnce()
  })

  it('commits one edit for a burst of keystrokes', () => {
    render(<ProsePane />)
    const area = source()
    const original = area.value

    for (const suffix of ['a', 'ab', 'abc']) {
      fireEvent.change(area, {
        target: { value: original.replace('fig:arch}.', `fig:arch}, ${suffix}.`) }
      })
      act(() => {
        vi.advanceTimersByTime(PROSE_COMMIT_DELAY_MS / 4)
      })
    }
    expect(applyEdits).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(PROSE_COMMIT_DELAY_MS)
    })
    expect(applyEdits).toHaveBeenCalledOnce()
  })

  it('flushes a pending edit when the view closes', () => {
    const { unmount } = render(<ProsePane />)
    const area = source()

    fireEvent.change(area, {
      target: {
        value: area.value.replace(
          'See Figure~\\ref{fig:arch}.',
          'See Figure~\\ref{fig:arch} for the layout.'
        )
      }
    })
    // React fires no blur on unmount, so switching back to TeX with the
    // keyboard used to drop the edit outright.
    unmount()

    expect(applyEdits).toHaveBeenCalledOnce()
    expect(applyEdits.mock.calls[0][2][0].text).toContain('for the layout.')
  })

  it('flushes a pending edit to its original document when the active tab changes', () => {
    const otherPath = '/project/other.tex'
    const otherSource = SOURCE.replace('Introduction', 'Other document')
    useEditorStore.getState().openFileInTab(otherPath, otherSource)
    useEditorStore.getState().setActiveTab(filePath)

    function KeyedPane() {
      const activePath = useEditorStore((state) => state.filePath)
      return <ProsePane key={activePath} />
    }

    render(<KeyedPane />)
    const area = source()
    fireEvent.change(area, {
      target: { value: area.value.replace('We propose', 'We safely propose') }
    })

    act(() => useEditorStore.getState().setActiveTab(otherPath))

    expect(documentRegistry.snapshot(filePath)?.text).toContain('We safely propose')
    expect(documentRegistry.snapshot(otherPath)?.text).toBe(otherSource)
  })
})

describe('ProsePreview', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
  })

  afterEach(cleanup)

  it('renders headings and prose, keeping citations and references visible', () => {
    render(<ProsePreview />)

    expect(screen.getByRole('heading', { name: 'Introduction' })).toBeInTheDocument()
    // The citation stays legible as a chip rather than dissolving into the text.
    expect(screen.getByTitle('\\cite{kim2026}')).toHaveTextContent('kim2026')
    expect(screen.getByTitle('\\ref{fig:arch}')).toHaveTextContent('fig:arch')
  })

  it('renders an equation rather than showing its source', () => {
    const { container } = render(<ProsePreview />)

    const math = container.querySelector('.prose-preview__math')
    expect(math).not.toBeNull()
    expect(math?.querySelector('.katex')).not.toBeNull()
  })

  it('never shows the preamble', () => {
    const { container } = render(<ProsePreview />)
    expect(container.textContent).not.toContain('documentclass')
  })
})

describe('ProsePreview figures', () => {
  const FIGURE = `\\begin{document}
\\section{Results}

Prose before the figure.

\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.8\\linewidth]{images/pipeline.png}
  \\caption{Our \\textbf{pipeline}.}
  \\label{fig:one}
\\end{figure}
\\end{document}`

  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/paper.tex', FIGURE)
    useProjectStore.setState({ projectRoot: '/project' })
  })

  afterEach(cleanup)

  it('shows the real image, resolved against the project root', async () => {
    const readFileBase64 = vi
      .fn()
      .mockResolvedValue({ data: 'data:image/png;base64,AAAA', mimeType: 'image/png' })
    Object.assign(window.api, { readFileBase64 })

    render(<ProsePreview />)

    const image = (await screen.findByRole('img')) as HTMLImageElement
    expect(image.src).toBe('data:image/png;base64,AAAA')
    expect(readFileBase64).toHaveBeenCalledWith('/project/images/pipeline.png')
    // The caption keeps its inline formatting.
    expect(screen.getByText('pipeline').tagName).toBe('STRONG')
  })

  it('falls back to the source when the graphic cannot be read', async () => {
    Object.assign(window.api, {
      readFileBase64: vi.fn().mockRejectedValue(new Error('missing'))
    })
    // A path of its own: successful reads are cached across documents.
    useEditorStore
      .getState()
      .openFileInTab('/project/other.tex', FIGURE.replace('pipeline.png', 'absent.png'))

    const { container } = render(<ProsePreview />)

    await vi.waitFor(() => {
      expect(container.querySelector('.prose-preview__protected')).not.toBeNull()
    })
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.textContent).toContain('includegraphics')
  })
})

describe('prose view anchoring', () => {
  /** Derived rather than hard-coded, so the fixture can grow safely. */
  const paragraphLine = SOURCE.split('\n').findIndex((line) => line.startsWith('We propose')) + 1

  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
    useUiStore.setState({ proseAnchors: {}, proseModeDocumentIds: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('publishes the block the caret sits in', () => {
    render(<ProsePane />)
    const area = source()

    // Put the caret in the paragraph rather than the heading.
    const offset = area.value.indexOf('See Figure')
    area.setSelectionRange(offset, offset)
    fireEvent.select(area)

    expect(proseAnchorFor(useUiStore.getState(), filePath)).toEqual({
      line: paragraphLine,
      origin: 'source'
    })
  })

  it('publishes the first visible block while scrolling without navigation focus', async () => {
    render(<ProsePane />)
    const area = source()
    area.style.fontSize = '10px'
    area.style.lineHeight = '2'
    area.scrollTop = 42
    fireEvent.scroll(area)

    await vi.waitFor(() => {
      expect(proseAnchorFor(useUiStore.getState(), filePath)).toEqual({
        line: paragraphLine,
        origin: 'source',
        intent: 'scroll'
      })
    })
  })

  it('moves the caret when the rendering picks a passage', () => {
    render(<ProsePane />)
    const area = source()
    area.setSelectionRange(0, 0)

    act(() => {
      useUiStore.getState().setProseAnchor(filePath, paragraphLine, 'preview')
    })

    const caretLine = area.value.slice(0, area.selectionStart).split('\n').length
    expect(area.value.split('\n')[caretLine - 1]).toContain('We propose')
    expect(area).toHaveFocus()
  })

  it('takes focus when a TeX-to-prose switch supplies the source anchor', () => {
    render(<ProsePane />)
    const area = source()

    act(() => {
      useUiStore.getState().setProseAnchor(filePath, paragraphLine, 'tex')
    })

    expect(area).toHaveFocus()
    const caretLine = area.value.slice(0, area.selectionStart).split('\n').length
    expect(area.value.split('\n')[caretLine - 1]).toContain('We propose')
  })

  it('ignores its own anchor so the two sides cannot echo', () => {
    render(<ProsePane />)
    const area = source()
    area.setSelectionRange(0, 0)

    act(() => {
      useUiStore.getState().setProseAnchor(filePath, paragraphLine, 'source')
    })

    expect(area.selectionStart).toBe(0)
  })
})

describe('ProsePreview anchoring', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
    useUiStore.setState({ proseAnchors: {}, proseModeDocumentIds: [] })
  })

  afterEach(cleanup)

  it('labels every block with the source line it came from', () => {
    const { container } = render(<ProsePreview />)
    const lines = [...container.querySelectorAll('[data-prose-line]')].map((node) =>
      Number(node.getAttribute('data-prose-line'))
    )

    expect(lines.length).toBeGreaterThan(0)
    expect(lines).toEqual([...lines].sort((left, right) => left - right))
  })

  it('publishes a passage when the reader clicks it', () => {
    const line = SOURCE.split('\n').findIndex((text) => text.startsWith('We propose')) + 1
    const { container } = render(<ProsePreview />)

    fireEvent.click(container.querySelector(`[data-prose-line="${line}"]`)!)

    expect(proseAnchorFor(useUiStore.getState(), filePath)).toEqual({
      line,
      origin: 'preview'
    })
  })

  it('marks the passage shared with the editor and exposes an edit affordance', () => {
    const line = SOURCE.split('\n').findIndex((text) => text.startsWith('We propose')) + 1
    act(() => useUiStore.getState().setProseAnchor(filePath, line, 'source'))
    const { container } = render(<ProsePreview />)

    const block = container.querySelector(`[data-prose-line="${line}"]`)
    expect(block).toHaveClass('prose-preview__block--active')
    expect(block).toHaveAttribute('aria-current', 'location')
    const markdownActions = screen.getAllByRole('button', {
      name: 'Edit this block in Markdown'
    })
    const texActions = screen.getAllByRole('button', { name: 'Edit this block in TeX' })
    expect(markdownActions.length + texActions.length).toBe(
      container.querySelectorAll('[data-prose-line]').length
    )
  })

  it('takes a protected block to its canonical TeX source', () => {
    act(() => useUiStore.getState().setProseMode(filePath, true))
    render(<ProsePreview />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit this block in TeX' }))

    expect(proseModeFor(useUiStore.getState(), filePath)).toBe(false)
    expect(proseAnchorFor(useUiStore.getState(), filePath)?.origin).toBe('preview')
  })

  it('does not echo a scroll anchor back across panes on the same block', () => {
    act(() => useUiStore.getState().setProseAnchor(filePath, 8, 'source', 'scroll'))
    const original = proseAnchorFor(useUiStore.getState(), filePath)

    act(() => useUiStore.getState().setProseAnchor(filePath, 8, 'preview', 'scroll'))

    expect(proseAnchorFor(useUiStore.getState(), filePath)).toBe(original)
    expect(proseAnchorFor(useUiStore.getState(), filePath)?.origin).toBe('source')
  })
})
