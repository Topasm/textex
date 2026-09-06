import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AiEditReview } from '../../renderer/components/AiEditReview'
import { currentAiEdit } from '../../renderer/services/aiEditReview'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const path = '/project/main.tex'
beforeEach(() => {
  useEditorStore.getState().resetEditor()
  useEditorStore.getState().openFileInTab(path, 'after')
  useProjectStore.setState({ projectRoot: '/project' })
  useCompileStore.setState({
    compileStatus: 'idle',
    pdfDocumentId: null,
    pdfDocumentRevision: null
  })
})
function setup(onCompile = vi.fn<() => Promise<void>>().mockResolvedValue()) {
  const snapshot = documentRegistry.snapshot(path)!
  const onUndo = vi.fn()
  render(
    <AiEditReview
      edit={{
        filePath: path,
        projectRoot: '/project',
        appliedSnapshot: snapshot,
        before: 'before',
        after: 'after',
        isCurrent: currentAiEdit(path, snapshot)
      }}
      onUndo={onUndo}
      onCompile={onCompile}
    />
  )
  return { snapshot, onUndo, onCompile }
}
it('keeps unrelated or old successful compilations unverified', () => {
  const { snapshot } = setup()
  act(() =>
    useCompileStore.setState({
      compileStatus: 'success',
      pdfDocumentId: '/project/other.tex',
      pdfDocumentRevision: snapshot.revision
    })
  )
  expect(screen.getByText('Applied · compilation unverified')).toBeVisible()
  act(() =>
    useCompileStore.setState({ pdfDocumentId: path, pdfDocumentRevision: snapshot.revision - 1 })
  )
  expect(screen.getByText('Applied · compilation unverified')).toBeVisible()
  act(() => useCompileStore.setState({ pdfDocumentRevision: snapshot.revision }))
  expect(screen.getByText(/This document revision compiled successfully/)).toBeVisible()
})
it('invalidates Undo and verification after further editing or switching project', () => {
  const { onUndo } = setup()
  act(() => useEditorStore.getState().updateActiveDocument('newer'))
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(onUndo).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Compile to check' })).toBeDisabled()
})
it('reports a failed compile without claiming the edit was verified', async () => {
  setup(vi.fn().mockRejectedValue(new Error('failed')))
  fireEvent.click(screen.getByRole('button', { name: 'Compile to check' }))
  await waitFor(() => expect(screen.getByText('Compilation failed. Check Problems.')).toBeVisible())
})
it('does not accept an identical revision from a reopened document', () => {
  setup()
  act(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(path, 'different')
  })
  expect(screen.getByText('Document changed; verify the latest edit.')).toBeVisible()
})

it('invalidates the review when its inactive document changes', () => {
  setup()
  act(() => {
    useEditorStore.getState().openFileInTab('/project/other.tex', 'other')
  })
  act(() => {
    documentRegistry.update(path, 'external change', 'external')
  })
  expect(screen.getByText('Document changed; verify the latest edit.')).toBeVisible()
})
