import { parentPort } from 'worker_threads'
import { parseLatexLog } from '../logparser'

/**
 * Worker thread for log parsing. Designed for pool usage:
 * - Handles multiple sequential messages (doesn't exit after one parse)
 * - Catches errors per-message to avoid crashing the worker
 */
parentPort?.on('message', (msg: { log: string; rootFile: string }) => {
  try {
    const diagnostics = parseLatexLog(msg.log, msg.rootFile)
    parentPort?.postMessage(diagnostics)
  } catch {
    // Return empty diagnostics rather than crashing the pooled worker
    parentPort?.postMessage([])
  }
})
