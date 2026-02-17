import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { sendRequest, isInitialized } from '../lspClient'

export const createFoldingProvider = (monaco: MonacoInstance): monacoLanguages.FoldingRangeProvider => {
    return {
        provideFoldingRanges: async (model) => {
            if (!isInitialized()) return []
            try {
                const result = (await sendRequest('textDocument/foldingRange', {
                    textDocument: { uri: model.uri.toString() }
                })) as Array<{ startLine: number; endLine: number; kind?: string }> | null

                if (!result) return []
                return result.map((r) => ({
                    start: r.startLine + 1,
                    end: r.endLine + 1,
                    kind: r.kind === 'comment'
                        ? monaco.languages.FoldingRangeKind.Comment
                        : r.kind === 'imports'
                            ? monaco.languages.FoldingRangeKind.Imports
                            : monaco.languages.FoldingRangeKind.Region
                }))
            } catch {
                return []
            }
        }
    }
}
