import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonacoInstance } from '../../renderer/lsp/types'
import { createCompletionProvider } from '../../renderer/lsp/providers/completionProvider'
import { createHoverProvider } from '../../renderer/lsp/providers/hoverProvider'
import { createDefinitionProvider } from '../../renderer/lsp/providers/definitionProvider'
import { createDocumentSymbolProvider } from '../../renderer/lsp/providers/symbolProvider'
import { createRenameProvider } from '../../renderer/lsp/providers/renameProvider'
import { createFormattingProvider } from '../../renderer/lsp/providers/formattingProvider'

const lspClientMock = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  isInitialized: vi.fn(() => true),
  currentDocUri: vi.fn(() => 'file:///wrong.tex')
}))

vi.mock('../../renderer/lsp/lspClient', () => lspClientMock)

const modelUri = 'file:///project/main.tex'

function createMonacoMock(): MonacoInstance {
  return {
    Uri: {
      parse: vi.fn((value: string) => ({ toString: () => value, path: '/project/main.tex' }))
    },
    languages: {
      CompletionItemKind: {
        Text: 1,
        Method: 2,
        Function: 3,
        Constructor: 4,
        Field: 5,
        Variable: 6,
        Class: 7,
        Interface: 8,
        Module: 9,
        Property: 10,
        Keyword: 14,
        Snippet: 15,
        Constant: 21
      },
      CompletionItemInsertTextRule: {
        InsertAsSnippet: 4
      },
      SymbolKind: {
        File: 1,
        Module: 2,
        Namespace: 3,
        Class: 5,
        Method: 6,
        Constructor: 8,
        Function: 12,
        Variable: 13,
        Constant: 14,
        String: 15
      }
    }
  } as unknown as MonacoInstance
}

function createModel() {
  return {
    uri: { toString: () => modelUri },
    getWordUntilPosition: vi.fn(() => ({ startColumn: 1, endColumn: 4 })),
    getValueInRange: vi.fn(() => 'value')
  }
}

const position = { lineNumber: 3, column: 5 }

describe('LSP providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lspClientMock.isInitialized.mockReturnValue(true)
    lspClientMock.currentDocUri.mockReturnValue('file:///wrong.tex')
    lspClientMock.sendRequest.mockImplementation(async (method: string) => {
      switch (method) {
        case 'textDocument/completion':
          return []
        case 'textDocument/hover':
          return { contents: 'hover' }
        case 'textDocument/definition':
          return null
        case 'textDocument/documentSymbol':
          return []
        case 'textDocument/rename':
          return { changes: {} }
        case 'textDocument/prepareRename':
          return {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 }
            },
            placeholder: 'x'
          }
        case 'textDocument/formatting':
          return []
        default:
          throw new Error(`Unexpected method: ${method}`)
      }
    })
  })

  it.each([
    {
      name: 'completion',
      method: 'textDocument/completion',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createCompletionProvider(monaco).provideCompletionItems(
          model as never,
          position as never
        )
      }
    },
    {
      name: 'hover',
      method: 'textDocument/hover',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createHoverProvider(monaco).provideHover(model as never, position as never)
      }
    },
    {
      name: 'definition',
      method: 'textDocument/definition',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createDefinitionProvider(monaco).provideDefinition(model as never, position as never)
      }
    },
    {
      name: 'document symbol',
      method: 'textDocument/documentSymbol',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createDocumentSymbolProvider(monaco).provideDocumentSymbols(model as never)
      }
    },
    {
      name: 'rename edits',
      method: 'textDocument/rename',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createRenameProvider(monaco).provideRenameEdits(
          model as never,
          position as never,
          'newName'
        )
      }
    },
    {
      name: 'prepare rename',
      method: 'textDocument/prepareRename',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createRenameProvider(monaco).resolveRenameLocation(model as never, position as never)
      }
    },
    {
      name: 'formatting',
      method: 'textDocument/formatting',
      invoke: async (monaco: MonacoInstance, model: ReturnType<typeof createModel>) => {
        await createFormattingProvider(monaco).provideDocumentFormattingEdits(model as never)
      }
    }
  ])('uses the Monaco model URI for $name requests', async ({ method, invoke }) => {
    const monaco = createMonacoMock()
    const model = createModel()

    await invoke(monaco, model)

    expect(lspClientMock.sendRequest).toHaveBeenCalledWith(
      method,
      expect.objectContaining({
        textDocument: { uri: modelUri }
      })
    )
    expect(lspClientMock.currentDocUri).not.toHaveBeenCalled()
  })
})
