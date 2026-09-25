import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceSourcePane } from '../../renderer/components/WorkspaceSourcePane'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'

beforeEach(() => {
  useEditorStore.getState().resetEditor()
  useEditorStore.getState().openFileInTab('/project/main.tex', 'Original')
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

it('shows progress, prevents duplicate refreshes, and retains edits after a failure', async () => {
  usePdfStore.getState().setPdfOnly(true)
  usePdfStore.getState().setSourceEditorOpen(true)
  let reject!: (reason: Error) => void
  const compile = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail
      })
  )
  render(
    <WorkspaceSourcePane onCompile={compile}>
      <textarea aria-label="Source" defaultValue="Draft" />
    </WorkspaceSourcePane>
  )
  const source = screen.getByRole('textbox')
  fireEvent.keyDown(source, { key: 'Enter', ctrlKey: true })
  expect(screen.getByRole('button', { name: 'Updating PDF…' })).toBeDisabled()
  fireEvent.keyDown(source, { key: 'Enter', ctrlKey: true })
  expect(compile).toHaveBeenCalledOnce()
  await act(async () => reject(new Error('Compilation unavailable')))
  expect(screen.getByRole('alert')).toHaveTextContent('Compilation unavailable')
  expect(source).toHaveValue('Draft')
  fireEvent.click(screen.getByRole('button', { name: 'View problems' }))
  expect(useProjectStore.getState().researchPanelTab).toBe('problems')
  expect(usePdfStore.getState().pdfToolsVisible).toBe(true)
  fireEvent.keyDown(source, { key: 'Escape' })
  expect(source).not.toBeVisible()
})

it('does not show an old refresh failure after switching source documents', async () => {
  usePdfStore.getState().setPdfOnly(true)
  usePdfStore.getState().setSourceEditorOpen(true)
  let reject!: (reason: Error) => void
  const compile = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail
      })
  )
  render(
    <WorkspaceSourcePane onCompile={compile}>
      <textarea aria-label="Source" />
    </WorkspaceSourcePane>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save and refresh PDF' }))
  act(() => useEditorStore.getState().openFileInTab('/project/other.tex', 'Other'))
  await act(async () => reject(new Error('Previous document failed')))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save and refresh PDF' })).toBeEnabled()
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
