import type { languages as monacoLanguages, IMarkdownString } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { currentDocUri, sendRequest, isInitialized } from '../lspClient'

function formatHoverContents(contents: unknown): IMarkdownString[] {
    if (typeof contents === 'string') {
        return [{ value: contents }]
    }
    if (Array.isArray(contents)) {
        return contents.map((c) =>
            typeof c === 'string' ? { value: c } : { value: (c as { value: string }).value || String(c) }
        )
    }
    if (contents && typeof contents === 'object') {
        const obj = contents as { kind?: string; value?: string; language?: string }
        if (obj.kind === 'markdown' || obj.value) {
            return [{ value: obj.value || '' }]
        }
        if (obj.language) {
            return [{ value: `\`\`\`${obj.language}\n${obj.value}\n\`\`\`` }]
        }
    }
    return []
}

export const createHoverProvider = (_monaco: MonacoInstance): monacoLanguages.HoverProvider => {
    return {
        provideHover: async (model, position) => {
            if (!isInitialized()) return null
            try {
                const result = (await sendRequest('textDocument/hover', {
                    textDocument: { uri: currentDocUri() },
                    position: { line: position.lineNumber - 1, character: position.column - 1 }
                })) as { contents: unknown; range?: { start: { line: number; character: number }; end: { line: number; character: number } } } | null

                if (!result || !result.contents) return null
                const contents = formatHoverContents(result.contents)
                const range = result.range
                    ? {
                        startLineNumber: result.range.start.line + 1,
                        startColumn: result.range.start.character + 1,
                        endLineNumber: result.range.end.line + 1,
                        endColumn: result.range.end.character + 1
                    }
                    : undefined
                return { contents, range }
            } catch {
                return null
            }
        }
    }
}
