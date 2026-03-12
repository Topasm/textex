import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_ACTIONS,
  registerAiActions,
  runAiAction,
  runAiCustomCommand
} from '../../renderer/components/editor/editorAiActions'
import { hashTextContent } from '../../shared/hash'
import { useAiContextStore } from '../../renderer/store/useAiContextStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useUiStore } from '../../renderer/store/useUiStore'

function createSelection() {
  return {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 5,
    isEmpty: () => false
  }
}

function createEditor() {
  const selection = createSelection()
  const model = {
    getValueInRange: vi.fn().mockReturnValue('text')
  }

  return {
    selection,
    model,
    editor: {
      addAction: vi.fn(),
      getSelection: vi.fn().mockReturnValue(selection),
      getModel: vi.fn().mockReturnValue(model),
      executeEdits: vi.fn()
    }
  }
}

describe('editorAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.api.aiProcess = vi.fn().mockResolvedValue('processed')
    window.api.aiProcessCustom = vi.fn().mockResolvedValue('custom processed')
    useAiContextStore.setState({ entries: {} })
    useEditorStore.setState({
      filePath: '/tmp/paper.tex',
      content: '\\section{Intro}\ntext around selection',
      isDirty: false,
      openFiles: {},
      activeFilePath: '/tmp/paper.tex',
      cursorLine: 1,
      cursorColumn: 1,
      pendingJump: null,
      pendingInsertText: null,
      editorInstance: null,
      _sessionOpenPaths: [],
      _sessionActiveFile: null
    })
    useUiStore.setState({
      documentSymbols: [
        {
          name: 'Intro',
          detail: '',
          kind: 2,
          range: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 0 },
          selectionRange: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0 },
          semanticKind: 'section',
          children: []
        }
      ]
    })
  })

  it('replaces the selected range for replace actions', async () => {
    const { editor, selection } = createEditor()

    await runAiAction(editor as never, AI_ACTIONS[0])

    expect(window.api.aiProcess).toHaveBeenCalledWith({
      action: 'fix',
      selectedText: 'text',
      filePath: '/tmp/paper.tex',
      lightContext: expect.objectContaining({
        filePath: '/tmp/paper.tex',
        sectionPath: ['Intro'],
        outline: ['Intro']
      }),
      summaryContext: null
    })
    expect(editor.executeEdits).toHaveBeenCalledWith('ai-fix-grammar', [
      {
        range: selection,
        text: 'processed',
        forceMoveMarkers: true
      }
    ])
  })

  it('shows a summary alert without editing for alert actions', async () => {
    const { editor } = createEditor()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    await runAiAction(editor as never, AI_ACTIONS[2])

    expect(window.api.aiProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'summarize',
        selectedText: 'text'
      })
    )
    expect(editor.executeEdits).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith('Summary:\n\nprocessed')
  })

  it('registers context menu actions that reuse the shared runner', async () => {
    const { editor } = createEditor()
    registerAiActions(editor as never)

    expect(editor.addAction).toHaveBeenCalledTimes(AI_ACTIONS.length)
    const firstAction = editor.addAction.mock.calls[0][0]

    expect(firstAction.precondition).toBe('textex.aiEnabled')
    expect(firstAction.contextMenuGroupId).toBe('ai')

    await firstAction.run(editor)

    expect(window.api.aiProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'fix',
        selectedText: 'text'
      })
    )
  })

  it('runs a custom command and replaces the selection', async () => {
    const { editor, selection } = createEditor()

    await runAiCustomCommand(editor as never, 'Make it more concise')

    expect(window.api.aiProcessCustom).toHaveBeenCalledWith({
      command: 'Make it more concise',
      selectedText: 'text',
      filePath: '/tmp/paper.tex',
      lightContext: expect.objectContaining({
        sectionPath: ['Intro']
      }),
      summaryContext: null
    })
    expect(editor.executeEdits).toHaveBeenCalledWith('ai-custom-command', [
      {
        range: selection,
        text: 'custom processed',
        forceMoveMarkers: true
      }
    ])
  })

  it('uses only a fresh summary cache and ignores stale entries', async () => {
    const { editor } = createEditor()
    useAiContextStore.setState({
      entries: {
        '/tmp/paper.tex': {
          filePath: '/tmp/paper.tex',
          contentHash: 'stale-hash',
          generatedAt: '2026-03-12T00:00:00.000Z',
          summary: 'stale summary'
        }
      }
    })

    await runAiAction(editor as never, AI_ACTIONS[3])

    expect(window.api.aiProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'longer',
        summaryContext: null
      })
    )

    useAiContextStore.setState({
      entries: {
        '/tmp/paper.tex': {
          filePath: '/tmp/paper.tex',
          contentHash: hashTextContent('\\section{Intro}\ntext around selection'),
          generatedAt: '2026-03-12T00:00:00.000Z',
          summary: 'fresh summary'
        }
      }
    })

    await runAiAction(editor as never, AI_ACTIONS[4])

    expect(window.api.aiProcess).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'shorter',
        summaryContext: expect.objectContaining({
          summary: 'fresh summary'
        })
      })
    )
  })
})
