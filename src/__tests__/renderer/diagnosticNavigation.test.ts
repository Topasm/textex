import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  navigateToDiagnostic,
  resolveDiagnosticFilePath
} from '../../renderer/services/diagnosticNavigation'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('diagnostic navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(window.api.readFile).mockReset()
    useEditorStore.getState().resetEditor()
    useNotificationStore.getState().clearNotifications()
    useProjectStore.setState({ projectRoot: '/project' })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('resolves POSIX, Windows, and UNC paths while enforcing the project boundary', () => {
    expect(resolveDiagnosticFilePath('chapters/chapter2.tex', '/project')).toBe(
      '/project/chapters/chapter2.tex'
    )
    expect(resolveDiagnosticFilePath('/project/chapter2.tex', '/project')).toBe(
      '/project/chapter2.tex'
    )
    expect(resolveDiagnosticFilePath('/project-copy/chapter2.tex', '/project')).toBeNull()
    expect(resolveDiagnosticFilePath('../chapter2.tex', '/project')).toBeNull()

    expect(resolveDiagnosticFilePath('chapters\\chapter2.tex', 'C:\\Project')).toBe(
      'C:/Project/chapters/chapter2.tex'
    )
    expect(resolveDiagnosticFilePath('c:/project/CHAPTER2.tex', 'C:\\Project')).toBe(
      'c:/project/CHAPTER2.tex'
    )
    expect(resolveDiagnosticFilePath('D:\\Project\\chapter2.tex', 'C:\\Project')).toBeNull()

    expect(resolveDiagnosticFilePath('chapter2.tex', '\\\\server\\share\\project')).toBe(
      '//server/share/project/chapter2.tex'
    )
    expect(
      resolveDiagnosticFilePath(
        '\\\\server\\share\\other\\chapter2.tex',
        '\\\\server\\share\\project'
      )
    ).toBeNull()
  })

  it('jumps immediately when the diagnostic belongs to the current file', async () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'main')

    await navigateToDiagnostic({
      file: '/project/main.tex',
      line: 8,
      column: 4,
      severity: 'error',
      message: 'Missing brace'
    })

    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(useEditorStore.getState().pendingJump).toEqual({
      line: 8,
      column: 4,
      skipFocus: undefined
    })
  })

  it('activates an already-open target without replacing its unsaved buffer', async () => {
    const target = '/project/chapter2.tex'
    useEditorStore.getState().openFileInTab(target, 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    useEditorStore.getState().openFileInTab('/project/main.tex', 'main')

    await navigateToDiagnostic({
      file: target,
      line: 80,
      column: 2,
      severity: 'error',
      message: 'Chapter error'
    })
    vi.advanceTimersByTime(50)

    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(useEditorStore.getState().activeFilePath).toBe(target)
    expect(useEditorStore.getState().openFiles[target]?.isDirty).toBe(true)
    expect(useEditorStore.getState().pendingJump).toEqual({
      line: 80,
      column: 2,
      skipFocus: undefined
    })
  })

  it('opens a relative diagnostic target and then requests its exact location', async () => {
    vi.mocked(window.api.readFile).mockResolvedValue({
      filePath: '/project/chapters/chapter2.tex',
      content: 'chapter'
    })

    await navigateToDiagnostic({
      file: 'chapters\\chapter2.tex',
      line: 80,
      column: 7,
      severity: 'error',
      message: 'Chapter error'
    })
    vi.advanceTimersByTime(50)

    expect(window.api.readFile).toHaveBeenCalledWith('/project/chapters/chapter2.tex')
    expect(useEditorStore.getState().activeFilePath).toBe('/project/chapters/chapter2.tex')
    expect(useEditorStore.getState().pendingJump).toEqual({
      line: 80,
      column: 7,
      skipFocus: undefined
    })
  })

  it('does not read outside the project and reports missing target files', async () => {
    await navigateToDiagnostic({
      file: '../escape.tex',
      line: 1,
      severity: 'error',
      message: 'Outside'
    })

    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({ tone: 'error' })

    vi.mocked(window.api.readFile).mockRejectedValue(new Error('file not found'))
    await navigateToDiagnostic({
      file: 'missing.tex',
      line: 12,
      severity: 'error',
      message: 'Missing'
    })

    expect(window.api.readFile).toHaveBeenCalledWith('/project/missing.tex')
    expect(useEditorStore.getState().activeFilePath).toBeNull()
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toContain(
      'file not found'
    )
  })

  it('drops a stale disk result after the active project changes', async () => {
    let finishRead!: (value: { filePath: string; content: string }) => void
    vi.mocked(window.api.readFile).mockImplementation(
      () => new Promise((resolve) => (finishRead = resolve))
    )
    const navigation = navigateToDiagnostic({
      file: 'chapter2.tex',
      line: 80,
      severity: 'error',
      message: 'Chapter error'
    })

    useProjectStore.setState({ projectRoot: '/another-project' })
    finishRead({ filePath: '/project/chapter2.tex', content: 'stale' })
    await navigation
    vi.advanceTimersByTime(50)

    expect(useEditorStore.getState().activeFilePath).toBeNull()
    expect(useEditorStore.getState().pendingJump).toBeNull()
  })
})
