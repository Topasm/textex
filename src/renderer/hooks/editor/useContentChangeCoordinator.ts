import { useCallback, useEffect, useRef } from 'react'

export interface ContentTask {
  key: string
  fn: () => void | Promise<void>
  delayMs: number
  idle?: boolean
}

/**
 * Coordinates content-change-driven tasks without publishing document text to
 * React. The returned callback is invoked directly from the editor change path.
 *
 * Benefits over independent debounced hooks:
 * - Single React dependency check for content instead of N separate useEffects
 * - All pending tasks cancelled atomically when content changes again
 * - Lower-priority tasks deferred via requestIdleCallback to avoid jank
 * - Reduces timer overhead and GC pressure
 */
export function useContentChangeCoordinator(tasks: ContentTask[]): () => void {
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const idleHandlesRef = useRef<number[]>([])

  const cancelPending = useCallback((): void => {
    for (const timer of timersRef.current) clearTimeout(timer)
    timersRef.current = []
    for (const handle of idleHandlesRef.current) {
      if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(handle)
      else clearTimeout(handle)
    }
    idleHandlesRef.current = []
  }, [])

  const schedule = useCallback((): void => {
    cancelPending()

    for (const task of tasksRef.current) {
      const timer = setTimeout(() => {
        if (task.idle && typeof requestIdleCallback !== 'undefined') {
          const handle = requestIdleCallback(
            () => {
              task.fn()
            },
            { timeout: task.delayMs + 2000 }
          )
          idleHandlesRef.current.push(handle)
        } else {
          task.fn()
        }
      }, task.delayMs)
      timersRef.current.push(timer)
    }
  }, [cancelPending])

  // Full cleanup on unmount
  useEffect(() => {
    return cancelPending
  }, [cancelPending])

  return schedule
}
