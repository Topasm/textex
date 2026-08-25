import { describe, expect, it, vi } from 'vitest'
import type {
  CancellationToken,
  Position,
  editor as monacoEditor,
  languages as monacoLanguages
} from 'monaco-editor'
import { registerHoverProvider } from '../../renderer/providers/hoverProvider'

describe('LaTeX hover provider', () => {
  it('renders inline math as KaTeX HTML', () => {
    let provider: monacoLanguages.HoverProvider | undefined
    const dispose = vi.fn()
    const monaco = {
      languages: {
        registerHoverProvider: vi.fn(
          (_language: string, registeredProvider: monacoLanguages.HoverProvider) => {
            provider = registeredProvider
            return { dispose }
          }
        )
      }
    } as unknown as typeof import('monaco-editor')

    const disposable = registerHoverProvider(monaco, {
      getLabels: () => [],
      getBibEntries: () => []
    })
    const model = {
      getLineContent: vi.fn(() => 'Energy is $E=mc^2$.')
    } as unknown as monacoEditor.ITextModel

    const hover = provider?.provideHover(
      model,
      { lineNumber: 1, column: 14 } as Position,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn()
      } as unknown as CancellationToken
    )

    expect(hover).toEqual(
      expect.objectContaining({
        contents: [
          expect.objectContaining({
            supportHtml: true,
            value: expect.stringContaining('class="katex"')
          })
        ]
      })
    )
    disposable.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
