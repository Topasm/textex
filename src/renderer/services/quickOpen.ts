import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'

let requestSequence = 0

/** Reuse open buffers and reject disk reads superseded by navigation or another request. */
export async function openIndexedFile(path: string): Promise<void> {
  const sequence = ++requestSequence
  const root = useProjectStore.getState().projectRoot
  if (!root) return
  const openPath = documentRegistry.getFilePath(path)
  if (openPath) {
    useEditorStore.getState().setActiveTab(openPath)
    return
  }
  const epoch = useEditorStore.getState().tabMutationEpoch
  const current = () =>
    sequence === requestSequence &&
    root === useProjectStore.getState().projectRoot &&
    epoch === useEditorStore.getState().tabMutationEpoch
  let file
  try {
    file = await window.api.readFile(path)
  } catch (error) {
    if (current()) throw error
    return
  }
  if (
    !current() ||
    documentRegistry.has(path) ||
    normalizeDocumentId(file.filePath) !== normalizeDocumentId(path)
  )
    return
  useEditorStore.getState().openFileInTab(file.filePath, file.content)
}
