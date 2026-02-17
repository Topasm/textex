import fs from 'fs/promises'
import path from 'path'
import { SectionLevel, SectionNode, DocumentMetadata, DocumentStructure, PaperInfo } from './types'

// --- Helpers ---

interface VirtualLine {
  text: string
  file: string
  lineNumber: number
}

/**
 * Extract a brace-delimited argument starting at the given position.
 * Handles nested braces and multi-line content.
 * Returns the content inside the outermost braces, or null if no opening brace found.
 */
function extractBracedArgument(lines: string[], startIdx: number, startCol: number): string | null {
  let depth = 0
  let started = false
  let result = ''

  for (let i = startIdx; i < lines.length; i++) {
    const line = i === startIdx ? lines[i].substring(startCol) : lines[i]
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      if (ch === '{') {
        if (!started) {
          started = true
          depth = 1
        } else {
          depth++
          result += ch
        }
      } else if (ch === '}') {
        depth--
        if (depth === 0) {
          return result
        }
        result += ch
      } else if (started) {
        result += ch
      }
    }
    if (started) {
      result += '\n'
    }
  }
  return started ? result : null
}

/**
 * Expand \input{} and \include{} directives recursively.
 * Returns a flat array of virtual lines mapping back to source files.
 */
async function expandFile(filePath: string, seen: Set<string>): Promise<VirtualLine[]> {
  const resolved = path.resolve(filePath)
  if (seen.has(resolved)) return [] // circular include guard
  seen.add(resolved)

  let content: string
  try {
    content = await fs.readFile(resolved, 'utf-8')
  } catch {
    return []
  }

  const lines = content.split('\n')
  const result: VirtualLine[] = []
  const dir = path.dirname(resolved)

  const includeRegex = /^(?!%)\s*\\(input|include)\s*\{([^}]+)\}/

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(includeRegex)
    if (match) {
      let includedPath = match[2].trim()
      // Auto-append .tex if no extension
      if (!path.extname(includedPath)) {
        includedPath += '.tex'
      }
      const fullPath = path.resolve(dir, includedPath)
      const childLines = await expandFile(fullPath, seen)
      result.push(...childLines)
    } else {
      result.push({ text: lines[i], file: resolved, lineNumber: i + 1 })
    }
  }

  return result
}

// --- Section heading matching ---

const HEADING_COMMANDS: Record<string, SectionLevel> = {
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3
}

interface HeadingMatch {
  level: SectionLevel
  starred: boolean
  title: string
  index: number // index into virtual lines
}

function findHeadings(virtualLines: VirtualLine[]): HeadingMatch[] {
  const headings: HeadingMatch[] = []
  // Build plain text lines for brace extraction
  const textLines = virtualLines.map((vl) => vl.text)

  for (let i = 0; i < virtualLines.length; i++) {
    const line = virtualLines[i].text
    // Skip commented lines
    if (/^\s*%/.test(line)) continue

    const match = line.match(
      /\\(chapter|section|subsection|subsubsection)(\*?)\s*(\[([^\]]*)\])?\s*(\{)?/
    )
    if (!match) continue

    const command = match[1]
    const starred = match[2] === '*'
    const level = HEADING_COMMANDS[command]

    let title: string
    if (match[5] === '{') {
      // Brace found on this line — extract from the opening brace position
      const bracePos = line.indexOf('{', match.index!)
      const extracted = extractBracedArgument(textLines, i, bracePos)
      title = extracted ?? ''
    } else if (match[4] !== undefined) {
      // Has optional [short title] but no brace yet — use short title
      title = match[4]
    } else {
      // Look for brace on the next line
      if (i + 1 < textLines.length) {
        const nextLine = textLines[i + 1]
        const braceIdx = nextLine.indexOf('{')
        if (braceIdx >= 0) {
          const extracted = extractBracedArgument(textLines, i + 1, braceIdx)
          title = extracted ?? ''
        } else {
          title = ''
        }
      } else {
        title = ''
      }
    }

    // Clean up the title: collapse whitespace, trim
    title = title.replace(/\s+/g, ' ').trim()

    headings.push({ level, starred, title, index: i })
  }

  return headings
}

// --- Tree building ---

