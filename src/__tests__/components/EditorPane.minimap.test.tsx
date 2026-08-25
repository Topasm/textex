import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditorPane from '../../renderer/components/EditorPane'
import i18n from '../../renderer/i18n'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { TEXTEX_REFERENCE_MIME } from '../../renderer/components/research/referenceActions'

let capturedOptions: Record<string, unknown> | null = null
let capturedEditorProps: Record<string, unknown> | null = null

const mockEditor = {
  createContextKey: vi.fn().mockReturnValue({ set: vi.fn() }),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
  onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
  onMouseUp: vi.fn(() => ({ dispose: vi.fn() })),
  onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
  getSelection: vi.fn(() => null),
  getModel: vi.fn(() => null),
  getTargetAtClientPoint: vi.fn<
    (
      clientX: number,
      clientY: number
    ) => {
      position: { lineNumber: number; column: number }
    } | null
  >(() => null),
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
    capturedEditorProps = props
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
  useEditorDiagnostics: () => vi.fn()
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
vi.mock('../../renderer/hooks/editor/useTableEditor', () => ({
  useTableEditor: () => ({
    tableModal: { isOpen: false, latex: '', range: null },
    setTableModal: vi.fn(),
    registerTableEditor: vi.fn(),
    disposeTableEditor: vi.fn()
  })
}))
vi.mock('../../renderer/data/monacoConfig', () => ({
  configureMonacoLanguages: vi.fn(),
  getMonacoTheme: () => 'mock-theme'
}))
vi.mock('../../renderer/components/MathPreviewWidget', () => ({
  MathPreviewWidget: () => null
}))

describe('EditorPane minimap', () => {
  beforeEach(async () => {
    capturedOptions = null
    capturedEditorProps = null
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    useEditorStore.getState().resetEditor()
    useNotificationStore.getState().clearNotifications()
    useProjectStore.setState({ projectRoot: null, bibEntries: [], projectIndex: null })
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

  it('uses a path-backed uncontrolled Monaco model as the canonical buffer', () => {
    useEditorStore.getState().openFileInTab('/tmp/paper.tex', 'initial content')

    render(<EditorPane />)

    expect(capturedEditorProps).toMatchObject({
      path: '/tmp/paper.tex',
      defaultValue: 'initial content',
      keepCurrentModel: true
    })
    expect(capturedEditorProps).not.toHaveProperty('value')
    expect(capturedEditorProps).not.toHaveProperty('onChange')
  })

  it('publishes an error notification for an invalid reference payload', () => {
    const { container } = render(<EditorPane />)
    const dropTarget = container.firstElementChild as HTMLElement

    fireEvent.drop(dropTarget, {
      clientX: 20,
      clientY: 30,
      dataTransfer: {
        files: [],
        getData: (type: string) =>
          type === TEXTEX_REFERENCE_MIME
            ? JSON.stringify({ source: 'project', citekey: 'invalid key' })
            : ''
      }
    })

    expect(useNotificationStore.getState().notifications).toContainEqual(
      expect.objectContaining({
        id: 'reference-drop:invalid-payload',
        tone: 'error',
        message: 'This reference cannot be dropped because its data is invalid.'
      })
    )
  })

  it('publishes a warning when a reference is dropped outside a valid editor position', () => {
    const { container } = render(<EditorPane />)
    const dropTarget = container.firstElementChild as HTMLElement

    fireEvent.drop(dropTarget, {
      clientX: 20,
      clientY: 30,
      dataTransfer: {
        files: [],
        getData: (type: string) =>
          type === TEXTEX_REFERENCE_MIME
            ? JSON.stringify({ source: 'project', citekey: 'valid-key' })
            : ''
      }
    })

    expect(useNotificationStore.getState().notifications).toContainEqual(
      expect.objectContaining({
        id: 'reference-drop:invalid-position',
        tone: 'warning'
      })
    )
  })

  it('publishes the reference failure reason when adding a dropped reference fails', async () => {
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    mockEditor.getTargetAtClientPoint.mockReturnValueOnce({
      position: { lineNumber: 1, column: 1 }
    })
    vi.mocked(window.api.findBibInProject).mockRejectedValueOnce(new Error('Bibliography offline'))
    const { container } = render(<EditorPane />)
    const dropTarget = container.firstElementChild as HTMLElement

    fireEvent.drop(dropTarget, {
      clientX: 20,
      clientY: 30,
      dataTransfer: {
        files: [],
        getData: (type: string) =>
          type === TEXTEX_REFERENCE_MIME
            ? JSON.stringify({ source: 'project', citekey: 'valid-key' })
            : ''
      }
    })

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({
          id: 'reference-drop:add-failed',
          tone: 'error',
          message: 'Could not add this reference: Bibliography offline'
        })
      )
    )
  })
})
