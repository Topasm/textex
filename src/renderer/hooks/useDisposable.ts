import { useEffect, useRef } from 'react'
import { DisposableStore, type IDisposable } from '../utils/disposable'

/**
 * React hook that creates a DisposableStore, disposes on unmount,
 * and provides an `.add()` method for registering cleanup actions.
 *
 * The store is recreated whenever `deps` change (previous store is disposed first).
 */
export function useDisposable(
  setup: (store: DisposableStore) => void,
  deps: React.DependencyList
): void {
  const storeRef = useRef<DisposableStore | null>(null)

  useEffect(() => {
    const store = new DisposableStore()
    storeRef.current = store
    setup(store)
    return () => {
      store.dispose()
      storeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
