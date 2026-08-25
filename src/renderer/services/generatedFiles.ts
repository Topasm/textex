import type { DirectoryEntry, ProjectIndexEntry } from '../../shared/types'

const GENERATED_SUFFIXES = [
  '.aux',
  '.bbl',
  '.bcf',
  '.blg',
  '.dvi',
  '.fdb_latexmk',
  '.fls',
  '.idx',
  '.ilg',
  '.ind',
  '.lof',
  '.log',
  '.lot',
  '.nav',
  '.out',
  '.run.xml',
  '.snm',
  '.synctex',
  '.synctex.gz',
  '.toc',
  '.vrb',
  '.xdv'
]

function normalized(value: string): string {
  return value.replace(/\\/g, '/').toLocaleLowerCase('en-US')
}

function isGeneratedName(
  name: string,
  siblingPaths: ReadonlySet<string>,
  fullPath: string
): boolean {
  const lower = normalized(name)
  if (GENERATED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true
  return lower.endsWith('.pdf') && siblingPaths.has(normalized(fullPath).replace(/\.pdf$/, '.tex'))
}

export function filterGeneratedProjectEntries(entries: ProjectIndexEntry[]): ProjectIndexEntry[] {
  const paths = new Set(entries.map((entry) => normalized(entry.relativePath)))
  return entries.filter(
    (entry) => entry.type === 'directory' || !isGeneratedName(entry.name, paths, entry.relativePath)
  )
}

export function filterGeneratedDirectoryEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  const paths = new Set(entries.map((entry) => normalized(entry.path)))
  return entries.filter(
    (entry) => entry.type === 'directory' || !isGeneratedName(entry.name, paths, entry.path)
  )
}
