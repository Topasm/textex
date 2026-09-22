import { documentRegistry } from '../models/documentRegistry'
import type { DocumentModel } from '../models/documentModel'

const pending = new WeakMap<DocumentModel, Promise<void>>()

/** Blocks new saves as soon as a watcher event arrives, including its debounce. */
export function beginPendingDiskReload(model: DocumentModel): () => void {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  pending.set(model, promise)
  return () => {
    if (pending.get(model) === promise) pending.delete(model)
    resolve()
  }
}

/** Returns null on the normal save path so no unnecessary async gap is added. */
export function pendingDiskReload(filePath: string): Promise<void> | null {
  const model = documentRegistry.getModel(filePath)
  if (!model || !pending.has(model)) return null
  return (async () => {
    while (pending.has(model)) await pending.get(model)
  })()
}
