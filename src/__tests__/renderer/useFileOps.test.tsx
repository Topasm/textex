import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileOps } from '../../renderer/hooks/useFileOps'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { documentRegistry } from '../../renderer/models/documentRegistry'

const { openProjectMock } = vi.hoisted(() => ({
  openProjectMock: vi.fn()
}))

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: (...args: unknown[]) => openProjectMock(...args)
}))

describe('useFileOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
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
    expect(documentRegistry.snapshot('/workspace/project/picked.tex')?.text).toBe(
      '\\section{Picked}'
    )
  })
})
