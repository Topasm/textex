import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { lspCompletionKindToMonaco } from '../utils'
import { currentDocUri, sendRequest, isInitialized } from '../lspClient'

interface CompletionMapResult {
  label: string
  kind: monacoLanguages.CompletionItemKind
  insertText: string
  insertTextRules?: monacoLanguages.CompletionItemInsertTextRule
  detail: string
  documentation?: string
  range: monacoLanguages.IRange
  sortText?: string
  filterText?: string
}

type MapItemFn = (
  item: Record<string, unknown>,
  monaco: MonacoInstance,
  range: monacoLanguages.IRange
) => CompletionMapResult

function makeCompletionProvider(
  monaco: MonacoInstance,
  triggerCharacters: string[],
  mapItem: MapItemFn
): monacoLanguages.CompletionItemProvider {
  return {
    triggerCharacters,
    provideCompletionItems: async (model, position) => {
      if (!isInitialized()) return { suggestions: [] }
      try {
        const result = (await sendRequest('textDocument/completion', {
          textDocument: { uri: currentDocUri() },
          position: { line: position.lineNumber - 1, character: position.column - 1 }
        })) as { items?: unknown[] } | unknown[] | null

        const items = Array.isArray(result) ? result : result?.items || []
        const word = model.getWordUntilPosition(position)
        const range: monacoLanguages.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = (items as Array<Record<string, unknown>>).map((item) =>
          mapItem(item, monaco, range)
        )
        return { suggestions }
      } catch {
        return { suggestions: [] }
      }
    }
  }
}

const mapLatexItem: MapItemFn = (item, monaco, range) => {
  const kind = lspCompletionKindToMonaco(monaco, item.kind as number)
  const insertText =
    (item.textEdit as Record<string, unknown>)?.newText ||
    (item.insertText as string) ||
    (item.label as string)
  const isSnippet = item.insertTextFormat === 2
  return {
    label: item.label as string,
    kind,
    insertText: insertText as string,
    insertTextRules: isSnippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    detail: (item.detail as string) || '',
    documentation: item.documentation as string | undefined,
    range,
    sortText: (item.sortText as string) || undefined,
    filterText: (item.filterText as string) || undefined
  }
}

const mapBibtexItem: MapItemFn = (item, monaco, range) => ({
  label: item.label as string,
  kind: lspCompletionKindToMonaco(monaco, item.kind as number),
  insertText: ((item.textEdit as Record<string, unknown>)?.newText ||
    item.insertText ||
    item.label) as string,
  detail: (item.detail as string) || '',
  range
})

export const createCompletionProvider = (
  monaco: MonacoInstance
): monacoLanguages.CompletionItemProvider =>
  makeCompletionProvider(monaco, ['\\', '{', ',', ' '], mapLatexItem)

export const createBibtexCompletionProvider = (
  monaco: MonacoInstance
): monacoLanguages.CompletionItemProvider =>
  makeCompletionProvider(monaco, ['@', '{'], mapBibtexItem)
