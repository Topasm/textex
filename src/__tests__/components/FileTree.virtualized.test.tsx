import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileTree from '../../renderer/components/FileTree'
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
  })

  it('mounts only viewport and overscan rows for a large project', () => {
    const { container } = render(<FileTree />)

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
})
