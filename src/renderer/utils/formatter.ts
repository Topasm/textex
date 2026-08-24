import { formatLatexDirect } from './formatterRuntime'
import type { FormatterWorkerRequest, FormatterWorkerResponse } from './formatterWorkerProtocol'
import type { FormatOptions } from './formatterWorkerProtocol'

export type { FormatOptions } from './formatterWorkerProtocol'

interface PendingFormatRequest {
  resolve: (formatted: string) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const FORMATTER_WORKER_TIMEOUT_MS = 30_000

let formatterWorker: Worker | null = null
let workerUnavailable = false
let nextRequestId = 0
const pendingRequests = new Map<number, PendingFormatRequest>()

function rejectPendingRequests(error: Error): void {
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timeout)
    pending.reject(error)
  }
  pendingRequests.clear()
}

function disableWorker(error: Error): void {
  const worker = formatterWorker
  formatterWorker = null
  workerUnavailable = true
  worker?.terminate()
  rejectPendingRequests(error)
}

function handleWorkerMessage(event: MessageEvent<FormatterWorkerResponse>): void {
  const response = event.data
  const pending = pendingRequests.get(response.requestId)
  if (!pending) return

  clearTimeout(pending.timeout)
  pendingRequests.delete(response.requestId)

  if (response.type === 'format-result') {
    pending.resolve(response.formatted)
    return
  }

  pending.reject(new Error(response.message))
}

function getFormatterWorker(): Worker | null {
  if (formatterWorker) return formatterWorker
  if (workerUnavailable || typeof Worker === 'undefined') return null

  try {
    const worker = new Worker(new URL('./formatter.worker.ts', import.meta.url), {
      type: 'module',
      name: 'textex-latex-formatter'
    })
    worker.onmessage = handleWorkerMessage
    worker.onerror = () => disableWorker(new Error('LaTeX formatter worker failed'))
    worker.onmessageerror = () =>
      disableWorker(new Error('LaTeX formatter worker returned an unreadable response'))
    formatterWorker = worker
    return worker
  } catch {
    workerUnavailable = true
    return null
  }
}

function formatLatexInWorker(code: string, options: FormatOptions): Promise<string> | null {
  const worker = getFormatterWorker()
  if (!worker) return null

  const requestId = ++nextRequestId
  const request: FormatterWorkerRequest = {
    type: 'format',
    requestId,
    code,
    options
  }

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!pendingRequests.has(requestId)) return
      disableWorker(new Error('LaTeX formatter worker timed out'))
    }, FORMATTER_WORKER_TIMEOUT_MS)

    pendingRequests.set(requestId, { resolve, reject, timeout })
    try {
      worker.postMessage(request)
    } catch (error) {
      disableWorker(
        error instanceof Error ? error : new Error('Failed to contact LaTeX formatter worker')
      )
    }
  })
}

/**
 * Formats LaTeX source code off the renderer thread when workers are available.
 * The direct formatter is also lazy-loaded so neither Prettier nor the LaTeX
 * plugin is part of the initial renderer bundle.
 */
export const formatLatex = async (code: string, options: FormatOptions = {}): Promise<string> => {
  const workerResult = formatLatexInWorker(code, options)
  if (workerResult) {
    try {
      return await workerResult
    } catch (error) {
      console.warn('[Formatter] Worker formatting failed; using direct fallback:', error)
    }
  }

  try {
    return await formatLatexDirect(code, options)
  } catch (error) {
    console.warn('[Formatter] Failed to format code:', error)
    // Graceful fallback: return original code so the user loses nothing
    return code
  }
}
