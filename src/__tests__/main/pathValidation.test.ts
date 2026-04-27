import path from 'path'
import { describe, expect, it } from 'vitest'
import { normalizeSafeRelativePath, resolveInsideDirectory } from '../../main/utils/pathValidation'

describe('path validation helpers', () => {
  it('normalizes safe archive paths to portable relative paths', () => {
    expect(normalizeSafeRelativePath('chapters\\intro.tex')).toBe('chapters/intro.tex')
    expect(resolveInsideDirectory('/tmp/project', 'chapters/intro.tex')).toBe(
      path.join('/tmp/project', 'chapters', 'intro.tex')
    )
  })

  it('rejects traversal and absolute archive paths', () => {
    expect(() => normalizeSafeRelativePath('../escape.tex')).toThrow()
    expect(() => normalizeSafeRelativePath('chapters/../../escape.tex')).toThrow()
    expect(() => normalizeSafeRelativePath('/tmp/escape.tex')).toThrow()
    expect(() => normalizeSafeRelativePath('C:\\tmp\\escape.tex')).toThrow()
    expect(() => normalizeSafeRelativePath('\\\\server\\share\\escape.tex')).toThrow()
  })

  it('does not resolve paths outside the base directory', () => {
    expect(() => resolveInsideDirectory('/tmp/project', '../escape.tex')).toThrow()
  })
})