function buildOutlineTree(
  headings: HeadingMatch[],
  virtualLines: VirtualLine[],
  totalLines: number
): SectionNode[] {
  // Assign end lines: each heading ends where the next same-or-higher-level heading starts, or at EOF
  const nodes: SectionNode[] = headings.map((h, idx) => {
    const vl = virtualLines[h.index]

    // Find end line: look for next heading at same or higher (lower number) level
    let endIndex = totalLines - 1
    for (let j = idx + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        endIndex = headings[j].index - 1
        break
      }
    }

    // Check for \end{document} between this heading and the computed end
    for (let j = h.index + 1; j <= endIndex && j < virtualLines.length; j++) {
      if (/\\end\s*\{document\}/.test(virtualLines[j].text)) {
        endIndex = j - 1
        break
      }
    }

    const endVl = virtualLines[Math.min(endIndex, virtualLines.length - 1)]

    return {
      title: h.title,
      level: h.level,
      starred: h.starred,
      file: vl.file,
      startLine: vl.lineNumber,
      endLine: endVl.lineNumber,
      children: []
    }
  })

  // Build tree using a stack
  const roots: SectionNode[] = []
  const stack: SectionNode[] = []

  for (const node of nodes) {
    // Pop stack until we find a parent with a lower level number
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node)
    } else {
      roots.push(node)
    }

    stack.push(node)
  }

  return roots
}

// --- Metadata extraction ---

