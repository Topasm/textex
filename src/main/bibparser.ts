import fs from 'fs/promises'
import path from 'path'

export interface BibEntry {
  key: string
  type: string
  title: string
  author: string
  year: string
  journal?: string
  file?: string
  line?: number
}

function extractField(block: string, field: string): string {
  const regex = new RegExp(`${field}\\s*=\\s*[{"]([^}"]*)[}"]`, 'i')
  const match = block.match(regex)
  return match ? match[1].trim() : ''
}

export function parseBibContent(content: string, filePath?: string): BibEntry[] {
  const entries: BibEntry[] = []
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*)/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase()
    const key = match[2].trim()
    const block = match[3]

    if (type === 'comment' || type === 'string' || type === 'preamble') continue

    // Calculate line number of the entry start
    const beforeMatch = content.substring(0, match.index)
    const line = beforeMatch.split('\n').length

    entries.push({
      key,
      type,
      title: extractField(block, 'title'),
      author: extractField(block, 'author'),
      year: extractField(block, 'year'),
      journal: extractField(block, 'journal') || undefined,
      file: filePath,
      line
    })
  }

  return entries
}

export async function parseBibFile(filePath: string): Promise<BibEntry[]> {
  const content = await fs.readFile(filePath, 'utf-8')
  return parseBibContent(content, filePath)
}

export async function findBibFilesInProject(projectRoot: string): Promise<BibEntry[]> {
  const allEntries: BibEntry[] = []
  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true, recursive: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.bib')) {
        const fullPath = path.join(entry.parentPath || projectRoot, entry.name)
        try {
          const bibEntries = await parseBibFile(fullPath)
          allEntries.push(...bibEntries)
        } catch {
          // skip unreadable bib files
        }
      }
    }
  } catch {
    // project root not readable
  }
  return allEntries
}
