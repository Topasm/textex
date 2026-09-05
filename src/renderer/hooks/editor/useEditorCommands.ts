import { useCallback, useRef } from 'react'
import { formatLatex } from '../../utils/formatter'
import { HIDDEN_EDITOR_ACTIONS } from '../../constants'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

/**
 * Returns a callback that registers editor keybindings and filters the command palette.
 * Call it inside `onMount` after the editor instance is available.
 */
export function useEditorCommands() {
  const formatRequestIdRef = useRef(0)

  return useCallback((editor: monacoEditor.IStandaloneCodeEditor, monaco: MonacoInstance) => {
    // Shift+Alt+F: Format document
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, async () => {
      const model = editor.getModel()
      if (!model) return
      const requestId = ++formatRequestIdRef.current
      const modelVersion = model.getVersionId()
      const text = model.getValue()
      const formatted = await formatLatex(text)

      if (
        requestId !== formatRequestIdRef.current ||
        editor.getModel() !== model ||
        model.getVersionId() !== modelVersion ||
        formatted === text
      ) {
        return
      }

      editor.executeEdits('prettier', [
        {
          range: model.getFullModelRange(),
          text: formatted,
          forceMoveMarkers: true
        }
      ])
    })

    // Filter command palette: remove IDE actions not relevant for LaTeX editing
    const editorAny = editor as unknown as {
      getSupportedActions(): { id: string }[]
    }
    if (typeof editorAny.getSupportedActions === 'function') {
      const origGetSupportedActions = editorAny.getSupportedActions.bind(editorAny)
      editorAny.getSupportedActions = () => {
        return origGetSupportedActions().filter((a) => !HIDDEN_EDITOR_ACTIONS.has(a.id))
      }
    }
  }, [])
}
