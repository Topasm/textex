/**
 * Inline tokens for rendering projected prose.
 *
 * The prose preview renders from these rather than from a Markdown parser: the
 * projection already produced a known, closed subset, and the LaTeX atoms it
 * preserved carry meaning a Markdown parser would flatten into plain text. A
 * citation stays a citation, so the preview can show it as a chip.
 */

export type ProseToken =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'emphasis' | 'code'; children: ProseToken[] }
  /** `\cite{a,b}` — the keys, so the preview can show them as chips. */
  | { kind: 'citation'; keys: string[]; source: string }
  /** `\ref`, `\eqref`, `\cref` and friends. */
  | { kind: 'reference'; target: string; source: string }
  /** Inline math, TeX body without its delimiters. */
  | { kind: 'math'; tex: string; source: string }
  /** A LaTeX construct with no richer presentation. */
  | { kind: 'raw'; source: string }

const FENCES = [
  { fence: '**', kind: 'strong' as const },
  { fence: '`', kind: 'code' as const },
  { fence: '*', kind: 'emphasis' as const }
]

const CITE = /^\\(?:cite[a-zA-Z]*|parencite|textcite|autocite)\s*(?:\[[^\]]*\])*\{([^}]*)\}/u
const REF = /^\\(?:ref|eqref|cref|Cref|autoref|pageref|nameref)\s*\{([^}]*)\}/u

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

/** Consumes one LaTeX construct and classifies what the preview should show. */
function readLatex(markdown: string, index: number): { token: ProseToken; next: number } | null {
  const rest = markdown.slice(index)

  if (markdown[index] === '$') {
    const fence = rest.startsWith('$$') ? '$$' : '$'
    const close = markdown.indexOf(fence, index + fence.length)
    if (close < 0) return null
    const source = markdown.slice(index, close + fence.length)
    return {
      token: { kind: 'math', tex: source.slice(fence.length, -fence.length), source },
      next: close + fence.length
    }
  }

  if (markdown[index] !== '\\') return null

  if (rest.startsWith('\\(')) {
    const close = markdown.indexOf('\\)', index + 2)
    if (close < 0) return null
    const source = markdown.slice(index, close + 2)
    return { token: { kind: 'math', tex: source.slice(2, -2), source }, next: close + 2 }
  }

  const cite = CITE.exec(rest)
  if (cite) {
    const keys = cite[1]
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
    return { token: { kind: 'citation', keys, source: cite[0] }, next: index + cite[0].length }
  }

  const reference = REF.exec(rest)
  if (reference) {
    return {
      token: { kind: 'reference', target: reference[1].trim(), source: reference[0] },
      next: index + reference[0].length
    }
  }

  const name = /^\\([a-zA-Z@]+)(\*?)/u.exec(rest)
  if (!name) return { token: { kind: 'raw', source: rest.slice(0, 2) }, next: index + 2 }

  // See `proseInline`: a command's own star is always followed by its argument.
  const afterStar = rest[name[0].length]
  const starred = name[2] === '*' && (afterStar === '{' || afterStar === '[')
  let cursor = index + name[1].length + 1 + (starred ? 1 : 0)
  if (markdown[cursor] === '[') {
    const close = markdown.indexOf(']', cursor)
    if (close >= 0) cursor = close + 1
  }
  for (;;) {
    const group = readGroup(markdown, cursor)
    if (!group) break
    cursor = group.next
  }
  return { token: { kind: 'raw', source: markdown.slice(index, cursor) }, next: cursor }
}

function readFence(
  markdown: string,
  index: number
): { kind: 'strong' | 'emphasis' | 'code'; inner: string; next: number } | null {
  for (const { fence, kind } of FENCES) {
    if (!markdown.startsWith(fence, index)) continue
    let cursor = index + fence.length
    while (cursor < markdown.length) {
      if (markdown[cursor] === '\\') {
        const latex = readLatex(markdown, cursor)
        if (latex && /^\\[a-zA-Z@]/u.test(markdown.slice(cursor))) {
          cursor = latex.next
          continue
        }
        cursor += 2
        continue
      }
      if (markdown.startsWith(fence, cursor)) {
        return {
          kind,
          inner: markdown.slice(index + fence.length, cursor),
          next: cursor + fence.length
        }
      }
      cursor += 1
    }
  }
  return null
}

/** Splits one projected prose run into tokens the preview can render. */
export function tokenizeProse(markdown: string): ProseToken[] {
  const tokens: ProseToken[] = []
  let plain = ''
  let index = 0

  const flush = (): void => {
    if (!plain) return
    tokens.push({ kind: 'text', text: plain })
    plain = ''
  }

  while (index < markdown.length) {
    const character = markdown[index]

    // A Markdown escape is a literal character, never a fence.
    if (character === '\\' && /[\\*_`[\]]/u.test(markdown[index + 1] ?? '')) {
      plain += markdown[index + 1]
      index += 2
      continue
    }

    if (character === '\\' || character === '$') {
      const latex = readLatex(markdown, index)
      if (latex) {
        flush()
        tokens.push(latex.token)
        index = latex.next
        continue
      }
    }

    const span = readFence(markdown, index)
    if (span) {
      flush()
      tokens.push({ kind: span.kind, children: tokenizeProse(span.inner) })
      index = span.next
      continue
    }

    plain += character
    index += 1
  }

  flush()
  return tokens
}

/** Plain text for an alt attribute or an accessible name. */
export function proseTokensToText(tokens: readonly ProseToken[]): string {
  return tokens
    .map((token) => {
      switch (token.kind) {
        case 'text':
          return token.text
        case 'strong':
        case 'emphasis':
        case 'code':
          return proseTokensToText(token.children)
        case 'citation':
          return token.keys.join(', ')
        case 'reference':
          return token.target
        case 'math':
          return token.tex
        case 'raw':
          return ''
      }
    })
    .join('')
}
