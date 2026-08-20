import type { CompileResult } from '../../shared/compiler'
import type { CompileIdentity, CompilePriority } from '../../shared/compileProtocol'

export type { CompilePriority }

type ActiveCancelFn = () => void
type CompileFunction = (filePath: string) => Promise<CompileResult>

interface QueueEntry {
  filePath: string
  priority: CompilePriority
  identity?: CompileIdentity
  compileFn: CompileFunction
  cancelActive?: ActiveCancelFn
  resolve: (result: CompileResult) => void
  reject: (error: Error) => void
}

interface ActiveEntry {
  filePath: string
  priority: CompilePriority
  identity?: CompileIdentity
  cancelActive?: ActiveCancelFn
}

interface CompileMetrics {
  totalCompiles: number
  totalTimeMs: number
  timeouts: number
  cancellations: number
  superseded: number
}

const DEFAULT_TIMEOUT_MS = 120_000

let activeEntry: ActiveEntry | null = null
let currentAbort: AbortController | null = null
const pending: QueueEntry[] = []
const metrics: CompileMetrics = {
  totalCompiles: 0,
  totalTimeMs: 0,
  timeouts: 0,
  cancellations: 0,
  superseded: 0
}

function isNewerIdentity(next?: CompileIdentity, current?: CompileIdentity): boolean {
  if (!next || !current || next.documentId !== current.documentId) return false
  return next.requestId > current.requestId
}

function shouldPreemptActive(entry: Omit<QueueEntry, 'resolve' | 'reject'>): boolean {
  if (!activeEntry) return false
  if (activeEntry.priority === 'background' && entry.priority !== 'background') return true
  if (entry.priority === 'high' && activeEntry.priority !== 'high') return true
  return entry.priority !== 'background' && isNewerIdentity(entry.identity, activeEntry.identity)
}

function supersedePending(identity?: CompileIdentity): void {
  if (!identity) return
  for (let index = pending.length - 1; index >= 0; index--) {
    const queuedIdentity = pending[index].identity
    if (
      queuedIdentity?.documentId === identity.documentId &&
      queuedIdentity.requestId < identity.requestId
    ) {
      const [superseded] = pending.splice(index, 1)
      metrics.superseded += 1
      superseded.reject(new Error('Compilation was superseded by a newer document revision'))
    }
  }
}

function insertByPriority(entry: QueueEntry): void {
  if (entry.priority === 'high') {
    const index = pending.findIndex((queued) => queued.priority !== 'high')
    if (index >= 0) pending.splice(index, 0, entry)
    else pending.push(entry)
    return
  }

  if (entry.priority === 'normal') {
    const index = pending.findIndex((queued) => queued.priority === 'background')
    if (index >= 0) pending.splice(index, 0, entry)
    else pending.push(entry)
    return
  }

  pending.push(entry)
}

/**
 * Serial compiler actor with priority scheduling and revision-aware latest-wins
 * backpressure. A newer request supersedes queued work for the same document
 * and preempts an older active revision.
 */
export function enqueueCompile(
  filePath: string,
  compileFn: CompileFunction,
  priority: CompilePriority = 'normal',
  cancelActive?: ActiveCancelFn,
  identity?: CompileIdentity
): Promise<CompileResult> {
  const baseEntry = { filePath, priority, identity, compileFn, cancelActive }

  if (!activeEntry) {
    return runCompile(baseEntry)
  }

  if (shouldPreemptActive(baseEntry) && currentAbort && !currentAbort.signal.aborted) {
    currentAbort.abort()
    ;(activeEntry.cancelActive ?? cancelActive)?.()
  }

  return new Promise<CompileResult>((resolve, reject) => {
    supersedePending(identity)
    insertByPriority({ ...baseEntry, resolve, reject })
  })
}

async function runCompile(entry: Omit<QueueEntry, 'resolve' | 'reject'>): Promise<CompileResult> {
  const abort = new AbortController()
  currentAbort = abort
  activeEntry = {
    filePath: entry.filePath,
    priority: entry.priority,
    identity: entry.identity,
    cancelActive: entry.cancelActive
  }

  const start = performance.now()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort.abort()
    entry.cancelActive?.()
    metrics.timeouts += 1
  }, DEFAULT_TIMEOUT_MS)

  try {
    const result = await entry.compileFn(entry.filePath)
    if (abort.signal.aborted) {
      throw new Error(
        timedOut
          ? `Compilation timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`
          : 'Compilation was cancelled'
      )
    }
    return result
  } catch (error) {
    if (timedOut) {
      throw new Error(`Compilation timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`)
    }
    if (abort.signal.aborted) metrics.cancellations += 1
    throw error
  } finally {
    clearTimeout(timeout)
    metrics.totalCompiles += 1
    metrics.totalTimeMs += performance.now() - start
    currentAbort = null
    activeEntry = null
    drainPending()
  }
}

function drainPending(): void {
  const entry = pending.shift()
  if (!entry) return

  runCompile(entry).then(entry.resolve, (error) =>
    entry.reject(error instanceof Error ? error : new Error(String(error)))
  )
}

export function cancelCurrentCompile(): boolean {
  if (!currentAbort || !activeEntry) return false
  if (!currentAbort.signal.aborted) {
    currentAbort.abort()
    activeEntry.cancelActive?.()
  }
  return true
}

export function isCompileInProgress(): boolean {
  return activeEntry !== null
}

export function getActiveCompilePriority(): CompilePriority | null {
  return activeEntry?.priority ?? null
}

export function getCompileMetrics(): {
  totalCompiles: number
  avgCompileTimeMs: number
  timeouts: number
  cancellations: number
  superseded: number
  queueDepth: number
} {
  return {
    totalCompiles: metrics.totalCompiles,
    avgCompileTimeMs: metrics.totalCompiles > 0 ? metrics.totalTimeMs / metrics.totalCompiles : 0,
    timeouts: metrics.timeouts,
    cancellations: metrics.cancellations,
    superseded: metrics.superseded,
    queueDepth: pending.length
  }
}
