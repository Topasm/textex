import { MonacoInstance } from './types'
import { languages as monacoLanguages } from 'monaco-editor'

export function lspCompletionKindToMonaco(
  monaco: MonacoInstance,
  kind: number | undefined
): monacoLanguages.CompletionItemKind {
  const map: Record<number, monacoLanguages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    21: monaco.languages.CompletionItemKind.Constant
  }
  return map[kind || 1] || monaco.languages.CompletionItemKind.Text
}

export function lspSymbolKindToMonaco(
  monaco: MonacoInstance,
  kind: number
): monacoLanguages.SymbolKind {
  const map: Record<number, monacoLanguages.SymbolKind> = {
    1: monaco.languages.SymbolKind.File,
    2: monaco.languages.SymbolKind.Module,
    3: monaco.languages.SymbolKind.Namespace,
    5: monaco.languages.SymbolKind.Class,
    6: monaco.languages.SymbolKind.Method,
    8: monaco.languages.SymbolKind.Constructor,
    12: monaco.languages.SymbolKind.Function,
    13: monaco.languages.SymbolKind.Variable,
    14: monaco.languages.SymbolKind.Constant,
    15: monaco.languages.SymbolKind.String
  }
  return map[kind] || monaco.languages.SymbolKind.Variable
}
