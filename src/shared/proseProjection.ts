import { isCommandOnlyLine, latexProseToMarkdown } from './proseInline'

/**
 * A LaTeX document projected as an editable prose outline.
 *
 * There is no second file and no whole-document conversion. The `.tex` stays
 * the only store; this splits it into blocks that each remember the exact line
 * range they came from, so an edit in the prose view rewrites only that range
 * and every construct the projector does not understand survives untouched.
 *
 * Anything outside the closed set of convertible constructs is protected or
 * hidden rather than re-serialized — that is what makes the round trip safe.
 */

export type ProseBlockKind =
  /** Preamble and postamble. Never shown, never rewritten. */
  | 'boundary'
  /** `\section{…}` and friends, plus the `abstract` environment. */
  | 'heading'
  /** A paragraph the author may edit. */
  | 'prose'
  /** Math, floats, environments, `\input` — shown as a card, edited in TeX. */
  | 'protected'
  /** `\label`, comments. Kept in the source, absent from the view. */
  | 'hidden'
  /** A run of empty lines: a paragraph separator that still occupies source. */
  | 'blank'

export interface ProseTitleRange {
  /** 1-based line, and the columns bounding the title inside `{…}`. */
  line: number
  startColumn: number
  endColumn: number
}

export interface ProseBlock {
  kind: ProseBlockKind
  /** 1-based inclusive line range in the source document. */
  startLine: number
  endLine: number
  /** The exact source text of that range. */
  source: string
  /** What the prose view shows. Empty for `boundary` and `hidden`. */
  markdown: string
  /** Heading depth, 1 = `\section`, matching the Markdown `##` shown. */
  level?: number
  title?: string
  /**
   * Where the title sits, when it is on one line. A heading whose argument
   * wraps has no range, and its title is read-only rather than guessed at.
   */
  titleRange?: ProseTitleRange
  /** What a protected block holds, for its placeholder card. */
  protectedLabel?: string
}

export interface ProseDocument {
  blocks: ProseBlock[]
  /** False when the file has no `\begin{document}`; the view stays closed. */
  hasBody: boolean
}

const HEADING_LEVELS: Record<string, number> = {
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3
}

