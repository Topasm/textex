import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { currentDocUri, sendRequest, isInitialized } from '../lspClient'

export const createDefinitionProvider = (monaco: MonacoInstance): monacoLanguages.DefinitionProvider => {
    return {
        provideDefinition: async (model, position) => {
            if (!isInitialized()) return null
            try {
                const result = (await sendRequest('textDocument/definition', {
                    textDocument: { uri: currentDocUri() },
                    position: { line: position.lineNumber - 1, character: position.column - 1 }
                })) as Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> | { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } | null

                if (!result) return null
                const locations = Array.isArray(result) ? result : [result]
                return locations.map((loc) => ({
                    uri: monaco.Uri.parse(loc.uri),
                    range: {
                        startLineNumber: loc.range.start.line + 1,
                        startColumn: loc.range.start.character + 1,
                        endLineNumber: loc.range.end.line + 1,
                        endColumn: loc.range.end.character + 1
                    }
                }))
            } catch {
                return null
            }
        }
    }
}
