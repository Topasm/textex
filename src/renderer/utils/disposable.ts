/**
 * VS Code–style disposable pattern.
 * Allows deterministic cleanup of resources (event listeners, timers, etc.).
 */

export interface IDisposable {
  dispose(): void
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

/** Wrap a cleanup function as an IDisposable. */
export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn }
}
