import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContinuousZoteroSync } from '../../renderer/hooks/useContinuousZoteroSync'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useZoteroSyncStore } from '../../renderer/store/useZoteroSyncStore'

describe('useContinuousZoteroSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useNotificationStore.getState().clearNotifications()
    useProjectStore.setState({ projectRoot: '/project' })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroPort: 23_119, zoteroSyncMode: 'continuous' }
    }))
    useZoteroSyncStore.setState({ dataRevision: 0, configurationRevision: 0 })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue({
      version: 1,
      referencesFile: 'references.bib',
      zoteroFile: 'zotero.bib',
      zoteroCollection: '/0/PAPERS'
    })
    window.api.zoteroCollectionItems = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        totalResults: 12,
        offset: 0,
        limit: 0,
        libraryVersion: 80
      })
      .mockResolvedValue({
        items: [],
        totalResults: 12,
        offset: 0,
        limit: 0,
        libraryVersion: 81
      })
    window.api.zoteroSyncCollection = vi.fn().mockResolvedValue({
      filePath: '/project/zotero.bib',
      entryCount: 12
    })
    window.api.findBibInProject = vi.fn().mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('syncs library revisions for the project even without mounting References', async () => {
    const view = renderHook(() => useContinuousZoteroSync())
    await act(async () => Promise.resolve())

    await act(async () => vi.advanceTimersByTimeAsync(30_000))

    expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith(
      '/0/PAPERS',
      '/project/zotero.bib',
      23_119
    )
    expect(window.api.findBibInProject).toHaveBeenCalledWith('/project')
    expect(useZoteroSyncStore.getState().dataRevision).toBe(1)
    view.unmount()
  })

  it('syncs a newly saved collection configuration immediately', async () => {
    const view = renderHook(() => useContinuousZoteroSync())
    await act(async () => Promise.resolve())

    await act(async () => {
      useZoteroSyncStore.getState().markConfigurationChanged()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.api.zoteroSyncCollection).toHaveBeenCalledOnce()
    expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith(
      '/0/PAPERS',
      '/project/zotero.bib',
      23_119
    )
    view.unmount()
  })

  it('syncs immediately when continuous mode is enabled for an open project', async () => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroSyncMode: 'off' }
    }))
    const view = renderHook(() => useContinuousZoteroSync())

    await act(async () => {
      useSettingsStore.getState().updateSetting('zoteroSyncMode', 'continuous')
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith(
      '/0/PAPERS',
      '/project/zotero.bib',
      23_119
    )
    view.unmount()
  })
})
