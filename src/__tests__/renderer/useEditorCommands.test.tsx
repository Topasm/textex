import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorCommands } from '../../renderer/hooks/editor/useEditorCommands'

const { formatLatexMock } = vi.hoisted(() => ({
  formatLatexMock: vi.fn()
}))

vi.mock('../../renderer/utils/formatter', () => ({
  formatLatex: (...args: unknown[]) => formatLatexMock(...args)
}))

interface DeferredFormat {
  promise: Promise<string>
  resolve: (formatted: string) => void
}

function deferredFormat(): DeferredFormat {
  let resolve: ((formatted: string) => void) | undefined
  const promise = new Promise<string>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve: (formatted) => resolve?.(formatted) }
}

function createEditor() {
  const model = {
    getValue: vi.fn(() => 'source'),
    getVersionId: vi.fn(() => 1),
    getFullModelRange: vi.fn(() => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 7
    }))
  }
  const editor = {
    addCommand: vi.fn(),
    executeEdits: vi.fn(),
    getModel: vi.fn(() => model),
    getSelection: vi.fn(() => null),
    getPosition: vi.fn(() => null),
    getSupportedActions: vi.fn(() => []),
    trigger: vi.fn()
  }
  const monaco = {
    KeyMod: { CtrlCmd: 1, Shift: 2, Alt: 4 },
    KeyCode: { KeyF: 8, KeyH: 32 },
    Range: vi.fn()
  }
  return { editor, model, monaco }
}

function formatCommand(editor: ReturnType<typeof createEditor>['editor']): () => Promise<void> {
  const registration = editor.addCommand.mock.calls.find(([keybinding]) => keybinding === 14)
  if (!registration) throw new Error('Format command was not registered')
  return registration[1] as () => Promise<void>
}

describe('useEditorCommands formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not apply a delayed format after the Monaco model version changes', async () => {
    const deferred = deferredFormat()
    formatLatexMock.mockReturnValue(deferred.promise)
    const { editor, model, monaco } = createEditor()
    const { result } = renderHook(() =>
      useEditorCommands({
        setShowHistory: vi.fn(),
        showHistory: false,
        setHistoryMode: vi.fn()
      })
    )
    act(() => result.current(editor as never, monaco as never))
    const runFormat = formatCommand(editor)

    const pending = runFormat()
    await vi.waitFor(() => expect(formatLatexMock).toHaveBeenCalledOnce())
    model.getVersionId.mockReturnValue(2)
    deferred.resolve('stale formatted')
    await pending

    expect(editor.executeEdits).not.toHaveBeenCalled()
  })

  it('does not apply a delayed format after Monaco switches models', async () => {
    const deferred = deferredFormat()
    formatLatexMock.mockReturnValue(deferred.promise)
    const { editor, monaco } = createEditor()
    const { result } = renderHook(() =>
      useEditorCommands({
        setShowHistory: vi.fn(),
        showHistory: false,
        setHistoryMode: vi.fn()
      })
    )
    act(() => result.current(editor as never, monaco as never))
    const runFormat = formatCommand(editor)

    const pending = runFormat()
    await vi.waitFor(() => expect(formatLatexMock).toHaveBeenCalledOnce())
    editor.getModel.mockReturnValue({} as never)
    deferred.resolve('stale formatted')
    await pending

    expect(editor.executeEdits).not.toHaveBeenCalled()
  })

  it('lets only the latest overlapping format request edit the model', async () => {
    const first = deferredFormat()
    const second = deferredFormat()
    formatLatexMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { editor, model, monaco } = createEditor()
    const { result } = renderHook(() =>
      useEditorCommands({
        setShowHistory: vi.fn(),
        showHistory: false,
        setHistoryMode: vi.fn()
      })
    )
    act(() => result.current(editor as never, monaco as never))
    const runFormat = formatCommand(editor)

    const firstPending = runFormat()
    const secondPending = runFormat()
    second.resolve('latest formatted')
    await secondPending
    first.resolve('stale formatted')
    await firstPending

    expect(editor.executeEdits).toHaveBeenCalledOnce()
    expect(editor.executeEdits).toHaveBeenCalledWith('prettier', [
      {
        range: model.getFullModelRange(),
        text: 'latest formatted',
        forceMoveMarkers: true
      }
    ])
  })
})
