import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileTree from '../../renderer/components/FileTree'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const file = {
  name: 'main.tex',
  path: '/project/main.tex',
  type: 'file' as const,
  relativePath: 'main.tex',
  parentRelativePath: ''
}
const folder = {
  name: 'chapters',
  path: '/project/chapters',
  type: 'directory' as const,
  relativePath: 'chapters',
  parentRelativePath: ''
}

for (const indexed of [false, true]) {
  describe(`${indexed ? 'indexed' : 'directory'} file tree menus`, () => {
    beforeEach(() => {
      vi.clearAllMocks()
      window.api.deletePath = vi.fn()
      useProjectStore.setState({
        projectRoot: '/project',
        directoryTree: [file, folder],
        directoryRefreshVersions: {},
        projectIndex: indexed ? { root: '/project', generation: 1, entries: [file, folder] } : null,
        gitStatus: null
      })
      vi.mocked(window.api.readDirectory).mockResolvedValue([])
    })

    it('opens file actions by keyboard and starts inline rename with focus', async () => {
      render(<FileTree />)
      const row = screen.getByText('main.tex').closest('.file-tree-item')!
      fireEvent.keyDown(row, { key: 'F10', shiftKey: true })
      const menu = screen.getByRole('menu', { name: 'Actions for main.tex' })
      expect(within(menu).queryByRole('menuitem', { name: 'New File' })).not.toBeInTheDocument()
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Rename' }))
      await waitFor(() => expect(screen.getByDisplayValue('main.tex')).toHaveFocus())
    })

    it('creates within the chosen directory and preserves delete confirmation', async () => {
      render(<FileTree />)
      fireEvent.contextMenu(screen.getByText('chapters'), { clientX: 12, clientY: 24 })
      const menu = screen.getByRole('menu', { name: 'Actions for chapters' })
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'New Folder' }))
      const input = screen.getByPlaceholderText('name')
      await waitFor(() => expect(input).toHaveFocus())
      fireEvent.keyDown(input, { key: 'Escape' })
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      fireEvent.contextMenu(screen.getByText('main.tex'))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
      await waitFor(() =>
        expect(confirm).toHaveBeenCalledWith('Delete main.tex? This cannot be undone.')
      )
      expect(window.api.deletePath).not.toHaveBeenCalled()
      confirm.mockRestore()
    })
  })
}
