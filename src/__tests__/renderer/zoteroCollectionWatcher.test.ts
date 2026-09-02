import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchZoteroCollection } from '../../renderer/services/zoteroCollectionWatcher'

function page(totalResults: number) {
  return { items: [], totalResults, offset: 0, limit: 0 }
}

describe('watchZoteroCollection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reports only the polls where the collection size actually changed', async () => {
    const onChange = vi.fn()
    window.api.zoteroCollectionItems = vi
      .fn()
      .mockResolvedValueOnce(page(36))
      .mockResolvedValueOnce(page(36))
      .mockResolvedValueOnce(page(48))
    const stop = watchZoteroCollection({
      collectionKey: '/0/PAPERS',
      port: 23_119,
      initialTotalResults: 36,
      intervalMs: 1_000,
      onChange
    })

    await vi.advanceTimersByTimeAsync(2_000)
    expect(onChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(onChange).toHaveBeenCalledWith({ totalResults: 48, previousTotalResults: 36 })

    stop()
  })

  it('establishes its own baseline when the caller has not observed one', async () => {
    const onChange = vi.fn()
    window.api.zoteroCollectionItems = vi
      .fn()
      .mockResolvedValueOnce(page(10))
      .mockResolvedValueOnce(page(11))
    const stop = watchZoteroCollection({
      collectionKey: '/0/PAPERS',
      port: 23_119,
      intervalMs: 1_000,
      onChange
    })

    await vi.advanceTimersByTimeAsync(1_000)
    expect(onChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onChange).toHaveBeenCalledWith({ totalResults: 11, previousTotalResults: 10 })

    stop()
  })

  it('keeps polling after a failed request and reports the failure once', async () => {
    const onChange = vi.fn()
    const onError = vi.fn()
    window.api.zoteroCollectionItems = vi
      .fn()
      .mockRejectedValueOnce(new Error('Zotero is not running'))
      .mockResolvedValueOnce(page(5))
      .mockResolvedValueOnce(page(6))
    const stop = watchZoteroCollection({
      collectionKey: '/0/PAPERS',
      port: 23_119,
      intervalMs: 1_000,
      onChange,
      onError
    })

    await vi.advanceTimersByTimeAsync(3_000)

    expect(onError).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({ totalResults: 6, previousTotalResults: 5 })
    stop()
  })

  it('stops polling and drops an in-flight result once the watch is cancelled', async () => {
    const onChange = vi.fn()
    window.api.zoteroCollectionItems = vi.fn().mockResolvedValue(page(99))
    const stop = watchZoteroCollection({
      collectionKey: '/0/PAPERS',
      port: 23_119,
      initialTotalResults: 1,
      intervalMs: 1_000,
      onChange
    })

    stop()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(window.api.zoteroCollectionItems).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
