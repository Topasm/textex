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
    render(<TabBar />)

    fireEvent.click(screen.getByText('\u00D7'))

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
    render(<TabBar />)

    fireEvent.click(screen.getByText('\u00D7'))

    expect(useEditorStore.getState().openFiles).toEqual({})
  })
})
