import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { currentDocUri, sendRequest, isInitialized } from '../lspClient'

export const createRenameProvider = (monaco: MonacoInstance): monacoLanguages.RenameProvider => {
  return {
    provideRenameEdits: async (model, position, newName) => {
      if (!isInitialized()) return null
      try {
        const result = (await sendRequest('textDocument/rename', {
          textDocument: { uri: currentDocUri() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
          newName
        })) as {
          changes?: Record<
            string,
            Array<{
              range: {
                start: { line: number; character: number }
                end: { line: number; character: number }
              }
              newText: string
            }>
          >
        } | null

        if (!result?.changes) return null
        const edits: monacoLanguages.IWorkspaceTextEdit[] = []
        for (const [uri, changes] of Object.entries(result.changes)) {
          for (const change of changes) {
            edits.push({
              resource: monaco.Uri.parse(uri),
              textEdit: {
                range: {
                  startLineNumber: change.range.start.line + 1,
                  startColumn: change.range.start.character + 1,
                  endLineNumber: change.range.end.line + 1,
                  endColumn: change.range.end.character + 1
                },
                text: change.newText
              },
              versionId: undefined as unknown as number
            })
          }
        }
        return { edits }
      } catch {
        return null
      }
    },
    resolveRenameLocation: async (model, position) => {
      if (!isInitialized())
        return {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          text: ''
        }
      try {
        const result = (await sendRequest('textDocument/prepareRename', {
          textDocument: { uri: currentDocUri() },
          position: { line: position.lineNumber - 1, character: position.column - 1 }
        })) as {
          range: {
            start: { line: number; character: number }
            end: { line: number; character: number }
          }
          placeholder?: string
        } | null

        if (!result)
          return {
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            text: '',
            rejectReason: 'Cannot rename this element'
          }
        return {
          range: {
            startLineNumber: result.range.start.line + 1,
            startColumn: result.range.start.character + 1,
            endLineNumber: result.range.end.line + 1,
            endColumn: result.range.end.character + 1
          },
          text:
            result.placeholder ||
            model.getValueInRange({
              startLineNumber: result.range.start.line + 1,
              startColumn: result.range.start.character + 1,
              endLineNumber: result.range.end.line + 1,
              endColumn: result.range.end.character + 1
            })
        }
      } catch {
        return {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          text: '',
          rejectReason: 'Rename not available'
        }
      }
    }
  }
}
