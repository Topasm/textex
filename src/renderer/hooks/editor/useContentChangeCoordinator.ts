import { useEffect, useRef } from 'react'

export interface ContentTask {
  key: string
  fn: () => void | Promise<void>
  delayMs: number
  idle?: boolean
}

/**
 * Coordinates multiple content-change-driven tasks through a single useEffect,
 * replacing N independent debounce timers with a unified scheduler.
 *
 * Benefits over independent debounced hooks:
 * - Single React dependency check for content instead of N separate useEffects
 * - All pending tasks cancelled atomically when content changes again
 * - Lower-priority tasks deferred via requestIdleCallback to avoid jank
 * - Reduces timer overhead and GC pressure
 */
export function useContentChangeCoordinator(
  content: string,
  tasks: ContentTask[]
): void {
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const idleHandlesRef = useRef<number[]>([])
  const mountedRef = useRef(false)

  useEffect(() => {
    // Skip the very first render — let individual hooks handle their own initialization
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    // Cancel all pending timers from previous content change
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
    for (const h of idleHandlesRef.current) {
      if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(h)
      else clearTimeout(h)
    }
    idleHandlesRef.current = []

    // Schedule each task at its configured delay
    for (const task of tasksRef.current) {
      const timer = setTimeout(() => {
        if (task.idle && typeof requestIdleCallback !== 'undefined') {
          const handle = requestIdleCallback(
            () => { task.fn() },
            { timeout: task.delayMs + 2000 }
          )
          idleHandlesRef.current.push(handle)
        } else {
          task.fn()
        }
      }, task.delayMs)
      timersRef.current.push(timer)
    }

    return () => {
      for (const t of timersRef.current) clearTimeout(t)
      for (const h of idleHandlesRef.current) {
        if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(h)
        else clearTimeout(h)
      }
    }
  }, [content])

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t)
      timersRef.current = []
      for (const h of idleHandlesRef.current) {
        if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(h)
        else clearTimeout(h)
      }
      idleHandlesRef.current = []
    }
  }, [])
}
