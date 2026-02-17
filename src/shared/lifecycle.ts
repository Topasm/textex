/**
 * VS Code-style disposable pattern for deterministic resource cleanup.
 * Used across main, preload, and renderer processes.
 */

export interface IDisposable {
  dispose(): void
}

/** Wrap a cleanup function as an IDisposable. */
export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn }
}

/**
 * A store that tracks multiple disposables and disposes them all at once.
 */
export class DisposableStore implements IDisposable {
  private disposables: IDisposable[] = []
  private disposed = false

  add<T extends IDisposable>(disposable: T): T {
    if (this.disposed) {
      disposable.dispose()
      return disposable
    }
    this.disposables.push(disposable)
    return disposable
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }

  get isDisposed(): boolean {
    return this.disposed
  }
}

/**
 * Holds a single disposable value. When a new value is set, the previous one
 * is automatically disposed. Useful for resources that get replaced over time
 * (e.g., a file watcher that changes when the directory changes).
 */
export class MutableDisposable implements IDisposable {
  private _value: IDisposable | undefined

  get value(): IDisposable | undefined {
    return this._value
  }

  set value(value: IDisposable | undefined) {
    if (this._value) {
      this._value.dispose()
    }
    this._value = value
  }

  dispose(): void {
    if (this._value) {
      this._value.dispose()
      this._value = undefined
    }
  }
}

/**
 * Typed event emitter with disposable subscriptions (like VS Code's Emitter).
 */
export class Emitter<T> implements IDisposable {
  private listeners: Array<(value: T) => void> = []
  private disposed = false

  /** Subscribe to the event. Returns a disposable to unsubscribe. */
  on(listener: (value: T) => void): IDisposable {
    if (this.disposed) return toDisposable(() => {})
    this.listeners.push(listener)
    return toDisposable(() => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) {
        this.listeners.splice(idx, 1)
      }
    })
  }

  /** Fire the event, notifying all listeners. */
  fire(value: T): void {
    if (this.disposed) return
    for (const listener of [...this.listeners]) {
      listener(value)
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners = []
  }
}
