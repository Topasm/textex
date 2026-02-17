import type { editor as monacoEditor, IDisposable, IRange } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

interface TableModalState {
  isOpen: boolean
  latex: string
  range: IRange | null
}

export function registerTableEditorCodeLens(
  editor: monacoEditor.IStandaloneCodeEditor,
  monaco: MonacoInstance,
  setTableModal: (updater: (prev: TableModalState) => TableModalState) => void
): IDisposable[] {
  const disposables: IDisposable[] = []

  const codeLensProvider = monaco.languages.registerCodeLensProvider('latex', {
    provideCodeLenses: (model: monacoEditor.ITextModel) => {
      const text = model.getValue()
      const lenses = []
      const regex = /\\begin{tabular}/g
      let match

      while ((match = regex.exec(text)) !== null) {
        const position = model.getPositionAt(match.index)
        lenses.push({
          range: {
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: 1
          },
          command: {
            id: 'textex.openTableEditor',
            title: '📊 Edit Table Visually',
            arguments: [match.index]
          }
        })
      }
      return { lenses, dispose: () => { } }
    }
  })
  disposables.push(codeLensProvider)

  const command = monaco.editor.registerCommand('textex.openTableEditor', (_: unknown, startIndex: number) => {
    const model = editor.getModel()
    if (!model) return

    const text = model.getValue()
    const tail = text.slice(startIndex)
    const endMatch = tail.match(/\\end{tabular}/)

    if (endMatch && endMatch.index !== undefined) {
      const endIndex = startIndex + endMatch.index + endMatch[0].length
      const range = {
        startLineNumber: model.getPositionAt(startIndex).lineNumber,
        startColumn: model.getPositionAt(startIndex).column,
        endLineNumber: model.getPositionAt(endIndex).lineNumber,
        endColumn: model.getPositionAt(endIndex).column
      }
      const tableLatex = text.slice(startIndex, endIndex)

      setTableModal(() => ({
        isOpen: true,
        latex: tableLatex,
        range
      }))
    }
  })
  disposables.push(command)

  return disposables
}
