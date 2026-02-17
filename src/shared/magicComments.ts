import path from 'path'

/**
 * Scans the first few lines of a TeX file for a magic comment
 * specifying the root file: `%! TeX root = ./main.tex`
 *
 * Returns the resolved absolute path to the root file, or
 * the original file path if no magic comment is found.
 */
export function findRootFile(content: string, currentFilePath: string): string {
  const lines = content.slice(0, 500).split('\n').slice(0, 5)
  const regex = /%!\s*TeX\s+root\s*=\s*(.*)/i

  for (const line of lines) {
    const match = line.match(regex)
    if (match) {
      const relativeRoot = match[1].trim().replace(/["']/g, '')
      if (!relativeRoot) continue
      return path.resolve(path.dirname(currentFilePath), relativeRoot)
    }
  }

  return currentFilePath
}
