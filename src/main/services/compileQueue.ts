import type { CompileResult } from '../../shared/compiler'

// --- Types ---

export type CompilePriority = 'high' | 'normal'

type CompileFunction = (filePath: string) => Promise<CompileResult>

interface QueueEntry {
  filePath: string
  priority: CompilePriority
  resolve: (result: CompileResult) => void
  reject: (error: Error) => void
}

interface CompileMetrics {
  totalCompiles: number
  totalTimeMs: number
  timeouts: number
  cancellations: number
}

// --- Constants ---

const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes

// --- State ---

let isCompiling = false
let currentAbort: AbortController | null = null
const pending: QueueEntry[] = []
const metrics: CompileMetrics = {
  totalCompiles: 0,
  totalTimeMs: 0,
  timeouts: 0,
  cancellations: 0
}

/**
 * Enqueue a compilation request with optional priority.
 * High-priority requests (manual compile) jump ahead of normal (auto-compile).
 * If a compile is already in progress, the request is queued.
 * Pending requests for the same file are coalesced.
 */
export function enqueueCompile(
  filePath: string,
  compileFn: CompileFunction,
  priority: CompilePriority = 'normal'
): Promise<CompileResult> {
  if (!isCompiling) {
    return runCompile(filePath, compileFn)
  }

  return new Promise<CompileResult>((resolve, reject) => {
    const entry: QueueEntry = { filePath, priority, resolve, reject }

    if (priority === 'high') {
      // Insert before first normal-priority entry
      const idx = pending.findIndex((e) => e.priority === 'normal')
      if (idx === -1) {
        pending.push(entry)
      } else {
        pending.splice(idx, 0, entry)
      }
    } else {
      pending.push(entry)
    }
  })
}

async function runCompile(filePath: string, compileFn: CompileFunction): Promise<CompileResult> {
  isCompiling = true
  const abort = new AbortController()
  currentAbort = abort

  const start = performance.now()
  let timedOut = false

  const timeout = setTimeout(() => {
    timedOut = true
    abort.abort()
    metrics.timeouts++
  }, DEFAULT_TIMEOUT_MS)

  try {
    const result = await compileFn(filePath)
    if (abort.signal.aborted && !timedOut) {
      metrics.cancellations++
      throw new Error('Compilation was cancelled')
    }
    return result
  } catch (err) {
    if (timedOut) {
      throw new Error(`Compilation timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`)
    }
    if (abort.signal.aborted) {
      metrics.cancellations++
    }
    throw err
  } finally {
    clearTimeout(timeout)
    const elapsed = performance.now() - start
    metrics.totalCompiles++
    metrics.totalTimeMs += elapsed
    currentAbort = null
    isCompiling = false
    drainPending(compileFn)
  }
}

function drainPending(compileFn: CompileFunction): void {
  if (pending.length === 0) return

  // Take the first entry (highest priority due to insertion order)
  const entry = pending.shift()!

  // Coalesce: collect all other entries for the same file path
  const coalesced = [entry]
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].filePath === entry.filePath) {
      coalesced.push(pending.splice(i, 1)[0])
    }
  }

  runCompile(entry.filePath, compileFn).then(
    (result) => coalesced.forEach((e) => e.resolve(result)),
    (error) =>
      coalesced.forEach((e) => e.reject(error instanceof Error ? error : new Error(String(error))))
  )
}

/**
 * Cancel the current compilation (if any) via AbortController.
 */
export function cancelCurrentCompile(): boolean {
  if (currentAbort) {
    currentAbort.abort()
    return true
  }
  return false
}

/**
 * Check if a compile is currently in progress.
 */
export function isCompileInProgress(): boolean {
  return isCompiling
}

/**
 * Get compile queue metrics.
 */
export function getCompileMetrics(): {
  totalCompiles: number
  avgCompileTimeMs: number
  timeouts: number
  cancellations: number
  queueDepth: number
} {
  return {
    totalCompiles: metrics.totalCompiles,
    avgCompileTimeMs: metrics.totalCompiles > 0 ? metrics.totalTimeMs / metrics.totalCompiles : 0,
    timeouts: metrics.timeouts,
    cancellations: metrics.cancellations,
    queueDepth: pending.length
  }
}
