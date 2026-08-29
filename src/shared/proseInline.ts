/**
 * Inline conversion between LaTeX prose and Markdown.
 *
 * Only a closed set of constructs is converted, and only where the reverse is
 * unambiguous. Everything else — citations, references, math, escaped
 * characters, unknown commands — is an *atom*: it passes through byte for byte
 * in both directions and is never re-serialized. That removes the whole class
 * of failures where editing a sentence corrupts the `\cite` sitting in it.
 *
 * `\textit` is deliberately absent. It and `\emph` would both project to
 * `*x*`, so converting it would silently rewrite one as the other on the way
 * back. A construct with no unique inverse stays an atom.
 */

/** `\textbf{x}` ⇄ `**x**`, and so on. Order matters: longest fence first. */
const CONVERTIBLE = [
  { command: 'textbf', fence: '**' },
  { command: 'texttt', fence: '`' },
  { command: 'emph', fence: '*' }
] as const

const COMMAND_BY_NAME = new Map(CONVERTIBLE.map((entry) => [entry.command as string, entry]))
const FENCES = [...CONVERTIBLE].sort((left, right) => right.fence.length - left.fence.length)

/** Markdown characters that would change meaning if left bare in a text run. */
const MARKDOWN_SPECIALS = /[\\*_`[\]]/gu

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIALS, (character) => `\\${character}`)
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\*_`[\]])/gu, '$1')
}

/**
 * Reads a balanced `{...}` group starting at `index`.
 * Returns the inner text and the index just past the closing brace.
 */
function readGroup(source: string, index: number): { inner: string; next: number } | null {
  if (source[index] !== '{') return null
  let depth = 0
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor]
    if (character === '\\') {
      cursor += 1
      continue
    }
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return { inner: source.slice(index + 1, cursor), next: cursor + 1 }
    }
  }
  return null
}

/** Consumes one LaTeX construct at `index`, returning its exact source text. */
function readLatexAtom(source: string, index: number): { text: string; next: number } | null {
  const character = source[index]

  if (character === '$') {
    const fence = source.startsWith('$$', index) ? '$$' : '$'
    const close = source.indexOf(fence, index + fence.length)
    if (close < 0) return { text: source.slice(index), next: source.length }
    return { text: source.slice(index, close + fence.length), next: close + fence.length }
  }

  if (character !== '\\') return null

  // `\(` … `\)` inline math.
  if (source.startsWith('\\(', index)) {
    const close = source.indexOf('\\)', index + 2)
    if (close < 0) return { text: source.slice(index), next: source.length }
    return { text: source.slice(index, close + 2), next: close + 2 }
  }

  const name = /^\\([a-zA-Z@]+)(\*?)/u.exec(source.slice(index))
  // An escaped character such as `\%` or `\&`.
  if (!name) return { text: source.slice(index, index + 2), next: index + 2 }

  // `\section*{…}` is a starred command; the `*` closing `*\cmd*` is Markdown
  // emphasis. A starred command is always followed by its argument, so the
  // star only belongs to the command when a bracket comes next. A star that
  // does not becomes an escaped literal in Markdown and round-trips as one.
  const afterStar = source[index + name[0].length]
  const starred = name[2] === '*' && (afterStar === '{' || afterStar === '[')
  let cursor = index + name[1].length + 1 + (starred ? 1 : 0)
  // Optional argument, then every braced argument that follows.
  if (source[cursor] === '[') {
    const close = source.indexOf(']', cursor)
    if (close >= 0) cursor = close + 1
  }
  for (;;) {
    const group = readGroup(source, cursor)
    if (!group) break
    cursor = group.next
  }
  return { text: source.slice(index, cursor), next: cursor }
}

/**
 * Projects a LaTeX prose run to Markdown.
 *
 * Plain text is escaped so Markdown syntax cannot appear by accident; atoms
 * are copied verbatim and are never escaped, so the LaTeX inside them survives
 * a round trip exactly.
 */
