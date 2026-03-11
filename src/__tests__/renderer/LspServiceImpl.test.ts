import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonacoInstance } from '../../renderer/lsp/types'
import { LspClient } from '../../renderer/lsp/LspServiceImpl'

vi.mock('../../renderer/lsp/providers/completionProvider', () => ({
  createCompletionProvider: vi.fn(() => ({})),
  createBibtexCompletionProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/hoverProvider', () => ({
  createHoverProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/definitionProvider', () => ({
  createDefinitionProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/symbolProvider', () => ({
  createDocumentSymbolProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/renameProvider', () => ({
  createRenameProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/formattingProvider', () => ({
  createFormattingProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/foldingProvider', () => ({
  createFoldingProvider: vi.fn(() => ({}))
}))

vi.mock('../../renderer/lsp/providers/semanticTokensProvider', () => ({
  createSemanticTokensProvider: vi.fn(() => ({}))
}))

type TrackingDisposable = {
  readonly id: string
  disposeCalls: number
  dispose(): void
}

function createTrackingDisposable(id: string): TrackingDisposable {
  const disposable: TrackingDisposable = {
    id,
    disposeCalls: 0,
    dispose() {
      if (this !== disposable) {
        throw new Error(
          'Unbound disposable context: Need to use an arrow function to preserve the value of this'
        )
      }
      disposable.disposeCalls += 1
    }
  }

  return disposable
}

function createMonacoMock(disposables: TrackingDisposable[]): MonacoInstance {
  const register = (id: string) => vi.fn(() => {
    const disposable = createTrackingDisposable(id)
    disposables.push(disposable)
    return disposable
  })

  return {
    languages: {
      registerCompletionItemProvider: register('completion'),
      registerHoverProvider: register('hover'),
      registerDefinitionProvider: register('definition'),
      registerDocumentSymbolProvider: register('documentSymbol'),
      registerRenameProvider: register('rename'),
      registerDocumentFormattingEditProvider: register('formatting'),
      registerFoldingRangeProvider: register('folding'),
      registerDocumentSemanticTokensProvider: register('semanticTokens')
    }
  } as unknown as MonacoInstance
}

describe('LspClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disposes registered Monaco providers with bound context', () => {
    const trackedDisposables: TrackingDisposable[] = []
    const monaco = createMonacoMock(trackedDisposables)
    const client = new LspClient()

    ;(client as unknown as { serverCapabilities: Record<string, unknown> }).serverCapabilities = {
      completionProvider: {},
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      renameProvider: true,
      documentFormattingProvider: true,
      foldingRangeProvider: true,
      semanticTokensProvider: {
        legend: { tokenTypes: ['type'], tokenModifiers: ['definition'] }
      }
    }

    ;(client as unknown as { registerProviders: (monaco: MonacoInstance) => void }).registerProviders(
      monaco
    )

    expect(trackedDisposables).toHaveLength(9)

    expect(() => {
      ;(client as unknown as { disposables: { dispose(): void } }).disposables.dispose()
    }).not.toThrow()

    expect(trackedDisposables.map((disposable) => disposable.disposeCalls)).toEqual(
      Array.from({ length: 9 }, () => 1)
    )
  })
})
