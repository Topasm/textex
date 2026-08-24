import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Monaco feature selection', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/data/monacoSetup.ts'), 'utf8')

  it('keeps the editor lazy chunk free of Monaco register.all', () => {
    expect(source).not.toContain("import 'monaco-editor/features/register.all'")
  })

  it.each([
    'codeEditor',
    'diffEditor',
    'find',
    'suggest',
    'snippet',
    'codeAction',
    'codelens',
    'hover',
    'folding',
    'format',
    'gotoSymbol',
    'quickCommand',
    'rename',
    'semanticTokens',
    'stickyScroll'
  ])('retains the %s feature used by TextEx', (feature) => {
    expect(source).toContain(`import 'monaco-editor/features/${feature}/register'`)
  })
})
