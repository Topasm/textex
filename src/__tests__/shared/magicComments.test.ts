import { describe, it, expect } from 'vitest'
import path from 'path'
import { findRootFile } from '../../shared/magicComments'

describe('findRootFile', () => {
  it('returns current file when no magic comment found', () => {
    const content = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}'
    const currentFile = path.resolve('/project/main.tex')
    expect(findRootFile(content, currentFile)).toBe(currentFile)
  })

  it('parses standard magic comment', () => {
    const content = '%! TeX root = ./main.tex\n\\section{Chapter 1}'
    const currentFile = path.resolve('/project/chapters/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/chapters/main.tex'))
  })

  it('resolves parent directory reference', () => {
    const content = '%! TeX root = ../main.tex\n\\section{Chapter 1}'
    const currentFile = path.resolve('/project/chapters/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/main.tex'))
  })

  it('handles case-insensitive matching', () => {
    const content = '%! tex ROOT = ./main.tex\n\\section{Chapter 1}'
    const currentFile = path.resolve('/project/chapters/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/chapters/main.tex'))
  })

  it('handles quoted paths', () => {
    const content = '%! TeX root = "./main.tex"\n\\section{Chapter 1}'
    const currentFile = path.resolve('/project/chapters/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/chapters/main.tex'))
  })

  it('handles single-quoted paths', () => {
    const content = "%! TeX root = './main.tex'\n\\section{Chapter 1}"
    const currentFile = path.resolve('/project/chapters/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/chapters/main.tex'))
  })

  it('only checks first 5 lines', () => {
    const lines = ['line1', 'line2', 'line3', 'line4', 'line5', '%! TeX root = ./main.tex']
    const content = lines.join('\n')
    // The magic comment is on line 6, so it should NOT be found
    const currentFile = path.resolve('/project/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(currentFile)
  })

  it('finds magic comment on any of the first 5 lines', () => {
    const content = '% Some comment\n% Another comment\n%! TeX root = ../main.tex\n\\section{Intro}'
    const currentFile = path.resolve('/project/src/intro.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/main.tex'))
  })

  it('handles extra whitespace in magic comment', () => {
    const content = '%!   TeX   root   =   ./main.tex\n\\section{Chapter 1}'
    const currentFile = path.resolve('/project/chapters/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(path.resolve('/project/chapters/main.tex'))
  })

  it('returns current file for empty content', () => {
    const currentFile = path.resolve('/project/file.tex')
    expect(findRootFile('', currentFile)).toBe(currentFile)
  })

  it('skips empty root value', () => {
    const content = '%! TeX root = \n\\section{Chapter 1}'
    const currentFile = path.resolve('/project/chapter1.tex')
    expect(findRootFile(content, currentFile)).toBe(currentFile)
  })
})
