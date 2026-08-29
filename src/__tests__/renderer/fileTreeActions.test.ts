import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFileTreeEntry, renameFileTreeEntry } from '../../renderer/services/fileTreeActions'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { proseAnchorFor, proseModeFor, useUiStore } from '../../renderer/store/useUiStore'

const directory = { name: 'chapters', path: '/project/chapters' }
const renamePathMock = vi.fn(async () => ({ success: true }))
const deletePathMock = vi.fn(async () => ({ success: true }))

describe('file tree actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useUiStore.setState({ proseModeDocumentIds: [], proseAnchors: {} })
    Object.assign(window.api, {
      renamePath: renamePathMock,
      deletePath: deletePathMock
    })
  })

  it('rejects invalid names without invoking the native rename', async () => {
    await expect(renameFileTreeEntry(directory, '../outside')).resolves.toEqual({
      status: 'invalid-name'
    })
    expect(renamePathMock).not.toHaveBeenCalled()
  })

  it('renames a directory and reopens affected documents with the active one last', async () => {
    const first = '/project/chapters/first.tex'
    const active = '/project/chapters/active.tex'
    useEditorStore.getState().openFileInTab(first, 'first')
    useEditorStore.getState().openFileInTab(active, 'active')
    vi.mocked(window.api.readFile).mockImplementation(async (filePath) => ({
      filePath,
      content: filePath.endsWith('active.tex') ? 'active' : 'first'
    }))

    await expect(renameFileTreeEntry(directory, 'sections')).resolves.toEqual({
      status: 'renamed',
      destination: '/project/sections'
    })

    expect(window.api.readFile).toHaveBeenNthCalledWith(1, '/project/sections/first.tex')
    expect(window.api.readFile).toHaveBeenNthCalledWith(2, '/project/sections/active.tex')
    expect(useEditorStore.getState().activeFilePath).toBe('/project/sections/active.tex')
  })

  it('moves per-document prose state when an open file is renamed', async () => {
    const oldPath = '/project/chapters/main.tex'
    const newPath = '/project/sections/main.tex'
    useEditorStore.getState().openFileInTab(oldPath, 'content')
    useUiStore.getState().setProseMode(oldPath, true)
    useUiStore.getState().setProseAnchor(oldPath, 12, 'source')
    vi.mocked(window.api.readFile).mockResolvedValue({ filePath: newPath, content: 'content' })

    await renameFileTreeEntry(directory, 'sections')

    expect(proseModeFor(useUiStore.getState(), oldPath)).toBe(false)
    expect(proseModeFor(useUiStore.getState(), newPath)).toBe(true)
    expect(proseAnchorFor(useUiStore.getState(), oldPath)).toBeNull()
    expect(proseAnchorFor(useUiStore.getState(), newPath)).toEqual({
      line: 12,
      origin: 'source'
    })
  })

  it('protects dirty documents from rename and delete', async () => {
    const filePath = '/project/chapters/dirty.tex'
    useEditorStore.getState().openFileInTab(filePath, 'original')
    useEditorStore.getState().updateActiveDocument('edited', 'editor')
    const confirmDelete = vi.fn(() => true)

    await expect(renameFileTreeEntry(directory, 'sections')).resolves.toEqual({
      status: 'dirty-documents'
    })
    await expect(deleteFileTreeEntry(directory, confirmDelete)).resolves.toEqual({
      status: 'dirty-documents'
    })
    expect(confirmDelete).not.toHaveBeenCalled()
    expect(renamePathMock).not.toHaveBeenCalled()
    expect(deletePathMock).not.toHaveBeenCalled()
  })

  it('deletes a confirmed entry and closes affected clean documents', async () => {
    const filePath = '/project/chapters/clean.tex'
    useEditorStore.getState().openFileInTab(filePath, 'clean')
    useUiStore.getState().setProseMode(filePath, true)
    useUiStore.getState().setProseAnchor(filePath, 3, 'preview')
    await expect(deleteFileTreeEntry(directory, () => true)).resolves.toEqual({
      status: 'deleted'
    })

    expect(deletePathMock).toHaveBeenCalledWith(directory.path)
    expect(useEditorStore.getState().openFiles).not.toHaveProperty(filePath)
    expect(proseModeFor(useUiStore.getState(), filePath)).toBe(false)
    expect(proseAnchorFor(useUiStore.getState(), filePath)).toBeNull()
  })
})
