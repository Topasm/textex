import { describe, expect, it } from 'vitest'
import { findDefaultTexFile, isTexFilePath } from '../../renderer/services/defaultTexFile'
import type { DirectoryEntry } from '../../shared/types'

describe('default TeX document selection', () => {
  it('prefers a root main file over earlier auxiliary and nested files', () => {
    const tree: DirectoryEntry[] = [
      { name: 'appendix.tex', path: '/paper/appendix.tex', type: 'file' },
      {
        name: 'chapters',
        path: '/paper/chapters',
        type: 'directory',
        children: [{ name: 'main.tex', path: '/paper/chapters/main.tex', type: 'file' }]
      },
      { name: 'MAIN.TEX', path: '/paper/MAIN.TEX', type: 'file' }
    ]

    expect(findDefaultTexFile(tree)?.path).toBe('/paper/MAIN.TEX')
  })

  it('uses a nested TeX file when the project root contains none', () => {
    const tree: DirectoryEntry[] = [
      {
        name: 'src',
        path: '/paper/src',
        type: 'directory',
        children: [{ name: 'paper.tex', path: '/paper/src/paper.tex', type: 'file' }]
      }
    ]

    expect(findDefaultTexFile(tree)?.path).toBe('/paper/src/paper.tex')
    expect(isTexFilePath('/paper/src/PAPER.TEX')).toBe(true)
  })

  it('prefers a nested conventional root document over a root-level auxiliary tex file', () => {
    const tree: DirectoryEntry[] = [
      { name: 'appendix.tex', path: '/paper/appendix.tex', type: 'file' },
      {
        name: 'src',
        path: '/paper/src',
        type: 'directory',
        children: [{ name: 'main.tex', path: '/paper/src/main.tex', type: 'file' }]
      }
    ]

    expect(findDefaultTexFile(tree)?.path).toBe('/paper/src/main.tex')
  })
})
