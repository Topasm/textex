import { buildPdfPageText } from './pdfTextSearch'
import { sentenceAt } from '../utils/sentenceSelection'

export function renderedPdfText(page: Element) {
  const spans = [
    ...page.querySelectorAll<HTMLElement>('.textLayer span[role="presentation"]')
  ].filter((span) => !span.children.length && span.textContent)
  const text = buildPdfPageText(
    spans.map((span) => ({
      str: span.textContent!,
      hasEOL: span.nextElementSibling?.tagName === 'BR'
    }))
  )
  return { elements: spans, ...text }
}

/** Expand the browser's double-click word selection without replacing PDF.js text nodes. */
export function selectPdfSentence(page: HTMLElement, target: Element): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount !== 1) return false
  const original = selection.getRangeAt(0)
  if (!target.contains(original.startContainer) || !page.contains(original.endContainer))
    return false
  const content = renderedPdfText(page)
  const index = content.elements.findIndex((span) => span.contains(original.startContainer))
  if (index < 0 || original.startContainer.nodeType !== Node.TEXT_NODE) return false
  const offset =
    content.elements[index].firstChild === original.startContainer ? original.startOffset : 0
  const sentence = sentenceAt(content.text, content.spans[index].start + offset)
  if (!sentence) return false
  const first = content.spans.findIndex((span) => span.end > sentence.start)
  let last = first
  while (last + 1 < content.spans.length && content.spans[last + 1].start < sentence.end) last++
  if (first < 0) return false
  const range = document.createRange()
  range.setStart(content.elements[first].firstChild!, sentence.start - content.spans[first].start)
  range.setEnd(
    content.elements[last].firstChild!,
    Math.min(content.spans[last].text.length, sentence.end - content.spans[last].start)
  )
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}