export function latexProseToMarkdown(latex: string): string {
  let out = ''
  let plain = ''
  let index = 0

  const flush = (): void => {
    if (plain) {
      out += escapeMarkdown(plain)
      plain = ''
    }
  }

  while (index < latex.length) {
    const character = latex[index]

    if (character === '\\') {
      const name = /^\\([a-zA-Z@]+)/u.exec(latex.slice(index))
      const convertible = name ? COMMAND_BY_NAME.get(name[1]) : undefined
      if (convertible) {
        const group = readGroup(latex, index + name![0].length)
        if (group) {
          flush()
          out += `${convertible.fence}${latexProseToMarkdown(group.inner)}${convertible.fence}`
          index = group.next
          continue
        }
      }
    }

    const atom = readLatexAtom(latex, index)
    if (atom) {
      flush()
      out += atom.text
      index = atom.next
      continue
    }

    plain += character
    index += 1
  }

  flush()
  return out
}

/** Reads a Markdown emphasis span, refusing to match across a LaTeX atom. */
function readFence(
  markdown: string,
  index: number
): { fence: string; inner: string; next: number } | null {
  for (const { fence } of FENCES) {
    if (!markdown.startsWith(fence, index)) continue
    let cursor = index + fence.length
    while (cursor < markdown.length) {
      if (markdown[cursor] === '\\' && cursor + 1 < markdown.length) {
        // Either a Markdown escape or the start of a LaTeX atom.
        const atom = readLatexAtom(markdown, cursor)
        if (atom && /^\\[a-zA-Z@]/u.test(atom.text)) {
          cursor = atom.next
          continue
        }
        cursor += 2
        continue
      }
      if (markdown.startsWith(fence, cursor)) {
        return {
          fence,
          inner: markdown.slice(index + fence.length, cursor),
          next: cursor + fence.length
        }
      }
      cursor += 1
    }
  }
  return null
}

/** Converts an edited Markdown prose run back to LaTeX. */
export function markdownProseToLatex(markdown: string): string {
  let out = ''
  let index = 0

  while (index < markdown.length) {
    const character = markdown[index]

    if (character === '\\' && index + 1 < markdown.length) {
      const atom = readLatexAtom(markdown, index)
      // A LaTeX command survives untouched; a Markdown escape loses its slash.
      if (atom && /^\\[a-zA-Z@]/u.test(atom.text)) {
        out += atom.text
        index = atom.next
        continue
      }
      const escaped = markdown[index + 1]
      if (/[\\*_`[\]]/u.test(escaped)) {
        out += escaped
        index += 2
        continue
      }
      out += markdown.slice(index, index + 2)
      index += 2
      continue
    }

    if (character === '$') {
      const atom = readLatexAtom(markdown, index)
      if (atom) {
        out += atom.text
        index = atom.next
        continue
      }
    }

    const span = readFence(markdown, index)
    if (span) {
      const command = FENCES.find((entry) => entry.fence === span.fence)!.command
      out += `\\${command}{${markdownProseToLatex(span.inner)}}`
      index = span.next
      continue
    }

    out += character
    index += 1
  }

  return out
}

/**
 * True when a line carries only LaTeX commands and no prose to edit.
 *
 * `\newcommand{\x}{y}`, `\setlength{...}{...}`, `\maketitle` — a declaration
 * has no sentence in it, so the prose view protects it instead of inviting an
 * edit. Deriving this from the atom reader covers commands nobody enumerated.
 */
export function isCommandOnlyLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || !trimmed.startsWith('\\')) return false

  let index = 0
  while (index < trimmed.length) {
    if (/\s/u.test(trimmed[index])) {
      index += 1
      continue
    }
    const atom = readLatexAtom(trimmed, index)
    if (!atom || atom.next === index) return false
    index = atom.next
  }
  return true
}

export { escapeMarkdown, unescapeMarkdown }
