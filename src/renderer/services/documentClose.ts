import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

/**
 * The only user-facing tab close path. Programmatic callers that have already
 * saved or explicitly rejected dirty files may continue to use the store action.
 */
export function closeEditorTab(filePath: string): boolean {
  const model = documentRegistry.getModel(filePath)
  if (
    model?.isDirty &&
    !window.confirm(`"${fileName(filePath)}" has unsaved changes. Discard them and close?`)
  ) {
    return false
  }

  useEditorStore.getState().closeTab(filePath)
  return true
}
