import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditorPane from '../../renderer/components/EditorPane'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

const editorListeners = {
  selection: [] as Array<
    (event: { selection: { isEmpty: () => boolean }; source: string }) => void
  >,
  mouseDown: [] as Array<(event: { target: { type: number } }) => void>,
  mouseUp: [] as Array<() => void>,
  scroll: [] as Array<() => void>,
  blur: [] as Array<() => void>,
  cursor: [] as Array<(event: { position: { lineNumber: number; column: number } }) => void>
}

let currentSelection: {
  isEmpty: () => boolean
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
} | null = null

const mockEditor = {
  createContextKey: vi.fn().mockReturnValue({ set: vi.fn() }),
  onDidChangeCursorPosition: vi.fn((cb) => {
    editorListeners.cursor.push(cb)
    return { dispose: vi.fn() }
  }),
  onDidChangeCursorSelection: vi.fn((cb) => {
    editorListeners.selection.push(cb)
    return { dispose: vi.fn() }
  }),
  onMouseDown: vi.fn((cb) => {
    editorListeners.mouseDown.push(cb)
    return { dispose: vi.fn() }
  }),
  onMouseUp: vi.fn((cb) => {
    editorListeners.mouseUp.push(cb)
    return { dispose: vi.fn() }
  }),
  onDidScrollChange: vi.fn((cb) => {
    editorListeners.scroll.push(cb)
    return { dispose: vi.fn() }
  }),
  onDidBlurEditorText: vi.fn((cb) => {
    editorListeners.blur.push(cb)
    return { dispose: vi.fn() }
  }),
  getSelection: vi.fn(() => currentSelection),
  getScrolledVisiblePosition: vi.fn(() => ({ top: 48, left: 200, height: 20 })),
  getDomNode: vi.fn(() => {
    const node = document.createElement('div')
    Object.defineProperty(node, 'clientWidth', { value: 700, configurable: true })
    Object.defineProperty(node, 'clientHeight', { value: 320, configurable: true })
    node.getBoundingClientRect = () =>
      ({
        width: 700,
        height: 320,
        top: 0,
        left: 0,
        right: 700,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => {}
      }) as DOMRect
    return node
  }),
  getModel: vi.fn(() => null),
  addAction: vi.fn(),
  executeEdits: vi.fn(),
  focus: vi.fn(),
  setPosition: vi.fn()
}

const mockMonaco = {
  editor: {
    MouseTargetType: {
      CONTENT_TEXT: 6,
      CONTENT_EMPTY: 7
    }
  },
  Range: class {}
}

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')

  const MockMonacoEditor = ({
    beforeMount,
    onMount
  }: {
    beforeMount?: (monaco: object) => void
    onMount?: (editor: object, monaco: object) => void
  }) => {
    React.useEffect(() => {
      beforeMount?.(mockMonaco)
      onMount?.(mockEditor, mockMonaco)
    }, [beforeMount, onMount])

    return React.createElement('div', { 'data-testid': 'mock-monaco-editor' })
  }

  return {
    __esModule: true,
    default: MockMonacoEditor,
    DiffEditor: () => React.createElement('div', { 'data-testid': 'mock-diff-editor' })
  }
})

vi.mock('../../renderer/hooks/editor/useClickNavigation', () => ({
  useClickNavigation: () => () => ({ dispose: vi.fn() })
}))
vi.mock('../../renderer/hooks/editor/useSpelling', () => ({
  useSpelling: () => ({ runSpellCheck: vi.fn() })
}))
vi.mock('../../renderer/hooks/editor/useDocumentSymbols', () => ({
  useDocumentSymbols: () => ({ refreshOutline: vi.fn() })
}))
vi.mock('../../renderer/hooks/editor/useCompletion', () => ({
  useCompletion: () => () => []
}))
vi.mock('../../renderer/hooks/editor/useEditorDiagnostics', () => ({
  useEditorDiagnostics: () => {}
}))
vi.mock('../../renderer/hooks/editor/usePendingActions', () => ({
  usePendingActions: () => {}
}))
vi.mock('../../renderer/hooks/editor/useContentChangeCoordinator', () => ({
  useContentChangeCoordinator: () => {}
}))
vi.mock('../../renderer/hooks/editor/usePackageDetection', () => ({
  usePackageDetection: () => ({ detectPackages: vi.fn() })
}))
vi.mock('../../renderer/hooks/editor/useMathPreview', () => ({
  useMathPreview: () => null
}))
vi.mock('../../renderer/hooks/editor/useSmartImageDrop', () => ({
  useSmartImageDrop: () => ({ handleDrop: vi.fn() })
}))
vi.mock('../../renderer/hooks/editor/useSectionHighlight', () => ({
  useSectionHighlight: () => {}
}))
vi.mock('../../renderer/hooks/editor/useEditorCommands', () => ({
  useEditorCommands: () => vi.fn()
}))
vi.mock('../../renderer/hooks/editor/useHistoryPanel', () => ({
  useHistoryPanel: () => ({
    showHistory: false,
    setShowHistory: vi.fn(),
    historyItems: [],
    snapshotContent: '',
    historyMode: false,
    setHistoryMode: vi.fn(),
    handleSelectHistoryItem: vi.fn(),
    closeHistory: vi.fn()
  })
}))
vi.mock('../../renderer/hooks/editor/useTableEditor', () => ({
  useTableEditor: () => ({
    tableModal: { isOpen: false, latex: '', range: null },
    setTableModal: vi.fn(),
    registerTableEditor: vi.fn(),
    disposeTableEditor: vi.fn()
  })
}))
vi.mock('../../renderer/lsp/lspClient', () => ({
  stopLspClient: vi.fn()
}))
vi.mock('../../renderer/data/monacoConfig', () => ({
  configureMonacoLanguages: vi.fn(),
  getMonacoTheme: () => 'mock-theme'
}))
vi.mock('../../renderer/components/MathPreviewWidget', () => ({
  MathPreviewWidget: () => null
}))

