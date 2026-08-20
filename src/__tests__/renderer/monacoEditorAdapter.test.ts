import { describe, expect, it, vi } from 'vitest'
import { MonacoEditorAdapter } from '../../renderer/editor/MonacoEditorAdapter'

function createHarness() {
  let text = 'one\ntwo'
  let contentListener: ((event: unknown) => void) | null = null
  const contentDisposable = { dispose: vi.fn() }
  const decorationCollection = {
    set: vi.fn(),
    clear: vi.fn(),
    getRange: vi.fn(),
    has: vi.fn()
  }
  const model = {
    getValue: vi.fn(() => text),
    setValue: vi.fn((value: string) => {
      text = value
    }),
    getValueInRange: vi.fn(() => 'one'),
    getLineCount: vi.fn(() => 2),
    getLineMaxColumn: vi.fn((line: number) => (line === 1 ? 4 : 4))
  }
  const selection = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 4,
    selectionStartLineNumber: 1,
    selectionStartColumn: 1,
    positionLineNumber: 1,
    positionColumn: 4,
    isEmpty: () => false
  }
  const scrollDisposable = { dispose: vi.fn() }
  const editor = {
    onDidChangeModelContent: vi.fn((listener: (event: unknown) => void) => {
      contentListener = listener
      return contentDisposable
    }),
    getModel: vi.fn(() => model),
    getPosition: vi.fn(() => ({ lineNumber: 2, column: 2 })),
    getSelection: vi.fn(() => selection),
    getTargetAtClientPoint: vi.fn(() => ({ position: { lineNumber: 2, column: 3 } })),
    setPosition: vi.fn(),
    revealLineInCenter: vi.fn(),
    revealPosition: vi.fn(),
    executeEdits: vi.fn(() => true),
    createDecorationsCollection: vi.fn(() => decorationCollection),
    onDidScrollChange: vi.fn(() => scrollDisposable),
    getVisibleRanges: vi.fn(() => [
      { startLineNumber: 4, startColumn: 1, endLineNumber: 8, endColumn: 1 }
    ]),
    getTopForLineNumber: vi.fn((line: number) => line * 20),
    setScrollTop: vi.fn(),
    focus: vi.fn()
  }
  const setModelMarkers = vi.fn()
  const monaco = {
    MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
    editor: { setModelMarkers }
  }

  return {
    adapter: new MonacoEditorAdapter(editor as never, monaco as never, '/project/main.tex'),
    editor,
    model,
    monaco,
    setModelMarkers,
    decorationCollection,
    contentDisposable,
    scrollDisposable,
    setText: (value: string) => {
      text = value
    },
    emitContentChange: (event: unknown) => {
      if (!contentListener) throw new Error('Content listener was not registered')
      contentListener(event)
    }
  }
}

