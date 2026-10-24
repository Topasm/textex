import { describe, expect, it, vi } from 'vitest'
import {
  installReadableStreamAsyncIterator,
  readableStreamValues
} from '../../renderer/platform/readableStreamAsyncIterator'

const values = <T>(stream: ReadableStream<T>, options?: { preventCancel?: boolean }) =>
  readableStreamValues.call(stream, options) as AsyncIterableIterator<T>

function chunkStream(chunks: string[], onCancel?: (reason: unknown) => void) {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
    cancel(reason) {
      onCancel?.(reason)
    }
  })
}

describe('readableStreamValues', () => {
  it('yields every chunk and releases the reader when the stream closes', async () => {
    const stream = chunkStream(['a', 'b', 'c'])
    const seen: string[] = []
    for await (const chunk of values(stream)) seen.push(chunk)
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(stream.locked).toBe(false)
    const iterator = values(stream)
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
  })

  it('cancels the stream when iteration stops early', async () => {
    const onCancel = vi.fn()
    const stream = chunkStream(['a', 'b'], onCancel)
    for await (const chunk of values(stream)) {
      expect(chunk).toBe('a')
      break
    }
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
  })

  it('keeps the stream readable when preventCancel is set', async () => {
    const onCancel = vi.fn()
    const stream = chunkStream(['a', 'b'], onCancel)
    const iterator = values(stream, { preventCancel: true })
    await expect(iterator.next()).resolves.toEqual({ value: 'a', done: false })
    await iterator.return?.()
    expect(onCancel).not.toHaveBeenCalled()
    expect(stream.locked).toBe(false)
    await expect(stream.getReader().read()).resolves.toEqual({ value: 'b', done: false })
  })

  it('propagates stream errors and releases the lock', async () => {
    let pulls = 0
    const stream = new ReadableStream<string>({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue('a')
        else controller.error(new Error('boom'))
      }
    })
    const iterator = values(stream)
    await expect(iterator.next()).resolves.toEqual({ value: 'a', done: false })
    await expect(iterator.next()).rejects.toThrow('boom')
    expect(stream.locked).toBe(false)
  })
})

describe('installReadableStreamAsyncIterator', () => {
  it('leaves engines that already iterate streams untouched', () => {
    const existing = () => undefined
    const prototype: Record<PropertyKey, unknown> = { [Symbol.asyncIterator]: existing }
    expect(installReadableStreamAsyncIterator({ ReadableStream: { prototype } })).toBe(false)
    expect(prototype[Symbol.asyncIterator]).toBe(existing)
    expect(installReadableStreamAsyncIterator({})).toBe(false)
  })

  it('makes a stream without the feature consumable with for await', async () => {
    // Mirror WebKitGTK without ReadableStreamIterable: a working reader but no
    // iteration protocol on the prototype.
    class LegacyStream<T> {
      constructor(private readonly source: ReadableStream<T>) {}
      getReader() {
        return this.source.getReader()
      }
    }
    expect(installReadableStreamAsyncIterator({ ReadableStream: LegacyStream })).toBe(true)
    expect(installReadableStreamAsyncIterator({ ReadableStream: LegacyStream })).toBe(false)
    const stream = new LegacyStream(chunkStream(['x', 'y'])) as unknown as AsyncIterable<string>
    const seen: string[] = []
    for await (const chunk of stream) seen.push(chunk)
    expect(seen).toEqual(['x', 'y'])
    expect(Object.keys(LegacyStream.prototype)).toEqual([])
  })
})
