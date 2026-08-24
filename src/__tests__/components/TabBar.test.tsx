import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from '../../renderer/components/TabBar'
import { useEditorStore } from '../../renderer/store/useEditorStore'

const filePath = '/project/draft.tex'

function openDirtyTab(): void {
  useEditorStore.getState().openFileInTab(filePath, 'saved')
  useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
}

describe('TabBar dirty close guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useEditorStore.getState().resetEditor()
    openDirtyTab()
  })

  it('keeps a dirty tab when its close button is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = render(<TabBar />)
    const closeControl = container.querySelector('.tab-close')!

    expect(closeControl.querySelector('.lucide-x')).toHaveAttribute('aria-hidden', 'true')
    expect(closeControl).not.toHaveTextContent('\u00D7')
    fireEvent.click(closeControl)

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(useEditorStore.getState().openFiles[filePath]?.isDirty).toBe(true)
  })

  it('keeps a dirty tab when middle-click close is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TabBar />)

    fireEvent.mouseDown(screen.getByTitle(filePath), { button: 1 })

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(useEditorStore.getState().openFiles[filePath]?.isDirty).toBe(true)
  })

  it('closes a dirty tab after explicit confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = render(<TabBar />)

    fireEvent.click(container.querySelector('.tab-close')!)

    expect(useEditorStore.getState().openFiles).toEqual({})
  })

  it('exposes an ARIA-owned tab set with keyboard navigation and dirty state', () => {
    const secondPath = '/project/notes.tex'
    useEditorStore.getState().openFileInTab(secondPath, 'notes')
    render(<TabBar />)

    const tabList = screen.getByRole('tablist', { name: 'File operations' })
    const draftTab = screen.getByRole('tab', { name: 'draft.tex, unsaved changes' })
    const notesTab = screen.getByRole('tab', { name: 'notes.tex' })

    expect(tabList).toContainElement(draftTab)
    expect(tabList.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(tabList.querySelectorAll('button:not([role="tab"])')).toHaveLength(0)
    expect(notesTab).toHaveAttribute('aria-selected', 'true')
    expect(notesTab).toHaveAttribute('tabindex', '0')
    expect(draftTab).toHaveAttribute('tabindex', '-1')

    notesTab.focus()
    fireEvent.keyDown(notesTab, { key: 'ArrowLeft' })

    expect(draftTab).toHaveFocus()
    expect(draftTab).toHaveAttribute('aria-selected', 'true')
    expect(useEditorStore.getState().activeFilePath).toBe(filePath)

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.keyDown(draftTab, { key: 'Delete' })
    expect(useEditorStore.getState().openFiles[filePath]).toBeUndefined()
  })
})
