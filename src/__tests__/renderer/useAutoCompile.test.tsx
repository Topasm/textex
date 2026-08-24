import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_COMPILE_DELAY_MS } from '../../renderer/constants'
import { useAutoCompile } from '../../renderer/hooks/useAutoCompile'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import {
  beginCompileTicket,
  cancelPendingAutoCompile,
  resetCompileTicketsForTests,
  toCompileRequest
} from '../../renderer/services/compileCoordinator'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

const filePath = '/project/main.tex'
const saveFileBatchMock = vi.fn(async (_files: Array<{ content: string; filePath: string }>) => ({
  success: true
}))

function setAutoCompile(autoCompile: boolean): void {
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, autoCompile }
  }))
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useAutoCompile', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    Object.assign(window.api, { saveFileBatch: saveFileBatchMock })
    saveFileBatchMock.mockResolvedValue({ success: true })
    vi.mocked(window.api.compile).mockImplementation(async (request) => ({
      requestId: request.requestId,
      documentId: request.documentId,
      documentRevision: request.documentRevision,
      pdfPath: '/project/main.pdf',
      compiledFilePath: request.filePath
    }))
    vi.mocked(window.api.readFile).mockRejectedValue(new Error('No aux file'))
    useEditorStore.getState().resetEditor()
    useCompileStore.setState({
      compileStatus: 'idle',
      pdfPath: null,
      pdfDocumentId: null,
      pdfDocumentRevision: null,
      logs: ''
    })
    resetCompileTicketsForTests()
    setAutoCompile(false)
    useEditorStore.getState().openFileInTab(filePath, 'initial')
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('does not save or compile while auto compile is disabled', async () => {
    renderHook(() => useAutoCompile())

    act(() => {
      useEditorStore.getState().updateActiveDocument('edited', 'editor')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS * 2)
    })

    expect(saveFileBatchMock).not.toHaveBeenCalled()
    expect(window.api.compile).not.toHaveBeenCalled()
  })

  it('keeps a history restore dirty until a subsequent editor change', async () => {
    setAutoCompile(true)
    renderHook(() => useAutoCompile())

    act(() => {
      useEditorStore.getState().updateActiveDocument('restored history', 'history-restore')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS * 2)
    })

    expect(useEditorStore.getState().isDirty).toBe(true)
    expect(documentRegistry.getModel(filePath)?.requiresExplicitSave).toBe(true)
    expect(saveFileBatchMock).not.toHaveBeenCalled()
    expect(window.api.compile).not.toHaveBeenCalled()

    act(() => {
      useEditorStore.getState().updateActiveDocument('restored history with a user edit', 'editor')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS)
    })

    expect(saveFileBatchMock).toHaveBeenCalledWith([
      { content: 'restored history with a user edit', filePath }
    ])
    expect(window.api.compile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath, priority: 'normal' })
    )
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('excludes a blocked history restore when another document auto compiles', async () => {
    const secondFilePath = '/project/second.tex'
    setAutoCompile(true)
    renderHook(() => useAutoCompile())
    act(() => {
      useEditorStore.getState().updateActiveDocument('restored history', 'history-restore')
      useEditorStore.getState().openFileInTab(secondFilePath, 'second initial')
      useEditorStore.getState().updateActiveDocument('second edited', 'editor')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS)
    })

    expect(saveFileBatchMock).toHaveBeenCalledWith([
      { content: 'second edited', filePath: secondFilePath }
    ])
    expect(documentRegistry.snapshot(filePath)?.text).toBe('restored history')
    expect(documentRegistry.getModel(filePath)?.isDirty).toBe(true)
    expect(documentRegistry.getModel(filePath)?.requiresExplicitSave).toBe(true)
  })

  it('cancels a pending normal compile before an explicit high-priority compile', async () => {
    setAutoCompile(true)
    renderHook(() => useAutoCompile())
    act(() => {
      useEditorStore.getState().updateActiveDocument('manual compile source', 'editor')
      cancelPendingAutoCompile()
    })

    const snapshot = documentRegistry.snapshot(filePath)!
    const ticket = beginCompileTicket(filePath, snapshot)
    await window.api.compile(toCompileRequest(ticket, 'high'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS * 2)
    })

    expect(saveFileBatchMock).not.toHaveBeenCalled()
    expect(window.api.compile).toHaveBeenCalledTimes(1)
    expect(window.api.compile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath, priority: 'high' })
    )
  })

  it('cancels pending work when disabled and schedules the dirty document when re-enabled', async () => {
    renderHook(() => useAutoCompile())
    act(() => {
      useEditorStore.getState().updateActiveDocument('edited', 'editor')
      setAutoCompile(true)
      vi.advanceTimersByTime(AUTO_COMPILE_DELAY_MS / 2)
      setAutoCompile(false)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS)
    })
    expect(saveFileBatchMock).not.toHaveBeenCalled()
    expect(window.api.compile).not.toHaveBeenCalled()

    act(() => setAutoCompile(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DELAY_MS)
    })

    expect(saveFileBatchMock).toHaveBeenCalledWith([{ content: 'edited', filePath }])
    expect(window.api.compile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath, priority: 'normal' })
    )
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useCompileStore.getState().compileStatus).toBe('success')
  })

  it('does not compile after auto compile is disabled during an in-flight save', async () => {
    const save = deferred<{ success: boolean }>()
    saveFileBatchMock.mockReturnValueOnce(save.promise)
    setAutoCompile(true)
    renderHook(() => useAutoCompile())
    act(() => {
      useEditorStore.getState().updateActiveDocument('edited while saving', 'editor')
      vi.advanceTimersByTime(AUTO_COMPILE_DELAY_MS)
    })
    expect(saveFileBatchMock).toHaveBeenCalledOnce()

    act(() => setAutoCompile(false))
    await act(async () => {
      save.resolve({ success: true })
      await save.promise
    })

    expect(window.api.compile).not.toHaveBeenCalled()
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('invalidates an in-flight save continuation when the hook unmounts', async () => {
    const save = deferred<{ success: boolean }>()
    saveFileBatchMock.mockReturnValueOnce(save.promise)
    setAutoCompile(true)
    const { unmount } = renderHook(() => useAutoCompile())
    act(() => {
      useEditorStore.getState().updateActiveDocument('edited before unmount', 'editor')
      vi.advanceTimersByTime(AUTO_COMPILE_DELAY_MS)
    })
    expect(saveFileBatchMock).toHaveBeenCalledOnce()

    unmount()
    await act(async () => {
      save.resolve({ success: true })
      await save.promise
    })

    expect(window.api.compile).not.toHaveBeenCalled()
  })
})
