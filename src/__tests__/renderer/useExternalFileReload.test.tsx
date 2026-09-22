import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExternalFileReload } from '../../renderer/hooks/useExternalFileReload'
import { useAutoCompile } from '../../renderer/hooks/useAutoCompile'
import { useFileOps } from '../../renderer/hooks/useFileOps'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { documentDiskWrite } from '../../renderer/services/documentDiskWrite'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import { AUTO_COMPILE_DELAY_MS } from '../../renderer/constants'

const path = '/project/main.tex'
const change = { type: 'change' as const, filename: 'main.tex' }
const saveBatch = vi.fn(async () => ({ success: true }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function advance(ms = 100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('external file reload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(path, 'original')
    useUiStore.setState({ externalChangeConflicts: [] })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, watchOpenFiles: true, autoCompile: false, formatOnSave: false }
    }))
    vi.mocked(window.api.readFile).mockResolvedValue({ filePath: path, content: 'external' })
    vi.mocked(window.api.saveFile).mockResolvedValue({ success: true })
    Object.assign(window.api, { saveFileBatch: saveBatch })
    vi.mocked(window.api.compile).mockImplementation(async (request) => ({
      requestId: request.requestId,
      documentId: request.documentId,
      documentRevision: request.documentRevision,
      pdfPath: '/project/main.pdf',
      compiledFilePath: request.filePath
    }))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('replaces unsaved edits with disk content and does not write the file back', async () => {
    useEditorStore.getState().updateActiveDocument('local draft', 'editor')
    const { result } = renderHook(() => useExternalFileReload('/project'))
    act(() => result.current(change))
    await advance()
    expect(documentRegistry.snapshot(path)?.text).toBe('external')
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useUiStore.getState().externalChangeConflicts).toEqual([])
    expect(window.api.saveFile).not.toHaveBeenCalled()
    expect(saveBatch).not.toHaveBeenCalled()
    expect(window.api.clearRecoverySnapshot).toHaveBeenCalledWith(path)
  })

  it('coalesces events including atomic file replacement and ignores duplicate content', async () => {
    const { result } = renderHook(() => useExternalFileReload('/project/'))
    act(() => {
      result.current(change)
      result.current({ ...change, type: 'rename' })
      result.current(change)
    })
    await advance()
    const snapshot = documentRegistry.snapshot(path)
    expect(window.api.readFile).toHaveBeenCalledTimes(1)
    act(() => result.current(change))
    await advance()
    expect(documentRegistry.snapshot(path)).toBe(snapshot)
  })

  it('marks a matching local edit clean when another tool has saved that same text', async () => {
    useEditorStore.getState().updateActiveDocument('external', 'editor')
    const { result } = renderHook(() => useExternalFileReload('/project'))
    act(() => result.current(change))
    await advance()
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it.each([false, true])(
    'preserves newer typing after an own-save echo (completed: %s)',
    async (completed) => {
      useEditorStore.getState().updateActiveDocument('saved text', 'editor')
      const saved = documentRegistry.snapshot(path)!
      const native = deferred<{ success: boolean }>()
      const saving = documentDiskWrite([{ filePath: path, snapshot: saved }], () => native.promise)
      if (completed) {
        native.resolve({ success: true })
        await saving
      }
      useEditorStore.getState().updateActiveDocument('newer typing', 'editor')
      vi.mocked(window.api.readFile).mockResolvedValue({ filePath: path, content: 'saved text' })
      const { result } = renderHook(() => useExternalFileReload('/project'))
      act(() => result.current(change))
      await advance()
      expect(documentRegistry.snapshot(path)?.text).toBe('newer typing')
      expect(useEditorStore.getState().isDirty).toBe(true)
      native.resolve({ success: true })
      await saving
    }
  )

  it('ignores an older disk read after a newer watcher event', async () => {
    const first = deferred<{ filePath: string; content: string }>()
    vi.mocked(window.api.readFile).mockReturnValueOnce(first.promise)
    const { result } = renderHook(() => useExternalFileReload('/project'))
    act(() => result.current(change))
    await advance()
    act(() => result.current(change))
    await advance()
    await act(async () => {
      first.resolve({ filePath: path, content: 'outdated' })
    })
    expect(documentRegistry.snapshot(path)?.text).toBe('external')
  })

  it('retries after typing during a read instead of applying a stale result or losing the change', async () => {
    const first = deferred<{ filePath: string; content: string }>()
    vi.mocked(window.api.readFile).mockReturnValueOnce(first.promise)
    const { result } = renderHook(() => useExternalFileReload('/project'))
    act(() => result.current(change))
    await advance()
    act(() => useEditorStore.getState().updateActiveDocument('typing', 'editor'))
    await act(async () => {
      first.resolve({ filePath: path, content: 'outdated' })
    })
    expect(documentRegistry.snapshot(path)?.text).toBe('typing')
    await advance()
    expect(documentRegistry.snapshot(path)?.text).toBe('external')
  })

  it('invalidates reads when the project changes or the document is reopened', async () => {
    const first = deferred<{ filePath: string; content: string }>()
    vi.mocked(window.api.readFile).mockReturnValueOnce(first.promise)
    const { result, rerender } = renderHook(({ root }) => useExternalFileReload(root), {
      initialProps: { root: '/project' }
    })
    act(() => result.current(change))
    await advance()
    act(() => {
      useEditorStore.getState().closeTab(path)
      useEditorStore.getState().openFileInTab(path, 'reopened')
    })
    rerender({ root: '/another' })
    await act(async () => {
      first.resolve({ filePath: path, content: 'outdated' })
    })
    expect(documentRegistry.snapshot(path)?.text).toBe('reopened')
  })

  it('matches Windows path casing and refreshes inactive tabs after a directory rescan', async () => {
    const windowsPath = 'C:\\Paper\\Chapters\\Intro.tex'
    useEditorStore.getState().openFileInTab(windowsPath, 'old chapter')
    useEditorStore.getState().setActiveTab(path)
    const { result } = renderHook(() => useExternalFileReload('c:\\paper\\'))
    act(() => result.current({ type: 'rename', filename: 'chapters' }))
    await advance()
    expect(window.api.readFile).toHaveBeenCalledWith(windowsPath)
    expect(documentRegistry.snapshot(windowsPath)?.text).toBe('external')
    vi.mocked(window.api.readFile).mockResolvedValue({ filePath: windowsPath, content: 'rescan' })
    act(() => result.current({ type: 'rename', filename: '', indexInvalidated: true }))
    await advance()
    expect(documentRegistry.snapshot(windowsPath)?.text).toBe('rescan')
    expect(useEditorStore.getState().activeFilePath).toBe(path)
  })

  it('respects disabled watching even if it is disabled during a pending read', async () => {
    const first = deferred<{ filePath: string; content: string }>()
    vi.mocked(window.api.readFile).mockReturnValueOnce(first.promise)
    const { result } = renderHook(() => useExternalFileReload('/project'))
    act(() => result.current(change))
    await advance()
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, watchOpenFiles: false }
    }))
    await act(async () => {
      first.resolve({ filePath: path, content: 'external' })
    })
    act(() => result.current(change))
    await advance()
    expect(documentRegistry.snapshot(path)?.text).toBe('original')
    expect(window.api.readFile).toHaveBeenCalledTimes(1)
  })

  it('waits for an external read before auto compile and never saves the old draft', async () => {
    useSettingsStore.setState((state) => ({ settings: { ...state.settings, autoCompile: true } }))
    useEditorStore.getState().updateActiveDocument('old draft', 'editor')
    const first = deferred<{ filePath: string; content: string }>()
    vi.mocked(window.api.readFile).mockReturnValueOnce(first.promise)
    const { result } = renderHook(() => {
      useAutoCompile()
      return useExternalFileReload('/project')
    })
    act(() => result.current(change))
    await advance(AUTO_COMPILE_DELAY_MS + 100)
    expect(saveBatch).not.toHaveBeenCalled()
    expect(window.api.compile).not.toHaveBeenCalled()
    await act(async () => {
      first.resolve({ filePath: path, content: 'external' })
    })
    await advance(AUTO_COMPILE_DELAY_MS)
    expect(saveBatch).not.toHaveBeenCalled()
    expect(window.api.compile).toHaveBeenCalledTimes(1)
    expect(window.api.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        documentRevision: documentRegistry.getModel(path)?.revision
      })
    )
  })

  it('does not overwrite a pending external change on manual save', async () => {
    useEditorStore.getState().updateActiveDocument('old draft', 'editor')
    const { result } = renderHook(() => ({
      reload: useExternalFileReload('/project'),
      ...useFileOps()
    }))
    act(() => result.current.reload(change))
    const save = result.current.handleSave()
    expect(window.api.saveFile).not.toHaveBeenCalled()
    await advance()
    await save
    expect(documentRegistry.snapshot(path)?.text).toBe('external')
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })
})
