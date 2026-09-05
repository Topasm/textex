export interface PdfTextItem {
  str: string
  hasEOL?: boolean
}
export interface PdfPageText {
  text: string
  spans: Array<{ start: number; end: number; text: string }>
}
export interface PdfSearchMatch {
  page: number
  segments: Array<{ span: number; start: number; end: number; text: string }>
}

export function buildPdfPageText(items: readonly PdfTextItem[]): PdfPageText {
  let text = ''
  const spans: PdfPageText['spans'] = []
  for (const item of items) {
    if (item.str)
      spans.push({ start: text.length, end: text.length + item.str.length, text: item.str })
    text += item.str
    if (item.hasEOL) text += '\n'
  }
  return { text, spans }
}

/** Preserve UTF-16 source offsets through ligatures, case folding and line breaks. */
function normalize(value: string) {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const character of value) {
    for (const normalized of character.normalize('NFKD').toLowerCase()) {
      const part = /\s/u.test(normalized) ? ' ' : normalized
      if (part === ' ' && text.endsWith(' ')) {
        ends[ends.length - 1] = offset + character.length
        continue
      }
      text += part
      for (let unit = 0; unit < part.length; unit++) {
        starts.push(offset)
        ends.push(offset + character.length)
      }
    }
    offset += character.length
  }
  return { text, starts, ends }
}

export function findPdfTextMatches(
  page: PdfPageText,
  query: string,
  pageNumber: number
): PdfSearchMatch[] {
  const needle = normalize(query).text.trim()
  if (!needle) return []
  const haystack = normalize(page.text)
  const matches: PdfSearchMatch[] = []
  let cursor = 0
  while (cursor <= haystack.text.length - needle.length) {
    const found = haystack.text.indexOf(needle, cursor)
    if (found < 0) break
    const start = haystack.starts[found]
    const end = haystack.ends[found + needle.length - 1]
    let low = 0
    let high = page.spans.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (page.spans[middle].end <= start) low = middle + 1
      else high = middle
    }
    const segments: PdfSearchMatch['segments'] = []
    for (let index = low; index < page.spans.length && page.spans[index].start < end; index++) {
      const span = page.spans[index]
      segments.push({
        span: index,
        start: Math.max(0, start - span.start),
        end: Math.min(span.text.length, end - span.start),
        text: span.text
      })
    }
    if (segments.length) matches.push({ page: pageNumber, segments })
    cursor = found + needle.length
  }
  return matches
}
