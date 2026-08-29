import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { clearRecoveryForFile } from './crashRecovery'
import { flushPendingDocumentEdits } from './pendingDocumentEdits'

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

/**
 * The only user-facing tab close path. Programmatic callers that have already
 * saved or explicitly rejected dirty files may continue to use the store action.
 */
export function closeEditorTab(filePath: string): boolean {
  flushPendingDocumentEdits(filePath)
  const model = documentRegistry.getModel(filePath)
  if (
    model?.isDirty &&
    !window.confirm(`"${fileName(filePath)}" has unsaved changes. Discard them and close?`)
  ) {
    return false
  }

  void clearRecoveryForFile(filePath).catch(() => undefined)
  useEditorStore.getState().closeTab(filePath)
  useUiStore.getState().forgetProseMode(filePath)
  return true
}
