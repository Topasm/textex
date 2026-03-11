import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_ACTIONS,
  registerAiActions,
  runAiAction,
  runAiCustomCommand
} from '../../renderer/components/editor/editorAiActions'

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
  })

  it('replaces the selected range for replace actions', async () => {
    const { editor, selection } = createEditor()

    await runAiAction(editor as never, AI_ACTIONS[0])

    expect(window.api.aiProcess).toHaveBeenCalledWith('fix', 'text')
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

    expect(window.api.aiProcess).toHaveBeenCalledWith('summarize', 'text')
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

    expect(window.api.aiProcess).toHaveBeenCalledWith('fix', 'text')
  })

  it('runs a custom command and replaces the selection', async () => {
    const { editor, selection } = createEditor()

    await runAiCustomCommand(editor as never, 'Make it more concise')

    expect(window.api.aiProcessCustom).toHaveBeenCalledWith('Make it more concise', 'text')
    expect(editor.executeEdits).toHaveBeenCalledWith('ai-custom-command', [
      {
        range: selection,
        text: 'custom processed',
        forceMoveMarkers: true
      }
    ])
  })
})
