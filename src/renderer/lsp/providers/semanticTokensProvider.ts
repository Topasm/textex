import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { sendRequest, isInitialized } from '../lspClient'

export const createSemanticTokensProvider = (
  monaco: MonacoInstance,
  legend: { tokenTypes: string[]; tokenModifiers: string[] }
): monacoLanguages.DocumentSemanticTokensProvider => {
  return {
    getLegend: () => legend,
    provideDocumentSemanticTokens: async (model) => {
      if (!isInitialized()) return null
      try {
        const result = (await sendRequest('textDocument/semanticTokens/full', {
          textDocument: { uri: model.uri.toString() }
        })) as { data: number[] } | null

        if (!result || !result.data) return null
        return {
          data: new Uint32Array(result.data)
        }
      } catch {
        return null
      }
    },
    releaseDocumentSemanticTokens: () => {}
  }
}