const HEADING_PATTERN =
  /^\s*\\(chapter|section|subsection|subsubsection)(\*?)\s*(\[[^\]]*\])?\s*\{/u
const LABEL_ONLY = /^\s*\\label\s*\{[^}]*\}\s*$/u
const COMMENT_ONLY = /^\s*%/u
const ENVIRONMENT_START = /^\s*\\begin\s*\{([^}]+)\}/u
const DISPLAY_MATH_START = /^\s*(\\\[|\$\$)/u
const INCLUDE_ONLY = /^\s*\\(input|include|includeonly|bibliography|printbibliography)\b/u

/** Environments whose body is ordinary prose rather than a protected block. */
const PROSE_ENVIRONMENTS = new Set(['abstract'])

function findClosingBrace(line: string, openIndex: number): number {
  let depth = 0
  for (let index = openIndex; index < line.length; index += 1) {
    const character = line[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function environmentEnd(lines: string[], startIndex: number, name: string): number {
  const open = new RegExp(`\\\\begin\\s*\\{${name.replace(/[*]/gu, '\\*')}\\}`, 'u')
  const close = new RegExp(`\\\\end\\s*\\{${name.replace(/[*]/gu, '\\*')}\\}`, 'u')
  let depth = 0
  for (let index = startIndex; index < lines.length; index += 1) {
    if (open.test(lines[index])) depth += 1
    if (close.test(lines[index])) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return lines.length - 1
}

function displayMathEnd(lines: string[], startIndex: number, opener: string): number {
  const closer = opener === '$$' ? '$$' : '\\]'
  if (lines[startIndex].indexOf(closer, lines[startIndex].indexOf(opener) + opener.length) >= 0) {
    return startIndex
  }
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].includes(closer)) return index
  }
  return lines.length - 1
}

function block(
  kind: ProseBlockKind,
  lines: string[],
  startIndex: number,
  endIndex: number,
  extra: Partial<ProseBlock> = {}
): ProseBlock {
  return {
    kind,
    startLine: startIndex + 1,
    endLine: endIndex + 1,
    source: lines.slice(startIndex, endIndex + 1).join('\n'),
    markdown: '',
    ...extra
  }
}

function headingBlock(lines: string[], index: number): ProseBlock {
  const line = lines[index]
  const match = HEADING_PATTERN.exec(line)!
  const level = HEADING_LEVELS[match[1]]
  const openIndex = line.indexOf('{', match[0].length - 1)
  const closeIndex = findClosingBrace(line, openIndex)

  // A heading whose argument wraps stays read-only rather than half-parsed.
  if (closeIndex < 0) {
    const endIndex = environmentEndOfWrappedHeading(lines, index)
    return block('heading', lines, index, endIndex, {
      level,
      title: '',
      markdown: `${'#'.repeat(level + 1)} `
    })
  }

  const title = line.slice(openIndex + 1, closeIndex)
  return block('heading', lines, index, index, {
    level,
    title,
    markdown: `${'#'.repeat(level + 1)} ${latexProseToMarkdown(title)}`,
    titleRange: {
      line: index + 1,
      // Monaco columns are 1-based and exclusive at the end.
      startColumn: openIndex + 2,
      endColumn: closeIndex + 1
    }
  })
}

function environmentEndOfWrappedHeading(lines: string[], index: number): number {
  let depth = 0
  for (let cursor = index; cursor < lines.length; cursor += 1) {
    for (const character of lines[cursor]) {
      if (character === '{') depth += 1
      else if (character === '}') {
        depth -= 1
        if (depth === 0) return cursor
      }
    }
  }
  return index
}

export function projectLatexToProse(latex: string): ProseDocument {
  const lines = latex.split('\n')
  const beginIndex = lines.findIndex((line) => /\\begin\s*\{document\}/u.test(line))
  if (beginIndex < 0) return { blocks: [], hasBody: false }

  const endIndexRaw = lines.findIndex((line) => /\\end\s*\{document\}/u.test(line))
  const endIndex = endIndexRaw < 0 ? lines.length : endIndexRaw

  const blocks: ProseBlock[] = [block('boundary', lines, 0, beginIndex)]

  let index = beginIndex + 1
  let proseStart = -1

  const flushProse = (endAt: number): void => {
    if (proseStart < 0) return
    const source = lines.slice(proseStart, endAt + 1).join('\n')
    blocks.push(
      block('prose', lines, proseStart, endAt, {
        markdown: latexProseToMarkdown(source)
      })
    )
    proseStart = -1
  }

  while (index < endIndex) {
    const line = lines[index]

    if (line.trim() === '') {
      // Blank runs separate paragraphs. They are still part of the source, so
      // they get a block of their own — the projection has to cover every line
      // for an unedited document to reassemble byte for byte.
      flushProse(index - 1)
      let blankEnd = index
      while (blankEnd + 1 < endIndex && lines[blankEnd + 1].trim() === '') blankEnd += 1
      blocks.push(block('blank', lines, index, blankEnd))
      index = blankEnd + 1
      continue
    }

    if (COMMENT_ONLY.test(line) || LABEL_ONLY.test(line)) {
      flushProse(index - 1)
      blocks.push(block('hidden', lines, index, index))
      index += 1
      continue
    }

    if (HEADING_PATTERN.test(line)) {
      flushProse(index - 1)
      const heading = headingBlock(lines, index)
      blocks.push(heading)
      index = heading.endLine
      continue
    }

    if (INCLUDE_ONLY.test(line)) {
      flushProse(index - 1)
      blocks.push(
        block('protected', lines, index, index, {
          markdown: line.trim(),
          protectedLabel: 'include'
        })
      )
      index += 1
      continue
    }

    const environment = ENVIRONMENT_START.exec(line)
    if (environment) {
      flushProse(index - 1)
      const name = environment[1]
      const closeIndex = environmentEnd(lines, index, name)

      if (PROSE_ENVIRONMENTS.has(name)) {
        // `\begin{abstract}` reads as a heading; its body is ordinary prose.
        blocks.push(
          block('heading', lines, index, index, {
            level: 1,
            title: name.charAt(0).toUpperCase() + name.slice(1),
            markdown: `## ${name.charAt(0).toUpperCase() + name.slice(1)}`
          })
        )
        index += 1
        continue
      }

      blocks.push(
        block('protected', lines, index, closeIndex, {
          markdown: lines.slice(index, closeIndex + 1).join('\n'),
          protectedLabel: name
        })
      )
      index = closeIndex + 1
      continue
    }

    if (/^\s*\\end\s*\{(abstract)\}/u.test(line)) {
      flushProse(index - 1)
      blocks.push(block('hidden', lines, index, index))
      index += 1
      continue
    }

    const displayMath = DISPLAY_MATH_START.exec(line)
    if (displayMath) {
      flushProse(index - 1)
      const closeIndex = displayMathEnd(lines, index, displayMath[1])
      blocks.push(
        block('protected', lines, index, closeIndex, {
          markdown: lines.slice(index, closeIndex + 1).join('\n'),
          protectedLabel: 'math'
        })
      )
      index = closeIndex + 1
      continue
    }

    // A line of pure declarations has no sentence to edit. Protecting it keeps
    // macro definitions and layout commands out of an editable paragraph.
    if (isCommandOnlyLine(line)) {
      flushProse(index - 1)
      blocks.push(
        block('protected', lines, index, index, {
          markdown: line.trim(),
          protectedLabel: 'declaration'
        })
      )
      index += 1
      continue
    }

    if (proseStart < 0) proseStart = index
    index += 1
  }

  flushProse(endIndex - 1)
  if (endIndexRaw >= 0) blocks.push(block('boundary', lines, endIndexRaw, lines.length - 1))

  return { blocks, hasBody: true }
}

/** The blocks the prose view lets the author type into. */
export function isEditableProseBlock(block: ProseBlock): boolean {
  return block.kind === 'prose' || (block.kind === 'heading' && block.titleRange !== undefined)
}
