import { beforeEach, describe, expect, it, vi } from 'vitest'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import {
  prepareDocumentsForCompile,
  prepareDocumentsForManualCompile
} from '../../renderer/services/compilePersistenceCoordinator'
import { useEditorStore } from '../../renderer/store/useEditorStore'

const mainPath = '/project/main.tex'
const chapterPath = '/project/chapter.tex'
const saveFileBatchMock =
  vi.fn<(files: Array<{ content: string; filePath: string }>) => Promise<{ success: boolean }>>()

describe('manual compile preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(mainPath, 'main')
    useEditorStore.getState().openFileInTab(chapterPath, 'chapter')
    Object.assign(window.api, { saveFileBatch: saveFileBatchMock })
    saveFileBatchMock.mockResolvedValue({ success: true })
    vi.mocked(window.api.clearRecoverySnapshot).mockResolvedValue(undefined)
  })

  it('transactionally saves every dirty document before compiling', async () => {
    useEditorStore.getState().setActiveTab(mainPath)
    useEditorStore.getState().updateActiveDocument('main edited', 'editor')
    useEditorStore.getState().setActiveTab(chapterPath)
    useEditorStore.getState().updateActiveDocument('chapter edited', 'editor')
    useEditorStore.getState().setActiveTab(mainPath)
    const snapshot = documentRegistry.snapshot(mainPath)!

    await prepareDocumentsForManualCompile(mainPath, snapshot)

    expect(saveFileBatchMock).toHaveBeenCalledWith([
      { filePath: mainPath, content: 'main edited' },
      { filePath: chapterPath, content: 'chapter edited' }
    ])
    expect(documentRegistry.getModel(mainPath)?.isDirty).toBe(false)
    expect(documentRegistry.getModel(chapterPath)?.isDirty).toBe(false)
  })

  it('does not save when the transactional write fails', async () => {
    useEditorStore.getState().setActiveTab(mainPath)
    useEditorStore.getState().updateActiveDocument('main edited', 'editor')
    const snapshot = documentRegistry.snapshot(mainPath)!
    saveFileBatchMock.mockRejectedValueOnce(new Error('disk full'))

    await expect(prepareDocumentsForManualCompile(mainPath, snapshot)).rejects.toThrow('disk full')
    expect(documentRegistry.getModel(mainPath)?.isDirty).toBe(true)
  })

  it('blocks an inactive history restore from being saved implicitly', async () => {
    useEditorStore.getState().setActiveTab(chapterPath)
    useEditorStore.getState().updateActiveDocument('restored', 'history-restore')
    useEditorStore.getState().setActiveTab(mainPath)
    const snapshot = documentRegistry.snapshot(mainPath)!

    await expect(prepareDocumentsForManualCompile(mainPath, snapshot)).rejects.toThrow(
      'chapter.tex'
    )
    expect(saveFileBatchMock).not.toHaveBeenCalled()
  })

  it('automatically saves eligible documents while preserving inactive history restores', async () => {
    useEditorStore.getState().setActiveTab(chapterPath)
    useEditorStore.getState().updateActiveDocument('restored', 'history-restore')
    useEditorStore.getState().setActiveTab(mainPath)
    useEditorStore.getState().updateActiveDocument('main edited', 'editor')
    const snapshot = documentRegistry.snapshot(mainPath)!

    const result = await prepareDocumentsForCompile({
      activeFilePath: mainPath,
      activeSnapshot: snapshot,
      mode: 'automatic'
    })

    expect(result).toEqual({ status: 'ready', savedFilePaths: [mainPath] })
    expect(saveFileBatchMock).toHaveBeenCalledWith([{ filePath: mainPath, content: 'main edited' }])
    expect(documentRegistry.getModel(chapterPath)?.isDirty).toBe(true)
    expect(documentRegistry.getModel(chapterPath)?.requiresExplicitSave).toBe(true)
  })

  it('reports a stale preparation when a document changes during the batch save', async () => {
    useEditorStore.getState().setActiveTab(mainPath)
    useEditorStore.getState().updateActiveDocument('main edited', 'editor')
    const snapshot = documentRegistry.snapshot(mainPath)!
    saveFileBatchMock.mockImplementationOnce(async () => {
      useEditorStore.getState().updateActiveDocument('changed while saving', 'editor')
      return { success: true }
    })

    const result = await prepareDocumentsForCompile({
      activeFilePath: mainPath,
      activeSnapshot: snapshot,
      mode: 'automatic'
    })

    expect(result.status).toBe('stale')
    expect(documentRegistry.getModel(mainPath)?.isDirty).toBe(true)
  })
})
