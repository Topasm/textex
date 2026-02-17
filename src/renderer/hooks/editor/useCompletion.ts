import { useCallback } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { snippets } from '../../data/snippets'
import { environments } from '../../data/environments'
import { registerHoverProvider } from '../../providers/hoverProvider'
import { useAppStore } from '../../store/useAppStore'

type MonacoInstance = typeof import('monaco-editor')

export function useCompletion(
  runSpellCheck: () => Promise<void>
): (editor: monacoEditor.IStandaloneCodeEditor, monaco: MonacoInstance) => Array<{ dispose(): void }> {
  return useCallback((editor: monacoEditor.IStandaloneCodeEditor, monaco: MonacoInstance) => {
    const disposables: Array<{ dispose(): void }> = []

    const snippetDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }
        const suggestions = snippets.map((snippet) => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: snippet.description,
          detail: `[${snippet.category}] ${snippet.prefix}`,
          range,
          filterText: snippet.prefix
        }))

        const packageData = useAppStore.getState().packageData
        const seenNames = new Set(snippets.map((s) => s.prefix))
        for (const [pkgName, pkg] of Object.entries(packageData)) {
          for (const macro of pkg.macros) {
            if (seenNames.has(macro.name)) continue
            seenNames.add(macro.name)
            suggestions.push({
              label: `\\${macro.name}`,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: macro.snippet
                ? `\\\\${macro.snippet}`
                : `\\\\${macro.name}`,
              insertTextRules: macro.snippet
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : 0 as never,
              documentation: macro.detail || `From package: ${pkgName}`,
              detail: `[${pkgName}]`,
              range,
              filterText: macro.name
            })
          }
        }

        return { suggestions }
      }
    })
    disposables.push(snippetDisposable)

    const citeDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['{', ','],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)
        const citeMatch = textBefore.match(/\\cite[tp]?\*?\{([^}]*)$/)
        if (!citeMatch) return { suggestions: [] }

        const bibEntries = useAppStore.getState().bibEntries
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = bibEntries.map((entry) => ({
          label: entry.key,
          kind: monaco.languages.CompletionItemKind.Reference,
          insertText: entry.key,
          documentation: `${entry.author} (${entry.year})\n${entry.title}`,
          detail: entry.type,
          range
        }))
        return { suggestions }
      }
    })
    disposables.push(citeDisposable)

    const refDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['{', ','],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)
        const refMatch = textBefore.match(/\\(?:ref|eqref|autoref|pageref|cref|Cref|nameref)\{([^}]*)$/)
        if (!refMatch) return { suggestions: [] }

        const labels = useAppStore.getState().labels
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = labels.map((info) => ({
          label: info.label,
          kind: monaco.languages.CompletionItemKind.Reference,
          insertText: info.label,
          documentation: `${info.file}:${info.line}\n${info.context}`,
          detail: `Label (${info.file.split('/').pop()}:${info.line})`,
          range
        }))
        return { suggestions }
      }
    })
    disposables.push(refDisposable)

    const envDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['{'],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)
        if (!textBefore.match(/\\begin\{[^}]*$/)) return { suggestions: [] }

        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const packageData = useAppStore.getState().packageData
        const allEnvs = [...environments]
        for (const pkg of Object.values(packageData)) {
          for (const env of pkg.envs) {
            if (!allEnvs.some((e) => e.name === env.name)) {
              allEnvs.push(env)
            }
          }
        }

        const suggestions = allEnvs.map((env) => {
          const argPart = env.argSnippet || ''
          const snippet = `${env.name}}${argPart}\n\t$0\n\\\\end{${env.name}}`
          return {
            label: env.name,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: `\\begin{${env.name}}...\\end{${env.name}}`,
            detail: 'Environment',
            range
          }
        })
        return { suggestions }
      }
    })
    disposables.push(envDisposable)

    const addWordCmdId = editor.addCommand(0, async (...args: unknown[]) => {
      const word = args[0] as string
      if (word) {
        await window.api.spellAddWord(word)
        void runSpellCheck()
      }
    })

    const codeActionDisposable = monaco.languages.registerCodeActionProvider('latex', {
      provideCodeActions: async (model, range, context) => {
        const spellMarkers = context.markers.filter((m) => m.source === 'spellcheck')
        if (spellMarkers.length === 0) return { actions: [], dispose: () => {} }

        const actions: monacoEditor.ICodeAction[] = []
        for (const marker of spellMarkers) {
          const word = model.getValueInRange({
            startLineNumber: marker.startLineNumber,
            startColumn: marker.startColumn,
            endLineNumber: marker.endLineNumber,
            endColumn: marker.endColumn
          })
          try {
            const suggestions = await window.api.spellSuggest(word)
            for (const suggestion of suggestions) {
              actions.push({
                title: `Change to "${suggestion}"`,
                kind: 'quickfix',
                edit: {
                  edits: [
                    {
                      resource: model.uri,
                      textEdit: {
                        range: {
                          startLineNumber: marker.startLineNumber,
                          startColumn: marker.startColumn,
                          endLineNumber: marker.endLineNumber,
                          endColumn: marker.endColumn
                        },
                        text: suggestion
                      },
                      versionId: model.getVersionId()
                    }
                  ]
                }
              })
            }
            if (addWordCmdId) {
              actions.push({
                title: `Add "${word}" to dictionary`,
                kind: 'quickfix',
                command: {
                  id: addWordCmdId,
                  title: `Add "${word}"`,
                  arguments: [word]
                }
              })
            }
          } catch {
            // ignore
          }
        }
        return { actions, dispose: () => {} }
      }
    })
    disposables.push(codeActionDisposable)

    const hoverDisposable = registerHoverProvider(monaco, {
      getLabels: () => useAppStore.getState().labels,
      getBibEntries: () => useAppStore.getState().bibEntries
    })
    disposables.push(hoverDisposable)

    return disposables
  }, [runSpellCheck])
}
