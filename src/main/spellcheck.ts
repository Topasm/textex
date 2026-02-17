import path from 'path'
import { app } from 'electron'
import { Worker } from 'worker_threads'

const isDev = !app.isPackaged

let worker: Worker | null = null
let initialized = false
const pendingCallbacks = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>()
let nextId = 0

function getDictionaryPath(language: string): { aff: string; dic: string } {
  const basePath = isDev
    ? path.join(__dirname, '../../resources/dictionaries')
    : path.join(process.resourcesPath!, 'dictionaries')

  return {
    aff: path.join(basePath, `${language}.aff`),
    dic: path.join(basePath, `${language}.dic`)
  }
}

function ensureWorker(): Worker {
  if (worker) return worker

  const workerPath = path.join(__dirname, 'workers', 'spellWorker.js')
  worker = new Worker(workerPath)

  worker.on('message', (msg: { type: string; id?: number; [key: string]: unknown }) => {
    // Route responses to pending callbacks
    if (msg.id !== undefined) {
      const cb = pendingCallbacks.get(msg.id)
      if (cb) {
        pendingCallbacks.delete(msg.id)
        cb.resolve(msg)
      }
    }
  })

  worker.on('error', (err) => {
    // Reject all pending callbacks
    for (const cb of pendingCallbacks.values()) {
      cb.reject(err)
    }
    pendingCallbacks.clear()
    worker = null
    initialized = false
  })

  return worker
}

function sendToWorker(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = nextId++
  const w = ensureWorker()
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject
    })
    w.postMessage({ ...msg, id })
  })
}

export async function initSpellChecker(
  language: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const paths = getDictionaryPath(language)
    const response = await sendToWorker({
      type: 'init',
      affPath: paths.aff,
      dicPath: paths.dic
    })
    if ((response as { success: boolean }).success) {
      initialized = true
      return { success: true }
    }
    initialized = false
    return { success: false, error: (response as { error?: string }).error }
  } catch (err) {
    initialized = false
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Failed to init spell checker for "${language}": ${message}` }
  }
}

export async function checkWords(words: string[]): Promise<string[]> {
  if (!initialized || !worker) return []
  // Deduplicate before sending to worker for efficiency
  const uniqueWords = [...new Set(words)]
  const response = await sendToWorker({ type: 'check', words: uniqueWords })
  return (response as { misspelled: string[] }).misspelled
}

export async function getSuggestions(word: string): Promise<string[]> {
  if (!initialized || !worker) return []
  const response = await sendToWorker({ type: 'suggest', word })
  return (response as { suggestions: string[] }).suggestions
}

export async function addWord(word: string): Promise<{ success: boolean }> {
  if (!initialized || !worker) return { success: true }
  await sendToWorker({ type: 'add', word })
  return { success: true }
}

export async function setLanguage(language: string): Promise<{ success: boolean }> {
  return initSpellChecker(language)
}
