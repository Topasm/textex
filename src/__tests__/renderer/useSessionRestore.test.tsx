import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionRestore } from '../../renderer/hooks/useSessionRestore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const { openProjectMock } = vi.hoisted(() => ({
  openProjectMock: vi.fn()
}))

vi.mock('../../renderer/utils/openProject', () => ({
  isCurrentProjectTransitionSnapshot: vi.fn(() => true),
  openProject: openProjectMock
}))

describe('useSessionRestore missing-project recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNotificationStore.getState().clearNotifications()
    useProjectStore.getState().setProjectRoot(null)
    useEditorStore.setState({
      _sessionOpenPaths: [],
      _sessionActiveFile: null
    })
    vi.mocked(window.api.openDirectory).mockResolvedValue(null)
  })

  it('keeps the failed saved path visible and opens a chosen replacement through openProject', async () => {
    const savedPath = '/projects/moved-away'
    const replacementPath = '/projects/replacement'
    useProjectStore.getState().setProjectRoot(savedPath)
    openProjectMock
      .mockRejectedValueOnce(new Error('Project directory not found'))
      .mockResolvedValueOnce({ generation: 2, projectPath: replacementPath })
    vi.mocked(window.api.openDirectory).mockResolvedValueOnce(replacementPath)

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(result.current).toBe(true))
    const notification = useNotificationStore.getState().notifications[0]
    expect(notification).toMatchObject({
      id: 'session-restore-failed',
      tone: 'error'
    })
    expect(notification.message).toContain(savedPath)
    expect(notification.message).toContain('Project directory not found')
    expect(notification.action?.label).toBe('Choose replacement')
    expect(useProjectStore.getState().projectRoot).toBeNull()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()

    await act(async () => {
      await notification.action?.run()
    })

    expect(window.api.openDirectory).toHaveBeenCalledOnce()
    expect(openProjectMock).toHaveBeenNthCalledWith(1, savedPath, {
      autoOpenFirstTex: false
    })
    expect(openProjectMock).toHaveBeenNthCalledWith(2, replacementPath)
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('retains the recovery action and reports the replacement path when opening it fails', async () => {
    const savedPath = '/projects/moved-away'
    const replacementPath = '/projects/still-missing'
    useProjectStore.getState().setProjectRoot(savedPath)
    openProjectMock
      .mockRejectedValueOnce(new Error('Original folder not found'))
      .mockRejectedValueOnce(new Error('Replacement folder not found'))
    vi.mocked(window.api.openDirectory).mockResolvedValueOnce(replacementPath)

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(result.current).toBe(true))
    const action = useNotificationStore.getState().notifications[0]?.action

    await expect(action?.run()).rejects.toThrow('Replacement folder not found')

    const notification = useNotificationStore.getState().notifications[0]
    expect(notification.message).toContain(replacementPath)
    expect(notification.message).toContain('Replacement folder not found')
    expect(notification.action).toBe(action)
    expect(notification.dismissible).toBe(true)
  })
})
