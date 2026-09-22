import type { DocumentSnapshot } from '../models/documentModel'
import { documentRegistry } from '../models/documentRegistry'

/** Recognizes our own watcher events, including while the native save is in flight. */
export async function documentDiskWrite<T extends { success: boolean }>(
  documents: ReadonlyArray<{ filePath: string; snapshot: DocumentSnapshot }>,
  write: () => Promise<T>
): Promise<T> {
  const finish = documents.map(({ filePath, snapshot }) =>
    documentRegistry.beginDiskWrite(filePath, snapshot)
  )
  let success = false
  try {
    const result = await write()
    success = result.success
    return result
  } finally {
    for (const complete of finish) complete(success)
  }
}
