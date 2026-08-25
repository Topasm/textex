import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionRestore } from '../../renderer/hooks/useSessionRestore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import type { OpenFileResult } from '../../renderer/types/api'

const { isCurrentProjectTransitionSnapshotMock, openProjectMock } = vi.hoisted(() => ({
  isCurrentProjectTransitionSnapshotMock: vi.fn(() => true),
  openProjectMock: vi.fn()
}))

vi.mock('../../renderer/utils/openProject', () => ({
  isCurrentProjectTransitionSnapshot: isCurrentProjectTransitionSnapshotMock,
  openProject: openProjectMock
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function saveSession(
  projectRoot: string,
  paths: string[],
  activeFile: string | null,
  cursors: Record<string, { cursorLine: number; cursorColumn: number }> = {}
): void {
  useProjectStore.getState().setProjectRoot(projectRoot)
  useEditorStore.setState({
    _sessionOpenPaths: paths,
    _sessionActiveFile: activeFile,
    _sessionCursors: cursors
  })
}

describe('useSessionRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCurrentProjectTransitionSnapshotMock.mockReturnValue(true)
    useNotificationStore.getState().clearNotifications()
    useProjectStore.getState().setProjectRoot(null)
    useEditorStore.getState().resetEditor()
    useEditorStore.setState({
      _sessionOpenPaths: [],
      _sessionActiveFile: null,
      _sessionCursors: {}
    })
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        spellCheckEnabled: false,
        autoUpdateEnabled: false
      }
    }))
    vi.mocked(window.api.openDirectory).mockResolvedValue(null)
    vi.mocked(window.api.readFile).mockReset()
    vi.mocked(window.api.spellInit).mockReset().mockResolvedValue({ success: true })
  })

  it('keeps the failed saved path visible and opens a chosen replacement through openProject', async () => {
    const savedPath = '/projects/moved-away'
    const replacementPath = '/projects/replacement'
    useProjectStore.getState().setProjectRoot(savedPath)
    openProjectMock
      .mockRejectedValueOnce(new Error('Project directory not found'))
      .mockResolvedValueOnce({ generation: 2, projectPath: replacementPath })
    vi.mocked(window.api.openDirectory).mockResolvedValueOnce(replacementPath)

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(result.current).toBe(true))
    const notification = useNotificationStore.getState().notifications[0]
    expect(notification).toMatchObject({
      id: 'session-restore-failed',
      tone: 'error'
    })
    expect(notification.message).toContain(savedPath)
    expect(notification.message).toContain('Project directory not found')
    expect(notification.action?.label).toBe('Choose replacement')
    expect(useProjectStore.getState().projectRoot).toBeNull()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()

    await act(async () => {
      await notification.action?.run()
    })

    expect(window.api.openDirectory).toHaveBeenCalledOnce()
    expect(openProjectMock).toHaveBeenNthCalledWith(1, savedPath, {
      autoOpenFirstTex: false,
      deferProjectEnrichment: true
    })
    expect(openProjectMock).toHaveBeenNthCalledWith(2, replacementPath)
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('retains the recovery action and reports the replacement path when opening it fails', async () => {
    const savedPath = '/projects/moved-away'
    const replacementPath = '/projects/still-missing'
    useProjectStore.getState().setProjectRoot(savedPath)
    openProjectMock
      .mockRejectedValueOnce(new Error('Original folder not found'))
      .mockRejectedValueOnce(new Error('Replacement folder not found'))
    vi.mocked(window.api.openDirectory).mockResolvedValueOnce(replacementPath)

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(result.current).toBe(true))
    const action = useNotificationStore.getState().notifications[0]?.action

    await expect(action?.run()).rejects.toThrow('Replacement folder not found')

    const notification = useNotificationStore.getState().notifications[0]
    expect(notification.message).toContain(replacementPath)
    expect(notification.message).toContain('Replacement folder not found')
    expect(notification.action).toBe(action)
    expect(notification.dismissible).toBe(true)
  })

  it('publishes the saved active tab first, then restores tab order with bounded concurrency', async () => {
    const projectRoot = '/projects/paper'
    const paths = ['a.tex', 'b.tex', 'c.tex', 'd.tex', 'e.tex', 'f.tex'].map(
      (name) => `${projectRoot}/${name}`
    )
    const [a, b, c, d, e, f] = paths
    saveSession(projectRoot, paths, c, {
      [b]: { cursorLine: 20, cursorColumn: 3 },
      [c]: { cursorLine: 30, cursorColumn: 4 }
    })
    openProjectMock.mockResolvedValue({ generation: 1, projectPath: projectRoot })

    const reads = new Map(paths.map((path) => [path, deferred<OpenFileResult>()]))
    vi.mocked(window.api.readFile).mockImplementation((path) => {
      const request = reads.get(path)
      if (!request) throw new Error(`Unexpected read: ${path}`)
      return request.promise
    })

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith(c))
    expect(window.api.readFile).toHaveBeenCalledTimes(1)

    await act(async () => {
      reads.get(c)?.resolve({ filePath: c, content: 'content c' })
    })

    await waitFor(() => expect(result.current).toBe(true))
    expect(useEditorStore.getState().activeFilePath).toBe(c)
    expect(Object.keys(useEditorStore.getState().openFiles)).toEqual([c])
    expect(useEditorStore.getState()).toMatchObject({ cursorLine: 30, cursorColumn: 4 })

    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledTimes(4))
    expect(vi.mocked(window.api.readFile).mock.calls.map(([path]) => path)).toEqual([c, a, b, d])

    await act(async () => {
      reads.get(d)?.resolve({ filePath: d, content: 'content d' })
      reads.get(a)?.resolve({ filePath: a, content: 'content a' })
      reads.get(b)?.resolve({ filePath: b, content: 'content b' })
    })

    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledTimes(6))
    expect(useEditorStore.getState().activeFilePath).toBe(c)
    expect(Object.keys(useEditorStore.getState().openFiles)).toEqual([a, b, c, d])
    expect(useEditorStore.getState().openFiles[b]).toMatchObject({
      cursorLine: 20,
      cursorColumn: 3
    })

    await act(async () => {
      reads.get(f)?.resolve({ filePath: f, content: 'content f' })
      reads.get(e)?.resolve({ filePath: e, content: 'content e' })
    })

    await waitFor(() => expect(Object.keys(useEditorStore.getState().openFiles)).toEqual(paths))
    expect(useEditorStore.getState().activeFilePath).toBe(c)
  })

  it('skips missing files and activates the first surviving tab when the saved active file is gone', async () => {
    const projectRoot = '/projects/paper'
    const a = `${projectRoot}/a.tex`
    const missingActive = `${projectRoot}/missing.tex`
    const missingBackground = `${projectRoot}/also-missing.tex`
    saveSession(projectRoot, [a, missingActive, missingBackground], missingActive, {
      [a]: { cursorLine: 8, cursorColumn: 5 }
    })
    openProjectMock.mockResolvedValue({ generation: 1, projectPath: projectRoot })
    vi.mocked(window.api.readFile).mockImplementation(async (path) => {
      if (path === a) return { filePath: a, content: 'surviving content' }
      throw new Error('File not found')
    })

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(result.current).toBe(true))
    await waitFor(() => expect(useEditorStore.getState().activeFilePath).toBe(a))
    expect(Object.keys(useEditorStore.getState().openFiles)).toEqual([a])
    expect(useEditorStore.getState()).toMatchObject({ cursorLine: 8, cursorColumn: 5 })
  })

  it('opens the project default tex file when no saved session tex file survives', async () => {
    const projectRoot = '/projects/paper'
    const missingActive = `${projectRoot}/missing.tex`
    const mainFile = `${projectRoot}/main.tex`
    saveSession(projectRoot, [missingActive], missingActive)
    useProjectStore.getState().setDirectoryTree([
      { name: 'notes.txt', path: `${projectRoot}/notes.txt`, type: 'file' },
      { name: 'main.tex', path: mainFile, type: 'file' }
    ])
    openProjectMock.mockResolvedValue({ generation: 1, projectPath: projectRoot })
    vi.mocked(window.api.readFile).mockImplementation(async (path) => {
      if (path === mainFile) return { filePath: mainFile, content: 'default content' }
      throw new Error('File not found')
    })

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => expect(result.current).toBe(true))
    await waitFor(() => expect(useEditorStore.getState().activeFilePath).toBe(mainFile))
    expect(window.api.readFile).toHaveBeenCalledWith(missingActive)
    expect(window.api.readFile).toHaveBeenCalledWith(mainFile)
  })

  it('discards background reads after the user opens another tab', async () => {
    const projectRoot = '/projects/paper'
    const activeFile = `${projectRoot}/active.tex`
    const backgroundFile = `${projectRoot}/background.tex`
    const userFile = `${projectRoot}/user.tex`
    saveSession(projectRoot, [activeFile, backgroundFile], activeFile)
    openProjectMock.mockResolvedValue({ generation: 1, projectPath: projectRoot })
    const activeRead = deferred<OpenFileResult>()
    const backgroundRead = deferred<OpenFileResult>()
    vi.mocked(window.api.readFile).mockImplementation((path) =>
      path === activeFile ? activeRead.promise : backgroundRead.promise
    )

    const { result } = renderHook(() => useSessionRestore())
    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith(activeFile))
    await act(async () => {
      activeRead.resolve({ filePath: activeFile, content: 'active content' })
    })
    await waitFor(() => expect(result.current).toBe(true))
    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith(backgroundFile))

    act(() => useEditorStore.getState().openFileInTab(userFile, 'user content'))
    await act(async () => {
      backgroundRead.resolve({ filePath: backgroundFile, content: 'stale background' })
    })

    expect(useEditorStore.getState().activeFilePath).toBe(userFile)
    expect(Object.keys(useEditorStore.getState().openFiles)).toEqual([activeFile, userFile])
  })

  it('discards reads from the previous project after a project switch', async () => {
    const oldRoot = '/projects/old'
    const newRoot = '/projects/new'
    const activeFile = `${oldRoot}/active.tex`
    const backgroundFile = `${oldRoot}/background.tex`
    const newFile = `${newRoot}/main.tex`
    saveSession(oldRoot, [activeFile, backgroundFile], activeFile)
    openProjectMock.mockResolvedValue({ generation: 1, projectPath: oldRoot })
    const activeRead = deferred<OpenFileResult>()
    const backgroundRead = deferred<OpenFileResult>()
    vi.mocked(window.api.readFile).mockImplementation((path) =>
      path === activeFile ? activeRead.promise : backgroundRead.promise
    )

    const { result } = renderHook(() => useSessionRestore())
    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith(activeFile))
    await act(async () => {
      activeRead.resolve({ filePath: activeFile, content: 'old active content' })
    })
    await waitFor(() => expect(result.current).toBe(true))
    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith(backgroundFile))

    act(() => {
      useProjectStore.getState().setProjectRoot(newRoot)
      useEditorStore.getState().resetEditor()
      useEditorStore.getState().openFileInTab(newFile, 'new project content')
    })
    isCurrentProjectTransitionSnapshotMock.mockReturnValue(false)
    await act(async () => {
      backgroundRead.resolve({ filePath: backgroundFile, content: 'stale content' })
    })

    expect(useEditorStore.getState().activeFilePath).toBe(newFile)
    expect(Object.keys(useEditorStore.getState().openFiles)).toEqual([newFile])
  })

  it('initializes spellcheck from the hydrated settings snapshot without loading settings again', async () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        spellCheckEnabled: true,
        spellCheckLanguage: 'ko-KR',
        autoUpdateEnabled: false
      }
    }))

    renderHook(() => useSessionRestore())

    await waitFor(() => expect(window.api.spellInit).toHaveBeenCalledWith('ko-KR'))
    expect(window.api.loadSettings).not.toHaveBeenCalled()
  })
})
