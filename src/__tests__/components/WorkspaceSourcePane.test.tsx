import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceSourcePane } from '../../renderer/components/WorkspaceSourcePane'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'

beforeEach(() => {
  usePdfStore.getState().setPdfOnly(false)
  useCompileStore.setState({ compileStatus: 'idle' })
})

it('keeps the source buffer mounted through PDF-only and source drawer transitions', () => {
  const compile = vi.fn().mockResolvedValue(undefined)
  render(
    <WorkspaceSourcePane onCompile={compile}>
      <textarea aria-label="Source" defaultValue="Original" />
    </WorkspaceSourcePane>
  )
  const source = screen.getByRole('textbox')
  fireEvent.change(source, { target: { value: 'Unsaved edits' } })
  act(() => usePdfStore.getState().setPdfOnly(true))
  expect(source).not.toBeVisible()
  expect(source).toHaveValue('Unsaved edits')
  act(() => usePdfStore.getState().setSourceEditorOpen(true))
  expect(screen.getByRole('textbox')).toBe(source)
  expect(source).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Save and refresh PDF' }))
  expect(compile).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Back to PDF' }))
  expect(source).not.toBeVisible()
  act(() => usePdfStore.getState().setPdfOnly(false))
  expect(source).toBeVisible()
  expect(source).toHaveValue('Unsaved edits')
})
