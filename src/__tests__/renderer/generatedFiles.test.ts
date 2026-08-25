import { describe, expect, it } from 'vitest'
import {
  filterGeneratedDirectoryEntries,
  filterGeneratedProjectEntries
} from '../../renderer/services/generatedFiles'
import type { DirectoryEntry, ProjectIndexEntry } from '../../shared/types'

describe('generated LaTeX file filtering', () => {
  it('hides auxiliary files and a PDF matching a TeX root but keeps source PDFs', () => {
    const entries = [
      { name: 'main.tex', path: '/project/main.tex', type: 'file' },
      { name: 'main.aux', path: '/project/main.aux', type: 'file' },
      { name: 'main.pdf', path: '/project/main.pdf', type: 'file' },
      { name: 'figure.pdf', path: '/project/figure.pdf', type: 'file' },
      { name: 'figures', path: '/project/figures', type: 'directory' }
    ] satisfies DirectoryEntry[]

    expect(filterGeneratedDirectoryEntries(entries).map((entry) => entry.name)).toEqual([
      'main.tex',
      'figure.pdf',
      'figures'
    ])
  })

  it('filters the flat project index without removing directories', () => {
    const entries = [
      {
        name: 'main.tex',
        path: '/project/main.tex',
        relativePath: 'main.tex',
        parentRelativePath: '',
        type: 'file'
      },
      {
        name: 'main.synctex.gz',
        path: '/project/main.synctex.gz',
        relativePath: 'main.synctex.gz',
        parentRelativePath: '',
        type: 'file'
      },
      {
        name: 'chapters',
        path: '/project/chapters',
        relativePath: 'chapters',
        parentRelativePath: '',
        type: 'directory'
      }
    ] satisfies ProjectIndexEntry[]

    expect(filterGeneratedProjectEntries(entries).map((entry) => entry.name)).toEqual([
      'main.tex',
      'chapters'
    ])
  })
})
