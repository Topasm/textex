import { describe, it, expect } from 'vitest'
import { findRootFile } from '../../shared/magicComments'

describe('findRootFile', () => {
  it('returns current file when no magic comment found', () => {
    const content = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}'
    expect(findRootFile(content, '/project/main.tex')).toBe('/project/main.tex')
  })

  it('parses standard magic comment', () => {
    const content = '%! TeX root = ./main.tex\n\\section{Chapter 1}'
    expect(findRootFile(content, '/project/chapters/chapter1.tex')).toBe('/project/chapters/main.tex')
  })

  it('resolves parent directory reference', () => {
    const content = '%! TeX root = ../main.tex\n\\section{Chapter 1}'
    expect(findRootFile(content, '/project/chapters/chapter1.tex')).toBe('/project/main.tex')
  })

  it('handles case-insensitive matching', () => {
    const content = '%! tex ROOT = ./main.tex\n\\section{Chapter 1}'
    expect(findRootFile(content, '/project/chapters/chapter1.tex')).toBe('/project/chapters/main.tex')
  })

  it('handles quoted paths', () => {
    const content = '%! TeX root = "./main.tex"\n\\section{Chapter 1}'
    expect(findRootFile(content, '/project/chapters/chapter1.tex')).toBe('/project/chapters/main.tex')
  })

  it('handles single-quoted paths', () => {
    const content = "%! TeX root = './main.tex'\n\\section{Chapter 1}"
    expect(findRootFile(content, '/project/chapters/chapter1.tex')).toBe('/project/chapters/main.tex')
  })

  it('only checks first 5 lines', () => {
    const lines = ['line1', 'line2', 'line3', 'line4', 'line5', '%! TeX root = ./main.tex']
    const content = lines.join('\n')
    // The magic comment is on line 6, so it should NOT be found
    expect(findRootFile(content, '/project/chapter1.tex')).toBe('/project/chapter1.tex')
  })

  it('finds magic comment on any of the first 5 lines', () => {
    const content = '% Some comment\n% Another comment\n%! TeX root = ../main.tex\n\\section{Intro}'
    expect(findRootFile(content, '/project/src/intro.tex')).toBe('/project/main.tex')
  })

  it('handles extra whitespace in magic comment', () => {
    const content = '%!   TeX   root   =   ./main.tex\n\\section{Chapter 1}'
    expect(findRootFile(content, '/project/chapters/chapter1.tex')).toBe('/project/chapters/main.tex')
  })

  it('returns current file for empty content', () => {
    expect(findRootFile('', '/project/file.tex')).toBe('/project/file.tex')
  })

  it('skips empty root value', () => {
    const content = '%! TeX root = \n\\section{Chapter 1}'
    expect(findRootFile(content, '/project/chapter1.tex')).toBe('/project/chapter1.tex')
  })
})
