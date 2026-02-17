import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { currentDocUri, sendRequest, isInitialized } from '../lspClient'

export const createFormattingProvider = (_monaco: MonacoInstance): monacoLanguages.DocumentFormattingEditProvider => {
    return {
        provideDocumentFormattingEdits: async (_model) => {
            if (!isInitialized()) return []
            try {
                const result = (await sendRequest('textDocument/formatting', {
                    textDocument: { uri: currentDocUri() },
                    options: { tabSize: 2, insertSpaces: true }
                })) as Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> | null

                if (!result) return []
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
