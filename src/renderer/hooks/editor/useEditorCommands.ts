import { useCallback } from 'react'
import { usePdfStore } from '../../store/usePdfStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { formatLatex } from '../../utils/formatter'
import { HIDDEN_EDITOR_ACTIONS } from '../../constants'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

interface EditorCommandsOptions {
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>
  showHistory: boolean
  setHistoryMode: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Returns a callback that registers editor keybindings and filters the command palette.
 * Call it inside `onMount` after the editor instance is available.
 */
export function useEditorCommands({
  setShowHistory,
  showHistory,
  setHistoryMode
}: EditorCommandsOptions) {
  return useCallback(
    (editor: monacoEditor.IStandaloneCodeEditor, monaco: MonacoInstance) => {
      // Ctrl+F: Sync Search — triggers both editor find widget AND PDF search bar
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
        const selection = editor.getSelection()
        const model = editor.getModel()
        const pdfState = usePdfStore.getState()

        pdfState.setPdfSearchVisible(true)

        if (selection && model && !selection.isEmpty()) {
          const text = model.getValueInRange(selection)
          if (text.trim().length > 0) {
            pdfState.setPdfSearchQuery(text)
          }
        }

        editor.trigger('source', 'actions.find', {})
      })

      // Shift+Alt+F: Format document
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, async () => {
        const model = editor.getModel()
        if (!model) return
        const text = model.getValue()
        const formatted = await formatLatex(text)

        editor.executeEdits('prettier', [
          {
            range: model.getFullModelRange(),
            text: formatted,
            forceMoveMarkers: true
          }
        ])
      })

      // Ctrl+Shift+I: Insert user info
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI, () => {
        const settings = useSettingsStore.getState().settings
        const userInfo = `
% User Information
% Name: ${settings.name}
% Email: ${settings.email}
% Affiliation: ${settings.affiliation}
\\author{${settings.name}${settings.affiliation ? ` \\\\ ${settings.affiliation}` : ''}${settings.email ? ` \\\\ \\texttt{${settings.email}}` : ''}}
`
        const position = editor.getPosition()
        if (position) {
          editor.executeEdits('insert-user-info', [
            {
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              ),
              text: userInfo,
              forceMoveMarkers: true
            }
          ])
        }
      })

      // Ctrl+Shift+H: Toggle history panel
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH, () => {
        setShowHistory((prev) => !prev)
        if (showHistory) setHistoryMode(false)
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
    },
    [setShowHistory, showHistory, setHistoryMode]
  )
}
