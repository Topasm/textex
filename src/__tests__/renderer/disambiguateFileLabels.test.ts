import { describe, expect, it } from 'vitest'
import { disambiguateFileLabels } from '../../renderer/utils/path'

function labels(paths: string[]): string[] {
  const map = disambiguateFileLabels(paths)
  return paths.map((path) => map.get(path)!)
}

describe('disambiguateFileLabels', () => {
  it('keeps a bare basename when nothing collides', () => {
    expect(labels(['/p/main.tex', '/p/sections/intro.tex'])).toEqual(['main.tex', 'intro.tex'])
  })

  it('adds a parent segment only to the colliding labels', () => {
    expect(labels(['/p/sections/intro.tex', '/p/appendix/intro.tex', '/p/main.tex'])).toEqual([
      'sections/intro.tex',
      'appendix/intro.tex',
      'main.tex'
    ])
  })

  it('keeps extending until the labels are distinct', () => {
    expect(labels(['/p/a/chapters/intro.tex', '/p/b/chapters/intro.tex'])).toEqual([
      'a/chapters/intro.tex',
      'b/chapters/intro.tex'
    ])
  })

  it('handles Windows separators', () => {
    expect(labels(['C:\\p\\sections\\intro.tex', 'C:\\p\\appendix\\intro.tex'])).toEqual([
      'sections/intro.tex',
      'appendix/intro.tex'
    ])
  })

  it('stops instead of looping when a path cannot grow further', () => {
    // The same file listed twice can never be told apart; it must still return.
    expect(labels(['intro.tex', 'intro.tex'])).toEqual(['intro.tex', 'intro.tex'])
  })

  it('returns an empty map for no open files', () => {
    expect(disambiguateFileLabels([]).size).toBe(0)
  })
})