function extractMetadata(virtualLines: VirtualLine[], mainFile: string): DocumentMetadata {
  const metadata: DocumentMetadata = {
    documentClass: '',
    documentClassOptions: [],
    title: null,
    author: null,
    date: null,
    abstract: null,
    packages: [],
    mainFile
  }

  const textLines = virtualLines.map((vl) => vl.text)
  let inAbstract = false
  const abstractLines: string[] = []

  for (let i = 0; i < virtualLines.length; i++) {
    const line = virtualLines[i].text

    // Skip commented lines
    if (/^\s*%/.test(line)) continue

    // documentclass
    const classMatch = line.match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/)
    if (classMatch) {
      metadata.documentClassOptions = classMatch[1]
        ? classMatch[1].split(',').map((s) => s.trim())
        : []
      metadata.documentClass = classMatch[2].trim()
    }

    // title
    const titleMatch = line.match(/\\title\s*(\{)/)
    if (titleMatch) {
      const bracePos = line.indexOf('{', titleMatch.index!)
      const extracted = extractBracedArgument(textLines, i, bracePos)
      if (extracted !== null) {
        metadata.title = extracted.replace(/\s+/g, ' ').trim()
      }
    }

    // author
    const authorMatch = line.match(/\\author\s*(\{)/)
    if (authorMatch) {
      const bracePos = line.indexOf('{', authorMatch.index!)
      const extracted = extractBracedArgument(textLines, i, bracePos)
      if (extracted !== null) {
        metadata.author = extracted.replace(/\s+/g, ' ').trim()
      }
    }

    // date
    const dateMatch = line.match(/\\date\s*(\{)/)
    if (dateMatch) {
      const bracePos = line.indexOf('{', dateMatch.index!)
      const extracted = extractBracedArgument(textLines, i, bracePos)
      if (extracted !== null) {
        metadata.date = extracted.replace(/\s+/g, ' ').trim()
      }
    }

    // abstract
    if (/\\begin\s*\{abstract\}/.test(line)) {
      inAbstract = true
      // Check if content starts on the same line after \begin{abstract}
      const afterBegin = line.replace(/.*\\begin\s*\{abstract\}/, '')
      if (afterBegin.trim()) {
        abstractLines.push(afterBegin.trim())
      }
      continue
    }
    if (/\\end\s*\{abstract\}/.test(line)) {
      inAbstract = false
      metadata.abstract = abstractLines.join('\n').trim()
      continue
    }
    if (inAbstract) {
      abstractLines.push(line)
      continue
    }

    // packages
    const pkgMatch = line.match(/\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)
    if (pkgMatch) {
      const pkgs = pkgMatch[1].split(',').map((s) => s.trim())
      metadata.packages.push(...pkgs)
    }
  }

  return metadata
}

/**
 * Parse outline from in-memory content string (no disk I/O for the main file).
 * Used by the editor UI for live outline updates.
 */
export function parseContentOutline(content: string, filePath: string): SectionNode[] {
  const lines = content.split('\n')
  const virtualLines: VirtualLine[] = lines.map((text, i) => ({
    text,
    file: filePath,
    lineNumber: i + 1
  }))
  const headings = findHeadings(virtualLines)
  return buildOutlineTree(headings, virtualLines, virtualLines.length)
}

// --- Public API ---

export async function parseDocumentStructure(filePath: string): Promise<DocumentStructure> {
  const resolved = path.resolve(filePath)
  const virtualLines = await expandFile(resolved, new Set())

  // Collect unique files
  const fileSet = new Set<string>()
  for (const vl of virtualLines) {
    fileSet.add(vl.file)
  }

  const metadata = extractMetadata(virtualLines, resolved)
  const headings = findHeadings(virtualLines)
  const outline = buildOutlineTree(headings, virtualLines, virtualLines.length)

  return {
    metadata,
    outline,
    files: Array.from(fileSet)
  }
}

export function resolveSectionPath(
  outline: SectionNode[],
  sectionPath: string
): SectionNode | null {
  const parts = sectionPath.split('/').map((s) => s.trim())
  let nodes = outline

  for (const part of parts) {
    const found = nodes.find((n) => n.title === part)
    if (!found) return null
    if (part === parts[parts.length - 1]) {
      return found
    }
    nodes = found.children
  }

  return null
}

export async function getSectionContent(
  filePath: string,
  sectionPath: string
): Promise<{ content: string; file: string; startLine: number; endLine: number }> {
  const structure = await parseDocumentStructure(filePath)
  const node = resolveSectionPath(structure.outline, sectionPath)

  if (!node) {
    throw new Error(`Section not found: ${sectionPath}`)
  }

  const fileContent = await fs.readFile(node.file, 'utf-8')
  const lines = fileContent.split('\n')

  // Content starts after the heading line, ends at endLine (1-indexed)
  const startIdx = node.startLine // 0-indexed: startLine is 1-indexed, content starts on next line
  const endIdx = node.endLine - 1 // 0-indexed inclusive
  const contentLines = lines.slice(startIdx, endIdx + 1)

  return {
    content: contentLines.join('\n'),
    file: node.file,
    startLine: node.startLine + 1,
    endLine: node.endLine
  }
}

export async function updateSectionContent(
  filePath: string,
  sectionPath: string,
  newContent: string
): Promise<{ file: string; startLine: number; endLine: number }> {
  const structure = await parseDocumentStructure(filePath)
  const node = resolveSectionPath(structure.outline, sectionPath)

  if (!node) {
    throw new Error(`Section not found: ${sectionPath}`)
  }

  const fileContent = await fs.readFile(node.file, 'utf-8')
  const lines = fileContent.split('\n')

  // Replace lines after the heading through endLine
  const startIdx = node.startLine // content starts after heading (0-indexed)
  const endIdx = node.endLine - 1 // 0-indexed inclusive

  const newLines = newContent.split('\n')
  lines.splice(startIdx, endIdx - startIdx + 1, ...newLines)

  await fs.writeFile(node.file, lines.join('\n'), 'utf-8')

  return {
    file: node.file,
    startLine: node.startLine + 1,
    endLine: node.startLine + newLines.length
  }
}

export async function listPapers(dirPath: string): Promise<PaperInfo[]> {
  const resolved = path.resolve(dirPath)
  const papers: PaperInfo[] = []

  async function scan(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip hidden dirs and common non-source dirs
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scan(fullPath)
        }
      } else if (entry.isFile() && entry.name.endsWith('.tex')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          const firstLines = content.split('\n').slice(0, 50).join('\n')
          const classMatch = firstLines.match(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)
          if (classMatch) {
            const titleMatch = content.match(/\\title\s*\{([^}]+)\}/)
            papers.push({
              mainFile: fullPath,
              title: titleMatch ? titleMatch[1].trim() : path.basename(fullPath, '.tex'),
              documentClass: classMatch[1].trim()
            })
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await scan(resolved)
  return papers
}
