import type { DirectoryEntry } from '../../shared/types'

interface TexCandidate {
  entry: DirectoryEntry
  depth: number
  order: number
}

export function isTexFilePath(filePath: string): boolean {
  return filePath.toLocaleLowerCase('en-US').endsWith('.tex')
}

/**
 * Chooses the document a project should show when there is no valid restored
 * session tab. Conventional root documents win, followed by other root-level
 * TeX files and finally the first nested TeX file in directory order.
 */
export function findDefaultTexFile(tree: DirectoryEntry[]): DirectoryEntry | null {
  const candidates: TexCandidate[] = []
  let order = 0

  const visit = (entries: DirectoryEntry[], depth: number): void => {
    for (const entry of entries) {
      if (entry.type === 'file' && isTexFilePath(entry.name)) {
        candidates.push({ entry, depth, order: order++ })
      }
      if (entry.type === 'directory' && entry.children) visit(entry.children, depth + 1)
    }
  }
  visit(tree, 0)

  const rank = ({ entry, depth }: TexCandidate): number => {
    const name = entry.name.toLocaleLowerCase('en-US')
    if (name === 'main.tex') return depth === 0 ? 0 : 2
    if (name === 'root.tex') return depth === 0 ? 1 : 3
    return depth === 0 ? 4 : 5
  }

  candidates.sort((left, right) => rank(left) - rank(right) || left.order - right.order)
  return candidates[0]?.entry ?? null
}
