import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileOps } from '../../renderer/hooks/useFileOps'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { documentRegistry } from '../../renderer/models/documentRegistry'

const { formatLatexMock, isCurrentProjectTransitionSnapshotMock, openProjectMock } = vi.hoisted(
  () => ({
    formatLatexMock: vi.fn(),
    isCurrentProjectTransitionSnapshotMock: vi.fn(),
    openProjectMock: vi.fn()
  })
)

vi.mock('../../renderer/utils/formatter', () => ({
  formatLatex: (...args: unknown[]) => formatLatexMock(...args)
}))

vi.mock('../../renderer/utils/openProject', () => ({
  isCurrentProjectTransitionSnapshot: (...args: unknown[]) =>
    isCurrentProjectTransitionSnapshotMock(...args),
  openProject: (...args: unknown[]) => openProjectMock(...args)
}))

describe('useFileOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useCompileStore.setState({ logs: '' })
    useNotificationStore.getState().clearNotifications()
    useProjectStore.setState({ isResearchPanelOpen: false, researchPanelTab: 'chat' })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, formatOnSave: true }
    }))
    formatLatexMock.mockImplementation(async (source: string) => source)
    isCurrentProjectTransitionSnapshotMock.mockReturnValue(true)
    vi.mocked(window.api.saveFile).mockResolvedValue({ success: true })
  })

  it('opens the chosen file without auto-opening the first project tex file', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    openProjectMock.mockResolvedValue({
      generation: 1,
      projectPath: '/workspace/project'
    })

    const { result } = renderHook(() => useFileOps())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(openProjectMock).toHaveBeenCalledWith('/workspace/project', {
      autoOpenFirstTex: false
    })
    expect(useEditorStore.getState().filePath).toBe('/workspace/project/picked.tex')
    expect(documentRegistry.snapshot('/workspace/project/picked.tex')?.text).toBe(
      '\\section{Picked}'
    )
  })

  it('does not open the chosen file when the project transition is cancelled', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    openProjectMock.mockResolvedValue(null)

    const { result } = renderHook(() => useFileOps())
    await act(async () => {
      await result.current.handleOpen()
    })

    expect(useEditorStore.getState().filePath).toBeNull()
    expect(isCurrentProjectTransitionSnapshotMock).not.toHaveBeenCalled()
  })

  it('does not publish a selected file after its project transition becomes stale', async () => {
    vi.mocked(window.api.openFile).mockResolvedValue({
      filePath: '/workspace/project/picked.tex',
      content: '\\section{Picked}'
    })
    const snapshot = { generation: 2, projectPath: '/workspace/project' }
    openProjectMock.mockResolvedValue(snapshot)
    isCurrentProjectTransitionSnapshotMock.mockReturnValue(false)

    const { result } = renderHook(() => useFileOps())
    await act(async () => {
      await result.current.handleOpen()
    })

    expect(isCurrentProjectTransitionSnapshotMock).toHaveBeenCalledWith(snapshot)
    expect(useEditorStore.getState().filePath).toBeNull()
  })

  it('formats and saves the current document revision', async () => {
    const filePath = '/workspace/project/paper.tex'
    useEditorStore.getState().openFileInTab(filePath, 'unformatted')
    formatLatexMock.mockResolvedValue('formatted')
    const { result } = renderHook(() => useFileOps())

    await act(async () => {
      await result.current.handleSave()
    })

    expect(documentRegistry.snapshot(filePath)?.text).toBe('formatted')
    expect(window.api.saveFile).toHaveBeenCalledWith('formatted', filePath)
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('reports a save failure without stealing the active right-panel tab', async () => {
    const filePath = '/workspace/project/paper.tex'
    useEditorStore.getState().openFileInTab(filePath, 'draft')
    useProjectStore.setState({ isResearchPanelOpen: true, researchPanelTab: 'chat' })
    vi.mocked(window.api.saveFile).mockRejectedValue(new Error('disk full'))
    const { result } = renderHook(() => useFileOps())

    await act(async () => {
      await result.current.handleSave()
    })

    expect(useCompileStore.getState().logs).toContain('Save failed: disk full')
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      tone: 'error',
      message: 'Save failed: disk full'
    })
    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'chat'
    })
  })

  it('does not apply a stale format-on-save result after the document changes', async () => {
    let resolveFormat: ((formatted: string) => void) | undefined
    formatLatexMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveFormat = resolve
        })
    )
    const filePath = '/workspace/project/paper.tex'
    useEditorStore.getState().openFileInTab(filePath, 'initial')
    const { result } = renderHook(() => useFileOps())

    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = result.current.handleSave()
    })
    await vi.waitFor(() => expect(formatLatexMock).toHaveBeenCalledOnce())
    act(() => {
      useEditorStore.getState().updateActiveDocument('edited while formatting', 'editor')
    })
    resolveFormat?.('stale formatted text')
    await act(async () => {
      await savePromise
    })

    expect(documentRegistry.snapshot(filePath)?.text).toBe('edited while formatting')
    expect(window.api.saveFile).toHaveBeenCalledWith('edited while formatting', filePath)
  })

  it('does not apply a format result to a different active tab', async () => {
    let resolveFormat: ((formatted: string) => void) | undefined
    formatLatexMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveFormat = resolve
        })
    )
    const firstPath = '/workspace/project/first.tex'
    const secondPath = '/workspace/project/second.tex'
    useEditorStore.getState().openFileInTab(firstPath, 'first source')
    useEditorStore.getState().openFileInTab(secondPath, 'second source')
    useEditorStore.getState().setActiveTab(firstPath)
    const { result } = renderHook(() => useFileOps())

    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = result.current.handleSave()
    })
    await vi.waitFor(() => expect(formatLatexMock).toHaveBeenCalledOnce())
    act(() => useEditorStore.getState().setActiveTab(secondPath))
    resolveFormat?.('formatted first')
    await act(async () => {
      await savePromise
    })

    expect(documentRegistry.snapshot(firstPath)?.text).toBe('first source')
    expect(documentRegistry.snapshot(secondPath)?.text).toBe('second source')
    expect(window.api.saveFile).toHaveBeenCalledWith('first source', firstPath)
  })

  it('lets only the latest overlapping format-on-save request write', async () => {
    let resolveFirst: ((formatted: string) => void) | undefined
    let resolveSecond: ((formatted: string) => void) | undefined
    formatLatexMock
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve
          })
      )
    const filePath = '/workspace/project/paper.tex'
    useEditorStore.getState().openFileInTab(filePath, 'source')
    const { result } = renderHook(() => useFileOps())

    const firstSave = result.current.handleSave()
    const secondSave = result.current.handleSave()
    resolveSecond?.('latest formatted')
    await secondSave
    resolveFirst?.('stale formatted')
    await firstSave

    expect(documentRegistry.snapshot(filePath)?.text).toBe('latest formatted')
    expect(window.api.saveFile).toHaveBeenCalledTimes(1)
    expect(window.api.saveFile).toHaveBeenCalledWith('latest formatted', filePath)
  })

  it('keeps a newer edit recoverable when it races with a completed save', async () => {
    let resolveSave: ((result: { success: boolean }) => void) | undefined
    vi.mocked(window.api.saveFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, formatOnSave: false }
    }))
    const filePath = '/workspace/project/paper.tex'
    useEditorStore.getState().openFileInTab(filePath, 'disk')
    useEditorStore.getState().updateActiveDocument('first draft', 'editor')
    const { result } = renderHook(() => useFileOps())

    const save = result.current.handleSave()
    await vi.waitFor(() =>
      expect(window.api.saveFile).toHaveBeenCalledWith('first draft', filePath)
    )
    useEditorStore.getState().updateActiveDocument('newer draft', 'editor')
    resolveSave?.({ success: true })
    await save

    expect(documentRegistry.snapshot(filePath)?.text).toBe('newer draft')
    expect(documentRegistry.getModel(filePath)?.isDirty).toBe(true)
    expect(window.api.saveRecoverySnapshot).toHaveBeenCalledWith(filePath, 'newer draft')
    expect(window.api.clearRecoverySnapshot).not.toHaveBeenCalled()
  })
})
