import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProsePane } from '../../renderer/components/ProsePane'
import { ProsePreview } from '../../renderer/components/ProsePreview'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { setActiveEditorAdapter } from '../../renderer/editor/activeEditorAdapter'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'
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

const applyEdits = vi.fn()

function source(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Markdown source' }) as HTMLTextAreaElement
}

describe('ProsePane', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    applyEdits.mockClear()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
    setActiveEditorAdapter({ applyEdits } as unknown as EditorAdapter)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    setActiveEditorAdapter(null)
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
    const [origin, edits] = applyEdits.mock.calls[0]
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
    expect(applyEdits.mock.calls[0][1][0].text).toContain('for the layout.')
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
