import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { sendRequest, isInitialized } from '../lspClient'

export const createFormattingProvider = (
  _monaco: MonacoInstance
): monacoLanguages.DocumentFormattingEditProvider => {
  return {
    provideDocumentFormattingEdits: async (model, options, token) => {
      if (!isInitialized()) return []
      const sourceVersion = model.getVersionId()
      try {
        const result = (await sendRequest('textDocument/formatting', {
          textDocument: { uri: model.uri.toString() },
          options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces }
        })) as Array<{
          range: {
            start: { line: number; character: number }
            end: { line: number; character: number }
          }
          newText: string
        }> | null

        if (
          !result ||
          token.isCancellationRequested ||
          model.isDisposed() ||
          model.getVersionId() !== sourceVersion
        )
          return []
        return result.map((edit) => ({
          range: {
            startLineNumber: edit.range.start.line + 1,
            startColumn: edit.range.start.character + 1,
            endLineNumber: edit.range.end.line + 1,
            endColumn: edit.range.end.character + 1
          },
          text: edit.newText
        }))
      } catch {
        return []
      }
    }
  }
}
