import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileOps } from '../../renderer/hooks/useFileOps'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { documentRegistry } from '../../renderer/models/documentRegistry'

const { isCurrentProjectTransitionSnapshotMock, openProjectMock } = vi.hoisted(() => ({
  isCurrentProjectTransitionSnapshotMock: vi.fn(),
  openProjectMock: vi.fn()
}))

vi.mock('../../renderer/utils/openProject', () => ({
  isCurrentProjectTransitionSnapshot: (...args: unknown[]) =>
    isCurrentProjectTransitionSnapshotMock(...args),
  openProject: (...args: unknown[]) => openProjectMock(...args)
}))

describe('useFileOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    isCurrentProjectTransitionSnapshotMock.mockReturnValue(true)
  })

  it('opens the chosen file without auto-opening the first project tex file', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    openProjectMock.mockResolvedValue({
      generation: 1,
      projectPath: '/workspace/project'
    })

    const { result } = renderHook(() => useFileOps())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(openProjectMock).toHaveBeenCalledWith('/workspace/project', {
      autoOpenFirstTex: false
    })
    expect(useEditorStore.getState().filePath).toBe('/workspace/project/picked.tex')
    expect(documentRegistry.snapshot('/workspace/project/picked.tex')?.text).toBe(
      '\\section{Picked}'
    )
  })

  it('does not open the chosen file when the project transition is cancelled', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    openProjectMock.mockResolvedValue(null)

    const { result } = renderHook(() => useFileOps())
    await act(async () => {
      await result.current.handleOpen()
    })

    expect(useEditorStore.getState().filePath).toBeNull()
    expect(isCurrentProjectTransitionSnapshotMock).not.toHaveBeenCalled()
  })

  it('does not publish a selected file after its project transition becomes stale', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    const snapshot = { generation: 2, projectPath: '/workspace/project' }
    openProjectMock.mockResolvedValue(snapshot)
    isCurrentProjectTransitionSnapshotMock.mockReturnValue(false)

    const { result } = renderHook(() => useFileOps())
    await act(async () => {
      await result.current.handleOpen()
    })

    expect(isCurrentProjectTransitionSnapshotMock).toHaveBeenCalledWith(snapshot)
    expect(useEditorStore.getState().filePath).toBeNull()
  })
})
