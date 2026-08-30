export type MarkdownInlineFormat = 'strong' | 'emphasis' | 'code'

export interface MarkdownSelectionEdit {
  text: string
  selectionStart: number
  selectionEnd: number
}

const FORMAT_FENCE: Record<MarkdownInlineFormat, string> = {
  strong: '**',
  emphasis: '*',
  code: '`'
}

function adjacentStars(text: string, fromEnd: boolean): number {
  let count = 0
  if (fromEnd) {
    for (let index = text.length - 1; index >= 0 && text[index] === '*'; index -= 1) count += 1
  } else {
    for (let index = 0; index < text.length && text[index] === '*'; index += 1) count += 1
  }
  return count
}

function hasFormatFence(before: string, after: string, format: MarkdownInlineFormat): boolean {
  if (format === 'code') return before.endsWith('`') && after.startsWith('`')
  const left = adjacentStars(before, true)
  const right = adjacentStars(after, false)
  if (format === 'strong') return left >= 2 && right >= 2
  // One star is emphasis; three are strong + emphasis. Two are only strong.
  return left % 2 === 1 && right % 2 === 1
}

/**
 * Applies, or removes, the small inline subset the TeX prose projection can
 * round-trip without guessing. Keeping this pure makes toolbar and keyboard
 * formatting share exactly the same selection behaviour.
 */
export function editMarkdownSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: MarkdownInlineFormat
): MarkdownSelectionEdit {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length))
  const end = Math.max(start, Math.min(Math.max(selectionStart, selectionEnd), text.length))
  const fence = FORMAT_FENCE[format]
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  if (hasFormatFence(before, after, format)) {
    const nextBefore = before.slice(0, -fence.length)
    return {
      text: `${nextBefore}${selected}${after.slice(fence.length)}`,
      selectionStart: start - fence.length,
      selectionEnd: end - fence.length
    }
  }

  return {
    text: `${before}${fence}${selected}${fence}${after}`,
    selectionStart: start + fence.length,
    selectionEnd: end + fence.length
  }
}

export function isMarkdownSelectionFormatted(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: MarkdownInlineFormat
): boolean {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length))
  const end = Math.max(start, Math.min(Math.max(selectionStart, selectionEnd), text.length))
  return hasFormatFence(text.slice(0, start), text.slice(end), format)
}

/** A compact document statistic, matching what writing-focused status bars expose. */
export function proseDocumentStats(markdown: string): { words: number; lines: number } {
  const trimmed = markdown.trim()
  return {
    words: trimmed ? trimmed.split(/\s+/u).length : 0,
    lines: markdown.length > 0 ? markdown.split('\n').length : 0
  }
}

/** Best-effort first visible line for a native textarea. */
export function textareaVisibleLine(area: HTMLTextAreaElement): number {
  const lineCount = Math.max(1, area.value.split('\n').length)
  const computed = window.getComputedStyle(area)
  let declaredLineHeight = Number.parseFloat(computed.lineHeight)
  const fontSize = Number.parseFloat(computed.fontSize)
  // WebKit resolves unitless line-height to pixels, while jsdom and a few
  // embedded engines can preserve the multiplier.
  if (declaredLineHeight > 0 && declaredLineHeight < 4 && fontSize > 0) {
    declaredLineHeight *= fontSize
  }
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0
  const measuredLineHeight = area.scrollHeight / lineCount
  const lineHeight =
    Number.isFinite(declaredLineHeight) && declaredLineHeight > 0
      ? declaredLineHeight
      : Math.max(1, measuredLineHeight)
  const contentScrollTop = Math.max(0, area.scrollTop - paddingTop)
  return Math.max(1, Math.min(lineCount, Math.floor(contentScrollTop / lineHeight) + 1))
}
