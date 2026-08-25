import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoryPanel } from '../../renderer/hooks/editor/useHistoryPanel'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import type { HistoryItem } from '../../shared/types'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const firstPath = '/project/first.tex'
const secondPath = '/project/second.tex'
const firstItem: HistoryItem = { timestamp: 1, size: 10, path: '/history/first.gz' }
const secondItem: HistoryItem = { timestamp: 2, size: 20, path: '/history/second.gz' }

describe('useHistoryPanel async ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNotificationStore.getState().clearNotifications()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(firstPath, 'first')
    useEditorStore.getState().openFileInTab(secondPath, 'second')
    useEditorStore.getState().setActiveTab(firstPath)
  })

  it('ignores a history list that resolves after the active file changes', async () => {
    const first = deferred<HistoryItem[]>()
    vi.mocked(window.api.getHistoryList)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([secondItem])
    const { result } = renderHook(() => useHistoryPanel())

    act(() => result.current.setShowHistory(true))
    await waitFor(() => expect(window.api.getHistoryList).toHaveBeenCalledWith(firstPath))
    act(() => useEditorStore.getState().setActiveTab(secondPath))
    await waitFor(() => expect(window.api.getHistoryList).toHaveBeenCalledWith(secondPath))
    await waitFor(() => expect(result.current.historyItems).toEqual([secondItem]))

    await act(async () => first.resolve([firstItem]))
    expect(result.current.historyItems).toEqual([secondItem])
  })

  it('ignores snapshot content that resolves after the active file changes', async () => {
    const snapshot = deferred<string>()
    vi.mocked(window.api.getHistoryList).mockResolvedValue([firstItem])
    vi.mocked(window.api.loadHistorySnapshot).mockReturnValueOnce(snapshot.promise)
    const { result } = renderHook(() => useHistoryPanel())

    act(() => result.current.setShowHistory(true))
    await waitFor(() => expect(result.current.historyItems).toEqual([firstItem]))
    const loading = result.current.handleSelectHistoryItem(firstItem)
    act(() => useEditorStore.getState().setActiveTab(secondPath))
    snapshot.resolve('stale snapshot')
    await act(async () => loading)

    expect(result.current.snapshotContent).toBe('')
    expect(result.current.historyMode).toBe(false)
  })
})
