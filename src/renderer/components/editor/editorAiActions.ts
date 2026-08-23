import type { editor as monacoEditor } from 'monaco-editor'
import type { AiAction } from '../../../shared/types'
import { buildAiCustomProcessRequest, buildAiProcessRequest } from '../../services/aiContext'

export interface AiActionDef {
  id: string
  label: string
  buttonLabel: string
  order: number
  mode: 'replace' | 'alert'
  action: AiAction
}

export const AI_ACTIONS: AiActionDef[] = [
  {
    id: 'ai-fix-grammar',
    label: 'AI: Fix Grammar & Spelling',
    buttonLabel: 'Fix',
    order: 1,
    mode: 'replace',
    action: 'fix'
  },
  {
    id: 'ai-academic-rewrite',
    label: 'AI: Rewrite Academically',
    buttonLabel: 'Academic',
    order: 2,
    mode: 'replace',
    action: 'academic'
  },
  {
    id: 'ai-summarize',
    label: 'AI: Summarize Selection',
    buttonLabel: 'Summarize',
    order: 3,
    mode: 'alert',
    action: 'summarize'
  },
  {
    id: 'ai-paraphrase-longer',
    label: 'AI: Paraphrase Longer (+)',
    buttonLabel: 'Longer',
    order: 4,
    mode: 'replace',
    action: 'longer'
  },
  {
    id: 'ai-paraphrase-shorter',
    label: 'AI: Paraphrase Shorter (-)',
    buttonLabel: 'Shorter',
    order: 5,
    mode: 'replace',
    action: 'shorter'
  }
]

function selectionIsCurrent(
  editor: monacoEditor.ICodeEditor,
  model: monacoEditor.ITextModel,
  versionId: number,
  selection: NonNullable<ReturnType<monacoEditor.ICodeEditor['getSelection']>>,
  selectedText: string
): boolean {
  return (
    editor.getModel() === model &&
    model.getVersionId() === versionId &&
    model.getValueInRange(selection) === selectedText
  )
}

function warnStaleAiResult(): void {
  alert('The document changed while AI was processing. No text was replaced.')
}

export async function runAiAction(
  editor: monacoEditor.ICodeEditor,
  def: AiActionDef
): Promise<void> {
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || selection.isEmpty()) return

  const text = model.getValueInRange(selection)
  const versionId = model.getVersionId()
  try {
    const request = await buildAiProcessRequest(def.action, selection, text)
    const result = await window.api.aiProcess(request)
    if (def.mode === 'replace') {
      if (!selectionIsCurrent(editor, model, versionId, selection, text)) {
        warnStaleAiResult()
        return
      }
      editor.executeEdits(def.id, [
        {
          range: selection,
          text: result,
          forceMoveMarkers: true
        }
      ])
    } else {
      alert(`Summary:\n\n${result}`)
    }
  } catch (e) {
    console.error(e)
    alert('AI processing failed. Enable AI Draft in Settings > Integrations.')
  }
}

export async function runAiCustomCommand(
  editor: monacoEditor.ICodeEditor,
  command: string
): Promise<void> {
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || selection.isEmpty()) return

  const trimmedCommand = command.trim()
  if (!trimmedCommand) return

  const text = model.getValueInRange(selection)
  const versionId = model.getVersionId()
  try {
    const request = await buildAiCustomProcessRequest(trimmedCommand, selection, text)
    const result = await window.api.aiProcessCustom(request)
    if (!selectionIsCurrent(editor, model, versionId, selection, text)) {
      warnStaleAiResult()
      return
    }
    editor.executeEdits('ai-custom-command', [
      {
        range: selection,
        text: result,
        forceMoveMarkers: true
      }
    ])
  } catch (e) {
    console.error(e)
    alert('AI processing failed. Enable AI Draft in Settings > Integrations.')
  }
}

export function registerAiActions(editor: monacoEditor.IStandaloneCodeEditor): void {
  for (const def of AI_ACTIONS) {
    editor.addAction({
      id: def.id,
      label: def.label,
      contextMenuGroupId: 'ai',
      contextMenuOrder: def.order,
      precondition: 'textex.aiEnabled',
      run: async (ed) => runAiAction(ed, def)
    })
  }
}
