import type { languages as monacoLanguages } from 'monaco-editor'
import { MonacoInstance } from '../types'
import { sendRequest, isInitialized } from '../lspClient'

export const createRenameProvider = (monaco: MonacoInstance): monacoLanguages.RenameProvider => {
  return {
    provideRenameEdits: async (model, position, newName, token) => {
      if (!isInitialized()) return null
      const sourceVersion = model.getVersionId()
      const startingVersions = new Map(
        monaco.editor
          .getModels()
          .map((openModel) => [openModel.uri.toString(), openModel.getVersionId()] as const)
      )
      try {
        const result = (await sendRequest('textDocument/rename', {
          textDocument: { uri: model.uri.toString() },
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

        if (
          !result?.changes ||
          token.isCancellationRequested ||
          model.isDisposed() ||
          model.getVersionId() !== sourceVersion
        )
          return null
        const edits: monacoLanguages.IWorkspaceTextEdit[] = []
        for (const [uri, changes] of Object.entries(result.changes)) {
          const resource = monaco.Uri.parse(uri)
          const resourceKey = resource.toString()
          const openModel = monaco.editor.getModel(resource)
          if (
            openModel &&
            (startingVersions.get(resourceKey) === undefined ||
              startingVersions.get(resourceKey) !== openModel.getVersionId())
          )
            return null
          for (const change of changes) {
            edits.push({
              resource,
              textEdit: {
                range: {
                  startLineNumber: change.range.start.line + 1,
                  startColumn: change.range.start.character + 1,
                  endLineNumber: change.range.end.line + 1,
                  endColumn: change.range.end.character + 1
                },
                text: change.newText
              },
              versionId: openModel?.getVersionId()
            })
          }
        }
        return { edits }
      } catch {
        return null
      }
    },
    resolveRenameLocation: async (model, position, token) => {
      if (!isInitialized())
        return {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          text: ''
        }
      const sourceVersion = model.getVersionId()
      try {
        const result = (await sendRequest('textDocument/prepareRename', {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 }
        })) as {
          range: {
            start: { line: number; character: number }
            end: { line: number; character: number }
          }
          placeholder?: string
        } | null

        if (
          !result ||
          token.isCancellationRequested ||
          model.isDisposed() ||
          model.getVersionId() !== sourceVersion
        )
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