describe('EditorPane selection AI toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSelection = null
    for (const listeners of Object.values(editorListeners)) {
      listeners.length = 0
    }
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        aiEnabled: true,
        aiProvider: 'openai'
      }
    }))
  })

  it('shows only after mouse selection completes, not for keyboard selection', async () => {
    render(<EditorPane />)

    currentSelection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 10,
      isEmpty: () => false
    }

    act(() => {
      editorListeners.selection[0]?.({ selection: currentSelection!, source: 'keyboard' })
    })
    expect(screen.queryByTestId('selection-ai-toolbar')).not.toBeInTheDocument()

    act(() => {
      editorListeners.mouseDown[0]?.({
        target: { type: mockMonaco.editor.MouseTargetType.CONTENT_TEXT }
      })
      editorListeners.selection[0]?.({ selection: currentSelection!, source: 'mouse' })
      editorListeners.mouseUp[0]?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('selection-ai-toolbar')).toBeInTheDocument()
    })
  })

  it('hides on scroll and blur', async () => {
    render(<EditorPane />)

    currentSelection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 10,
      isEmpty: () => false
    }

    act(() => {
      editorListeners.mouseDown[0]?.({
        target: { type: mockMonaco.editor.MouseTargetType.CONTENT_TEXT }
      })
      editorListeners.selection[0]?.({ selection: currentSelection!, source: 'mouse' })
      editorListeners.mouseUp[0]?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('selection-ai-toolbar')).toBeInTheDocument()
    })

    act(() => {
      editorListeners.scroll[0]?.()
    })
    expect(screen.queryByTestId('selection-ai-toolbar')).not.toBeInTheDocument()

    act(() => {
      editorListeners.mouseDown[0]?.({
        target: { type: mockMonaco.editor.MouseTargetType.CONTENT_TEXT }
      })
      editorListeners.selection[0]?.({ selection: currentSelection!, source: 'mouse' })
      editorListeners.mouseUp[0]?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('selection-ai-toolbar')).toBeInTheDocument()
    })

    act(() => {
      editorListeners.blur[0]?.()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('selection-ai-toolbar')).not.toBeInTheDocument()
    })
  })

  it('submits a custom command from the toolbar input', async () => {
    const user = userEvent.setup()
    window.api.aiProcessCustom = vi.fn().mockResolvedValue('rewritten text')
    mockEditor.getModel = vi.fn(() => ({
      getValueInRange: vi.fn(() => 'selected text')
    }))

    render(<EditorPane />)

    currentSelection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 10,
      isEmpty: () => false
    }

    act(() => {
      editorListeners.mouseDown[0]?.({
        target: { type: mockMonaco.editor.MouseTargetType.CONTENT_TEXT }
      })
      editorListeners.selection[0]?.({ selection: currentSelection!, source: 'mouse' })
      editorListeners.mouseUp[0]?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('selection-ai-toolbar')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('AI command')
    await user.click(input)

    act(() => {
      editorListeners.blur[0]?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('selection-ai-toolbar')).toBeInTheDocument()
    })

    await user.type(input, 'Rewrite with a stronger formal tone')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(window.api.aiProcessCustom).toHaveBeenCalledWith(
        'Rewrite with a stronger formal tone',
        'selected text'
      )
    })
    expect(mockEditor.executeEdits).toHaveBeenCalledWith('ai-custom-command', [
      {
        range: currentSelection,
        text: 'rewritten text',
        forceMoveMarkers: true
      }
    ])
    expect(screen.queryByTestId('selection-ai-toolbar')).not.toBeInTheDocument()
  })
})
