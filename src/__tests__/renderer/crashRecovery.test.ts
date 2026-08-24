import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyRecoveryToEditor,
  discardRecoveryForFiles,
  installCrashRecoveryAutosnapshot,
  RECOVERY_AUTOSNAPSHOT_DELAY_MS,
  snapshotDirtyDocuments
} from '../../renderer/services/crashRecovery'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'

describe('crash recovery coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    vi.mocked(window.api.saveRecoverySnapshot).mockResolvedValue(undefined)
    vi.mocked(window.api.clearRecoverySnapshot).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces dirty document snapshots into the native recovery store', async () => {
    const filePath = '/project/main.tex'
    useEditorStore.getState().openFileInTab(filePath, 'disk')
    const dispose = installCrashRecoveryAutosnapshot()

    useEditorStore.getState().updateActiveDocument('draft one', 'editor')
    useEditorStore.getState().updateActiveDocument('draft two', 'editor')
    await vi.advanceTimersByTimeAsync(RECOVERY_AUTOSNAPSHOT_DELAY_MS)

    expect(window.api.saveRecoverySnapshot).toHaveBeenCalledTimes(1)
    expect(window.api.saveRecoverySnapshot).toHaveBeenCalledWith(filePath, 'draft two')
    dispose()
  })

  it('clears a recovery snapshot when its tab is closed', async () => {
    const filePath = '/project/main.tex'
    useEditorStore.getState().openFileInTab(filePath, 'disk')
    const dispose = installCrashRecoveryAutosnapshot()

    useEditorStore.getState().closeTab(filePath)
    await vi.runAllTimersAsync()
    expect(window.api.clearRecoverySnapshot).toHaveBeenCalledWith(filePath)
    dispose()
  })

  it('applies recovered text as an explicit unsaved editor change', () => {
    const filePath = '/project/main.tex'
    expect(
      applyRecoveryToEditor({
        item: {
          id: 'a'.repeat(64),
          filePath,
          capturedAtEpochMs: 10,
          size: 5,
          diskState: 'modified'
        },
        content: 'draft',
        diskContent: 'disk'
      })
    ).toBe(true)

    const model = documentRegistry.getModel(filePath)
    expect(documentRegistry.snapshot(filePath)?.text).toBe('draft')
    expect(model?.isDirty).toBe(true)
    expect(model?.requiresExplicitSave).toBe(true)
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })

  it('does not recreate a snapshot after the user confirms project-close discard', async () => {
    const filePath = '/project/discarded.tex'
    useEditorStore.getState().openFileInTab(filePath, 'disk')
    useEditorStore.getState().updateActiveDocument('discard me', 'editor')

    await discardRecoveryForFiles([filePath])
    await snapshotDirtyDocuments()

    expect(window.api.saveRecoverySnapshot).not.toHaveBeenCalled()
    expect(window.api.clearRecoverySnapshot).toHaveBeenCalledWith(filePath)
  })
})
