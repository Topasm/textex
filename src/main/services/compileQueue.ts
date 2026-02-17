import type { CompileResult } from '../../shared/compiler'

type CompileFunction = (filePath: string) => Promise<CompileResult>

interface QueueState {
  isCompiling: boolean
  pendingFilePath: string | null
  pendingResolvers: Array<{
    resolve: (result: CompileResult) => void
    reject: (error: Error) => void
  }>
}

const state: QueueState = {
  isCompiling: false,
  pendingFilePath: null,
  pendingResolvers: []
}

/**
 * Enqueue a compilation request. If a compile is already in progress,
 * coalesce with any existing pending request (only the latest file path matters).
 * When the current compile finishes, the pending one starts automatically.
 */
export function enqueueCompile(
  filePath: string,
  compileFn: CompileFunction
): Promise<CompileResult> {
  if (!state.isCompiling) {
    return runCompile(filePath, compileFn)
  }

  // A compile is in progress - coalesce into pending
  // If there's already a pending request for a different file, the new one replaces it.
  // Existing pending resolvers still get resolved when the pending compile runs.
  state.pendingFilePath = filePath

  return new Promise<CompileResult>((resolve, reject) => {
    state.pendingResolvers.push({ resolve, reject })
  })
}

async function runCompile(
  filePath: string,
  compileFn: CompileFunction
): Promise<CompileResult> {
  state.isCompiling = true
  try {
    const result = await compileFn(filePath)
    return result
  } finally {
    state.isCompiling = false
    drainPending(compileFn)
  }
}

function drainPending(compileFn: CompileFunction): void {
  if (!state.pendingFilePath || state.pendingResolvers.length === 0) {
    state.pendingFilePath = null
    state.pendingResolvers = []
    return
  }

  const filePath = state.pendingFilePath
  const resolvers = [...state.pendingResolvers]
  state.pendingFilePath = null
  state.pendingResolvers = []

  // Start the pending compile and wire up all waiting callers
  runCompile(filePath, compileFn).then(
    (result) => resolvers.forEach((r) => r.resolve(result)),
    (error) => resolvers.forEach((r) => r.reject(error instanceof Error ? error : new Error(String(error))))
  )
}

/**
 * Check if a compile is currently in progress.
 */
export function isCompileInProgress(): boolean {
  return state.isCompiling
}
