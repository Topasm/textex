import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditorPane from '../../renderer/components/EditorPane'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

let capturedOptions: Record<string, unknown> | null = null

const mockEditor = {
  createContextKey: vi.fn().mockReturnValue({ set: vi.fn() }),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
  onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
  onMouseUp: vi.fn(() => ({ dispose: vi.fn() })),
  onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
  getSelection: vi.fn(() => null),
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

  const MockMonacoEditor = (props: {
    options?: Record<string, unknown>
    beforeMount?: (monaco: object) => void
    onMount?: (editor: object, monaco: object) => void
  }) => {
    const { beforeMount, onMount, options } = props
    capturedOptions = options ?? null

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

describe('EditorPane minimap', () => {
  beforeEach(() => {
    capturedOptions = null
    vi.clearAllMocks()
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        lineNumbers: true
      }
    }))
  })

  it('always disables the Monaco minimap', () => {
    render(<EditorPane />)

    expect(capturedOptions).toMatchObject({
      minimap: { enabled: false }
    })
  })
})
