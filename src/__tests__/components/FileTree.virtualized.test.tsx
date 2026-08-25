import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileTree from '../../renderer/components/FileTree'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { ProjectIndexEntry } from '../../shared/types'

const projectRoot = '/projects/large'

function fileEntry(index: number): ProjectIndexEntry {
  const name = `file-${String(index).padStart(5, '0')}.tex`
  return {
    path: `${projectRoot}/${name}`,
    relativePath: name,
    parentRelativePath: '',
    name,
    type: 'file'
  }
}

describe('virtualized FileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({
      projectRoot,
      directoryTree: [],
      directoryRefreshVersions: {},
      projectIndex: {
        root: projectRoot,
        generation: 1,
        entries: Array.from({ length: 10_000 }, (_, index) => fileEntry(index))
      },
      gitStatus: null
    })
    useEditorStore.setState({ activeFilePath: null })
  })

  it('mounts only viewport and overscan rows for a large project', () => {
    const { container } = render(<FileTree />)

    const newFileButton = screen.getByRole('button', { name: 'New File' })
    const newFolderButton = screen.getByRole('button', { name: 'New Folder' })
    expect(newFileButton.querySelector('.lucide-file-plus-corner')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(newFolderButton.querySelector('.lucide-folder-plus')).toHaveAttribute(
      'aria-hidden',
      'true'
    )

    expect(container.querySelector('.file-tree-virtual-space')).toHaveStyle({ height: '240000px' })
    expect(container.querySelectorAll('[data-file-tree-path]').length).toBeLessThanOrEqual(7)
    expect(screen.getByText('file-00000.tex')).toBeInTheDocument()
    expect(screen.queryByText('file-09999.tex')).not.toBeInTheDocument()

    const viewport = container.querySelector('.file-tree-viewport')!
    fireEvent.scroll(viewport, { target: { scrollTop: 240_000 } })

    expect(screen.queryByText('file-00000.tex')).not.toBeInTheDocument()
    expect(screen.getByText('file-09999.tex')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-file-tree-path]').length).toBeLessThanOrEqual(7)
  })

  it('removes descendants from the flat row model when a directory collapses', () => {
    const chapterEntries = Array.from({ length: 20 }, (_, index) => {
      const name = `chapter-${String(index).padStart(2, '0')}.tex`
      return {
        path: `${projectRoot}/chapters/${name}`,
        relativePath: `chapters/${name}`,
        parentRelativePath: 'chapters',
        name,
        type: 'file' as const
      }
    })
    useProjectStore.getState().setProjectIndex({
      root: projectRoot,
      generation: 2,
      entries: [
        {
          path: `${projectRoot}/chapters`,
          relativePath: 'chapters',
          parentRelativePath: '',
          name: 'chapters',
          type: 'directory'
        },
        ...chapterEntries
      ]
    })
    const { container } = render(<FileTree />)

    expect(container.querySelector('.file-tree-virtual-space')).toHaveStyle({ height: '504px' })
    fireEvent.click(screen.getByText('chapters'))
    expect(container.querySelector('.file-tree-virtual-space')).toHaveStyle({ height: '24px' })
    expect(screen.queryByText('chapter-00.tex')).not.toBeInTheDocument()
  })

  it('updates selection when the active indexed file changes', () => {
    const { container } = render(<FileTree />)
    const firstPath = fileEntry(0).path
    const secondPath = fileEntry(1).path

    act(() => useEditorStore.setState({ activeFilePath: firstPath }))
    expect(container.querySelector('[data-file-tree-path="file-00000.tex"]')).toHaveClass(
      'selected'
    )
    expect(container.querySelector('[data-file-tree-path="file-00001.tex"]')).not.toHaveClass(
      'selected'
    )

    act(() => useEditorStore.setState({ activeFilePath: secondPath }))
    expect(container.querySelector('[data-file-tree-path="file-00000.tex"]')).not.toHaveClass(
      'selected'
    )
    expect(container.querySelector('[data-file-tree-path="file-00001.tex"]')).toHaveClass(
      'selected'
    )
  })

  it('hides generated outputs by default and exports an Overleaf source archive', async () => {
    useProjectStore.getState().setProjectIndex({
      root: projectRoot,
      generation: 3,
      entries: [
        {
          path: `${projectRoot}/main.tex`,
          relativePath: 'main.tex',
          parentRelativePath: '',
          name: 'main.tex',
          type: 'file'
        },
        {
          path: `${projectRoot}/main.pdf`,
          relativePath: 'main.pdf',
          parentRelativePath: '',
          name: 'main.pdf',
          type: 'file'
        },
        {
          path: `${projectRoot}/main.log`,
          relativePath: 'main.log',
          parentRelativePath: '',
          name: 'main.log',
          type: 'file'
        },
        {
          path: `${projectRoot}/figure.pdf`,
          relativePath: 'figure.pdf',
          parentRelativePath: '',
          name: 'figure.pdf',
          type: 'file'
        }
      ]
    })
    vi.mocked(window.api.exportOverleafZip).mockResolvedValue({
      success: true,
      outputPath: '/exports/large-overleaf.zip'
    })
    vi.mocked(window.api.openProjectTerminal).mockResolvedValue({ success: true })

    render(<FileTree />)

    expect(screen.getByText('main.tex')).toBeInTheDocument()
    expect(screen.getByText('figure.pdf')).toBeInTheDocument()
    expect(screen.queryByText('main.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('main.log')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show generated files' }))
    expect(screen.getByText('main.pdf')).toBeInTheDocument()
    expect(screen.getByText('main.log')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Export Overleaf source ZIP' }))
    await waitFor(() => expect(window.api.exportOverleafZip).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: 'Open project in terminal' }))
    await waitFor(() => expect(window.api.openProjectTerminal).toHaveBeenCalledOnce())
  })
})
