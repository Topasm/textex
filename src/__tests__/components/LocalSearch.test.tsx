import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRef } from 'react'
import { MarkdownSearch } from '../../renderer/components/search/MarkdownSearch'
import { requestLocalSearch } from '../../renderer/services/localSearch'
import { useUiStore } from '../../renderer/store/useUiStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'

function Harness({ text = 'First method. Second METHOD.' }: { text?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <>
      <MarkdownSearch text={text} areaRef={ref} />
      <textarea ref={ref} value={text} readOnly aria-label="Source" />
    </>
  )
}

describe('local Markdown find', () => {
  beforeEach(() => {
    useUiStore.setState({ searchRequest: null })
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/main.tex', 'Source')
    useProjectStore.getState().setProjectRoot('/project')
  })
  it('opens from commands, selects matches, wraps in both directions, and restores focus', () => {
    render(<Harness />)
    act(() => requestLocalSearch('document'))
    const input = screen.getByRole('textbox', { name: 'Find in document' })
    const area = screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'method' } })
    expect(area.selectionStart).toBe(6)
    expect(screen.getByRole('status')).toHaveTextContent('1 / 2')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(area.selectionStart).toBe(21)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(area.selectionStart).toBe(6)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(area.selectionStart).toBe(21)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(area).toHaveFocus()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })
  it('treats punctuation literally and refreshes results when the source changes', () => {
    const { rerender } = render(<Harness text="a.b a+b" />)
    fireEvent.click(screen.getByRole('button', { name: 'Find in document' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Find in document' }), {
      target: { value: 'a.b' }
    })
    expect(screen.getByRole('status')).toHaveTextContent('1 / 1')
    rerender(<Harness text="a+b" />)
    expect(screen.getByRole('status')).toHaveTextContent('0 / 0')
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled()
  })
  it('does not consume a document request belonging to an old project', () => {
    act(() => requestLocalSearch('document'))
    act(() => useProjectStore.getState().setProjectRoot('/other'))
    render(<Harness />)
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(useUiStore.getState().searchRequest).toBeNull()
  })
})
