import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProsePane } from '../../renderer/components/ProsePane'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { setActiveEditorAdapter } from '../../renderer/editor/activeEditorAdapter'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'

const filePath = '/project/main.tex'
const SOURCE = `\\documentclass{article}

\\begin{document}
\\section{Introduction}
\\label{sec:intro}

We propose \\textbf{TextEx}~\\cite{kim2026}.

\\begin{equation}
  y = f(x)
\\end{equation}
\\end{document}`

const applyEdits = vi.fn()

function installAdapter(): void {
  setActiveEditorAdapter({ applyEdits } as unknown as EditorAdapter)
}

describe('ProsePane', () => {
  beforeEach(() => {
    applyEdits.mockClear()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, SOURCE)
    installAdapter()
  })

  afterEach(() => {
    cleanup()
    setActiveEditorAdapter(null)
  })

  it('shows headings and prose as editable fields', () => {
    render(<ProsePane />)

    const fields = screen.getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(fields.map((field) => field.value)).toEqual([
      '## Introduction',
      'We propose **TextEx**~\\cite{kim2026}.'
    ])
  })

  it('keeps math out of the editable surface and offers a jump to TeX', () => {
    render(<ProsePane />)

    const card = screen.getByRole('button', { name: /equation block at line 9/u })
    expect(card).toHaveTextContent('y = f(x)')

    fireEvent.click(card)
    expect(useEditorStore.getState().pendingJump?.line).toBe(9)
  })

  it('writes an edited paragraph back as one ranged edit', () => {
    render(<ProsePane />)

    const paragraph = screen.getByDisplayValue('We propose **TextEx**~\\cite{kim2026}.')
    fireEvent.change(paragraph, {
      target: { value: 'We propose **TextEx**~\\cite{kim2026}, a fast editor.' }
    })
    fireEvent.blur(paragraph)

    expect(applyEdits).toHaveBeenCalledOnce()
    const [source, edits] = applyEdits.mock.calls[0]
    expect(source).toBe('prose-view')

    // The replacement covers exactly the paragraph's own line, nothing more.
    const paragraphLine = 7
    const original = SOURCE.split('\n')[paragraphLine - 1]
    expect(original).toBe('We propose \\textbf{TextEx}~\\cite{kim2026}.')
    expect(edits).toEqual([
      {
        range: {
          start: { line: paragraphLine, column: 1 },
          end: { line: paragraphLine, column: original.length + 1 }
        },
        text: 'We propose \\textbf{TextEx}~\\cite{kim2026}, a fast editor.',
        forceMoveMarkers: true
      }
    ])
  })

  it('rewrites only the braces when a heading title changes', () => {
    render(<ProsePane />)

    const heading = screen.getByDisplayValue('## Introduction')
    fireEvent.change(heading, { target: { value: '## Motivation' } })
    fireEvent.blur(heading)

    // Only the braces move: `\\section{` and the closing brace stay put, so a
    // `\\label` or a starred variant on the same construct cannot be lost.
    const headingLine = 4
    const original = SOURCE.split('\n')[headingLine - 1]
    const startColumn = original.indexOf('{') + 2
    const endColumn = original.indexOf('}') + 1
    expect(original.slice(startColumn - 1, endColumn - 1)).toBe('Introduction')
    expect(applyEdits.mock.calls[0][1]).toEqual([
      {
        range: {
          start: { line: headingLine, column: startColumn },
          end: { line: headingLine, column: endColumn }
        },
        text: 'Motivation',
        forceMoveMarkers: true
      }
    ])
  })

  it('does not touch the document when nothing changed', () => {
    render(<ProsePane />)

    const paragraph = screen.getByDisplayValue('We propose **TextEx**~\\cite{kim2026}.')
    fireEvent.blur(paragraph)

    expect(applyEdits).not.toHaveBeenCalled()
  })

  it('restores the projected text when the author presses Escape', () => {
    render(<ProsePane />)

    const paragraph = screen.getByDisplayValue(
      'We propose **TextEx**~\\cite{kim2026}.'
    ) as HTMLTextAreaElement
    fireEvent.change(paragraph, { target: { value: 'abandoned' } })
    fireEvent.keyDown(paragraph, { key: 'Escape' })

    expect(paragraph.value).toBe('We propose **TextEx**~\\cite{kim2026}.')
    fireEvent.blur(paragraph)
    expect(applyEdits).not.toHaveBeenCalled()
  })

  it('explains itself when the file has no document body', () => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/preamble.tex', '\\usepackage{amsmath}\n')
    render(<ProsePane />)

    expect(screen.getByText(/no \\begin\{document\} body/u)).toBeInTheDocument()
  })
})
