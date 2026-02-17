import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { lspSymbolKindToMonaco } from '../utils'
import { currentDocUri, sendRequest, isInitialized } from '../lspClient'

export const createDocumentSymbolProvider = (
  monaco: MonacoInstance
): monacoLanguages.DocumentSymbolProvider => {
  return {
    provideDocumentSymbols: async (_model) => {
      if (!isInitialized()) return []
      try {
        const result = (await sendRequest('textDocument/documentSymbol', {
          textDocument: { uri: currentDocUri() }
        })) as Array<Record<string, unknown>> | null

        if (!result) return []
        return result.map((sym) => {
          const range = sym.range as {
            start: { line: number; character: number }
            end: { line: number; character: number }
          }
          const selRange = (sym.selectionRange || range) as typeof range
          return {
            name: sym.name as string,
            detail: (sym.detail as string) || '',
            kind: lspSymbolKindToMonaco(monaco, sym.kind as number),
            range: {
              startLineNumber: range.start.line + 1,
              startColumn: range.start.character + 1,
              endLineNumber: range.end.line + 1,
              endColumn: range.end.character + 1
            },
            selectionRange: {
              startLineNumber: selRange.start.line + 1,
              startColumn: selRange.start.character + 1,
              endLineNumber: selRange.end.line + 1,
              endColumn: selRange.end.character + 1
            },
            tags: []
          }
        })
      } catch {
        return []
      }
    }
  }
}