describe('MonacoEditorAdapter', () => {
  it('does not materialize the full document for unobserved editor changes', () => {
    const harness = createHarness()
    harness.model.getValue.mockClear()

    harness.emitContentChange({ changes: [], isFlush: false })

    expect(harness.adapter.getEngineRevision()).toBe(1)
    expect(harness.model.getValue).not.toHaveBeenCalled()
  })

  it('publishes immutable deltas without materializing text', () => {
    const harness = createHarness()
    const listener = vi.fn()
    harness.adapter.onDidChangeDocument(listener)

    expect(harness.adapter.materializeSnapshot()).toEqual({
      documentId: '/project/main.tex',
      engineRevision: 0,
      text: 'one\ntwo'
    })
    harness.model.getValue.mockClear()

    harness.setText('one!\ntwo')
    harness.emitContentChange({
      changes: [
        {
          range: { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 },
          rangeOffset: 3,
          rangeLength: 0,
          text: '!'
        }
      ],
      isFlush: false
    })

    expect(listener).toHaveBeenCalledWith({
      documentId: '/project/main.tex',
      revision: 1,
      changes: [
        {
          range: {
            start: { line: 1, column: 4 },
            end: { line: 1, column: 4 }
          },
          rangeOffset: 3,
          rangeLength: 0,
          text: '!'
        }
      ],
      isFlush: false
    })
    expect(harness.model.getValue).not.toHaveBeenCalled()

    harness.adapter.setDocumentId('/project/chapter.tex')
    expect(harness.adapter.getEngineRevision()).toBe(2)
    expect(Object.isFrozen(harness.adapter.materializeSnapshot())).toBe(true)
  })

  it('exposes a document-scoped canonical buffer handle', () => {
    const { adapter, model } = createHarness()
    const buffer = adapter.getDocumentBuffer()

    expect(buffer?.documentId).toBe('/project/main.tex')
    expect(buffer?.getText()).toBe('one\ntwo')
    buffer?.replaceText('replacement')
    expect(model.setValue).toHaveBeenCalledWith('replacement')
    expect(buffer?.getText()).toBe('replacement')
  })

  it('maps editor-neutral positions, selections, and edits to Monaco', () => {
    const { adapter, editor, model } = createHarness()

    expect(adapter.getPosition()).toEqual({ line: 2, column: 2 })
    expect(adapter.getPositionAtClientPoint(10, 20)).toEqual({ line: 2, column: 3 })
    expect(adapter.getSelection()).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 1, column: 4 },
      anchor: { line: 1, column: 1 },
      active: { line: 1, column: 4 },
      isEmpty: false
    })
    expect(
      adapter.getText({
        start: { line: 1, column: 1 },
        end: { line: 1, column: 4 }
      })
    ).toBe('one')
    expect(model.getValueInRange).toHaveBeenCalledWith({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 4
    })

    expect(
      adapter.applyEdits('test-edit', [
        {
          range: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 4 }
          },
          text: 'updated',
          forceMoveMarkers: true
        }
      ])
    ).toBe(true)
    expect(editor.executeEdits).toHaveBeenCalledWith('test-edit', [
      {
        range: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 2,
          endColumn: 4
        },
        text: 'updated',
        forceMoveMarkers: true
      }
    ])

    adapter.revealPosition({ line: 2, column: 3 }, { center: true, focus: true })
    expect(editor.revealLineInCenter).toHaveBeenCalledWith(2)
    expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 2, column: 3 })
    expect(editor.focus).toHaveBeenCalled()
  })

  it('normalizes diagnostics and maps severities inside the Monaco layer', () => {
    const { adapter, model, setModelMarkers } = createHarness()

    adapter.setDiagnostics('latex', [
      {
        range: {
          start: { line: 9, column: 99 },
          end: { line: 9, column: 100 }
        },
        severity: 'error',
        message: 'Broken command',
        source: 'tectonic',
        code: 'E100'
      }
    ])

    expect(setModelMarkers).toHaveBeenCalledWith(model, 'latex', [
      {
        startLineNumber: 2,
        startColumn: 4,
        endLineNumber: 2,
        endColumn: 4,
        severity: 8,
        message: 'Broken command',
        source: 'tectonic',
        code: 'E100'
      }
    ])
  })

  it('keeps decoration ownership stable when an owner is replaced', () => {
    const { adapter, editor, decorationCollection, contentDisposable } = createHarness()
    const first = adapter.setDecorations('jump', [
      {
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        isWholeLine: true,
        className: 'first'
      }
    ])
    const second = adapter.setDecorations('jump', [
      {
        range: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
        isWholeLine: true,
        className: 'second'
      }
    ])

    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
    expect(decorationCollection.set).toHaveBeenCalledTimes(1)
    first.dispose()
    expect(decorationCollection.clear).not.toHaveBeenCalled()
    second.dispose()
    expect(decorationCollection.clear).toHaveBeenCalledTimes(1)

    adapter.dispose()
    expect(contentDisposable.dispose).toHaveBeenCalledTimes(1)
    expect(decorationCollection.clear).toHaveBeenCalledTimes(2)
  })

  it('exposes engine-neutral scroll operations', () => {
    const { adapter, editor, scrollDisposable } = createHarness()
    const listener = vi.fn()

    expect(adapter.onDidScroll(listener)).toBe(scrollDisposable)
    expect(adapter.getVisibleLineRange()).toEqual({ startLine: 4, endLine: 8 })
    adapter.scrollToLine(7)
    expect(editor.getTopForLineNumber).toHaveBeenCalledWith(7)
    expect(editor.setScrollTop).toHaveBeenCalledWith(140)
  })
})
