import type { SectionLevel, SectionNode } from './types'

interface ContentLine {
  text: string
  file: string
  lineNumber: number
}

interface Heading {
  level: SectionLevel
  starred: boolean
  title: string
  index: number
}

interface IndexedSectionNode extends SectionNode {
  sourceIndex: number
}

const HEADING_LEVELS: Record<string, SectionLevel> = {
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3
}

const FRONT_MATTER_TITLES: Record<string, string> = {
  abstract: 'Abstract',
  keyword: 'Keywords',
  keywords: 'Keywords',
  acknowledgements: 'Acknowledgements',
  acknowledgments: 'Acknowledgments'
}

function extractBracedArgument(
  lines: string[],
  startLine: number,
  startColumn: number
): string | null {
  let depth = 0
  let started = false
  let result = ''

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex++) {
    const line =
      lineIndex === startLine ? lines[lineIndex].substring(startColumn) : lines[lineIndex]
    for (const character of line) {
      if (character === '{') {
        if (started) {
          depth++
          result += character
        } else {
          started = true
          depth = 1
        }
      } else if (character === '}') {
        depth--
        if (depth === 0) return result
        result += character
      } else if (started) {
        result += character
      }
    }
    if (started) result += '\n'
  }

  return started ? result : null
}

function findHeadings(lines: ContentLine[]): Heading[] {
  const headings: Heading[] = []
  const textLines = lines.map((line) => line.text)

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].text
    if (/^\s*%/.test(line)) continue
    const match = line.match(
      /\\(chapter|section|subsection|subsubsection)(\*?)\s*(\[([^\]]*)\])?\s*(\{)?/
    )
    if (!match) continue

    let title = ''
    if (match[5] === '{') {
      title = extractBracedArgument(textLines, index, line.indexOf('{', match.index)) ?? ''
    } else if (match[4] !== undefined) {
      title = match[4]
    } else if (index + 1 < textLines.length) {
      const braceIndex = textLines[index + 1].indexOf('{')
      if (braceIndex >= 0) {
        title = extractBracedArgument(textLines, index + 1, braceIndex) ?? ''
      }
    }

    headings.push({
      level: HEADING_LEVELS[match[1]],
      starred: match[2] === '*',
      title: title.replace(/\s+/g, ' ').trim(),
      index
    })
  }

  return headings
}

function buildSectionTree(headings: Heading[], lines: ContentLine[]): IndexedSectionNode[] {
  const nodes = headings.map((heading, headingIndex): IndexedSectionNode => {
    let endIndex = lines.length - 1
    for (let index = headingIndex + 1; index < headings.length; index++) {
      if (headings[index].level <= heading.level) {
        endIndex = headings[index].index - 1
        break
      }
    }
    for (let index = heading.index + 1; index <= endIndex && index < lines.length; index++) {
      if (/\\end\s*\{document\}/.test(lines[index].text)) {
        endIndex = index - 1
        break
      }
    }

    const start = lines[heading.index]
    const end = lines[Math.min(endIndex, lines.length - 1)]
    return {
      title: heading.title,
      level: heading.level,
      starred: heading.starred,
      file: start.file,
      startLine: start.lineNumber,
      endLine: end.lineNumber,
      semanticKind: 'section',
      sourceIndex: heading.index,
      children: []
    }
  })

  const roots: IndexedSectionNode[] = []
  const stack: IndexedSectionNode[] = []
  for (const node of nodes) {
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length > 0) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

function isTopLevelEnvironment(stack: string[]): boolean {
  return stack.length === 0 || (stack.length === 1 && stack[0] === 'document')
}

function findFrontMatter(lines: ContentLine[], stopIndex: number): IndexedSectionNode[] {
  const nodes: IndexedSectionNode[] = []
  const environmentStack: string[] = []
  let active: { name: string; title: string; startIndex: number } | null = null

  for (let index = 0; index < Math.min(stopIndex, lines.length); index++) {
    const line = lines[index].text.replace(/(^|[^\\])%.*/, '$1')
    for (const token of line.matchAll(/\\(begin|end)\s*\{([^}]+)\}/g)) {
      const kind = token[1]
      const name = token[2].trim().toLowerCase()
      if (kind === 'begin') {
        const parents = environmentStack.slice()
        environmentStack.push(name)
        if (!active && isTopLevelEnvironment(parents) && FRONT_MATTER_TITLES[name]) {
          active = { name, title: FRONT_MATTER_TITLES[name], startIndex: index }
        }
        continue
      }

      const stackIndex = environmentStack.lastIndexOf(name)
      if (stackIndex === -1) continue
      const parents = environmentStack.slice(0, stackIndex)
      environmentStack.splice(stackIndex, 1)
      if (active?.name !== name || !isTopLevelEnvironment(parents)) continue

      const start = lines[active.startIndex]
      nodes.push({
        title: active.title,
        level: 1,
        starred: false,
        file: start.file,
        startLine: start.lineNumber,
        endLine: lines[index].lineNumber,
        semanticKind: 'frontmatter',
        sourceIndex: active.startIndex,
        children: []
      })
      active = null
    }
  }

  return nodes
}

/** Browser-safe live outline parser. It performs no filesystem or Node.js access. */
export function parseContentOutline(content: string, filePath: string): SectionNode[] {
  const lines: ContentLine[] = content.split('\n').map((text, index) => ({
    text,
    file: filePath,
    lineNumber: index + 1
  }))
  const headings = findHeadings(lines)
  const nodes = [
    ...findFrontMatter(lines, headings[0]?.index ?? lines.length),
    ...buildSectionTree(headings, lines)
  ]
  return nodes.sort((left, right) => left.sourceIndex - right.sourceIndex)
}
