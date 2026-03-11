import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileOps } from '../../renderer/hooks/useFileOps'
import { useEditorStore } from '../../renderer/store/useEditorStore'

const { openProjectMock } = vi.hoisted(() => ({
  openProjectMock: vi.fn()
}))

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: (...args: unknown[]) => openProjectMock(...args)
}))

describe('useFileOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.setState({
      filePath: null,
      content: '',
      isDirty: false,
      openFiles: {},
      activeFilePath: null,
      cursorLine: 1,
      cursorColumn: 1,
      pendingJump: null,
      pendingInsertText: null,
      editorInstance: null,
      _sessionOpenPaths: [],
      _sessionActiveFile: null
    })
  })

  it('opens the chosen file without auto-opening the first project tex file', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    openProjectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useFileOps())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(openProjectMock).toHaveBeenCalledWith('/workspace/project', {
      autoOpenFirstTex: false
    })
    expect(useEditorStore.getState().filePath).toBe('/workspace/project/picked.tex')
    expect(useEditorStore.getState().content).toBe('\\section{Picked}')
  })
})
