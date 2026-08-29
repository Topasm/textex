import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProsePane } from '../../renderer/components/ProsePane'
import { ProsePreview } from '../../renderer/components/ProsePreview'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { setActiveEditorAdapter } from '../../renderer/editor/activeEditorAdapter'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'

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
    applyEdits.mockClear()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
    setActiveEditorAdapter({ applyEdits } as unknown as EditorAdapter)
  })

  afterEach(() => {
    cleanup()
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
