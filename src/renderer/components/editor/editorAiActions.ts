import type { editor as monacoEditor } from 'monaco-editor'

interface AiActionDef {
  id: string
  label: string
  order: number
  mode: 'replace' | 'alert'
  action: string
}

const AI_ACTIONS: AiActionDef[] = [
  {
    id: 'ai-fix-grammar',
    label: 'AI: Fix Grammar & Spelling',
    order: 1,
    mode: 'replace',
    action: 'fix'
  },
  {
    id: 'ai-academic-rewrite',
    label: 'AI: Rewrite Academically',
    order: 2,
    mode: 'replace',
    action: 'academic'
  },
  {
    id: 'ai-summarize',
    label: 'AI: Summarize Selection',
    order: 3,
    mode: 'alert',
    action: 'summarize'
  },
  {
    id: 'ai-paraphrase-longer',
    label: 'AI: Paraphrase Longer (+)',
    order: 4,
    mode: 'replace',
    action: 'longer'
  },
  {
    id: 'ai-paraphrase-shorter',
    label: 'AI: Paraphrase Shorter (-)',
    order: 5,
    mode: 'replace',
    action: 'shorter'
  }
]

export function registerAiActions(editor: monacoEditor.IStandaloneCodeEditor): void {
  for (const def of AI_ACTIONS) {
    editor.addAction({
      id: def.id,
      label: def.label,
      contextMenuGroupId: 'ai',
      contextMenuOrder: def.order,
      precondition: 'textex.aiEnabled',
      run: async (ed) => {
        const selection = ed.getSelection()
        const model = ed.getModel()
        if (!selection || !model || selection.isEmpty()) return

        const text = model.getValueInRange(selection)
        try {
          const result = await window.api.aiProcess(def.action, text)
          if (def.mode === 'replace') {
            ed.executeEdits(def.id, [
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
    })
  }
}
