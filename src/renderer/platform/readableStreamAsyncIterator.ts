/**
 * WHATWG async iteration for `ReadableStream` where the engine lacks it.
 *
 * The Linux AppImage bundles WebKitGTK from the build runner, and that build
 * leaves the `ReadableStreamIterable` feature off, so
 * `ReadableStream.prototype[Symbol.asyncIterator]` is undefined even though the
 * rest of the engine is current. pdf.js 6 consumes `GetTextContent` streams with
 * `for await`, which then throws a TypeError: canvas rendering still works while
 * `getTextContent`, the text layer, PDF search and sentence selection all fail.
 */

export interface ReadableStreamIteratorOptions {
  preventCancel?: boolean
}

type StreamPrototype = Record<PropertyKey, unknown>

/** `ReadableStream.prototype.values()` as specified, built on a default reader. */
export function readableStreamValues<T>(
  this: ReadableStream<T>,
  options: ReadableStreamIteratorOptions = {}
): AsyncIterableIterator<T> {
  const preventCancel = Boolean(options.preventCancel)
  const reader = this.getReader()
  let finished = false
  const release = () => {
    try {
      reader.releaseLock()
    } catch {
      // Older engines refuse to release a reader with a pending read.
    }
  }
  const iterator: AsyncIterableIterator<T> = {
    async next() {
      if (finished) return { value: undefined, done: true }
      try {
        const result = await reader.read()
        if (result.done) {
          finished = true
          release()
          return { value: undefined, done: true }
        }
        return { value: result.value, done: false }
      } catch (error) {
        finished = true
        release()
        throw error
      }
    },
    async return(value?: unknown) {
      if (!finished) {
        finished = true
        if (preventCancel) release()
        else {
          try {
            await reader.cancel(value)
          } finally {
            release()
          }
        }
      }
      return { value: value as T, done: true }
    },
    [Symbol.asyncIterator]() {
      return this
    }
  }
  return iterator
}

/**
 * Install `values()` and `Symbol.asyncIterator` on `ReadableStream.prototype`
 * when the engine does not provide them. Returns whether anything was added.
 */
export function installReadableStreamAsyncIterator(
  target: { ReadableStream?: { prototype: object } } = globalThis
): boolean {
  const prototype = target.ReadableStream?.prototype as StreamPrototype | undefined
  if (!prototype || typeof prototype[Symbol.asyncIterator] === 'function') return false
  if (typeof prototype.values !== 'function') {
    Object.defineProperty(prototype, 'values', {
      value: readableStreamValues,
      writable: true,
      configurable: true
    })
  }
  Object.defineProperty(prototype, Symbol.asyncIterator, {
    value: prototype.values,
    writable: true,
    configurable: true
  })
  return true
}

installReadableStreamAsyncIterator()
