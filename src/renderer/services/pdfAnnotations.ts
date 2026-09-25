import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import i18n from '../i18n'

export interface ImportedPdfAnnotation {
  page: number
  kind: string
  author: string
  comment: string
  markedText: string
}

export const MAX_ANNOTATION_PDF_BYTES = 20 * 1024 * 1024
const MARKUP_TYPES = new Set(['Highlight', 'Underline', 'Squiggly', 'StrikeOut'])
const COMMENT_TYPES = new Set([
  'Text',
  'FreeText',
  'Ink',
  'Line',
  'Square',
  'Circle',
  'Polygon',
  'PolyLine',
  'Stamp',
  'Caret',
  'FileAttachment'
])

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n?/gu, '\n').trim() : ''
}

function numbers(value: unknown): number[] {
  const items = Array.isArray(value) || value instanceof Float32Array ? Array.from(value) : []
  return items.every((item) => typeof item === 'number' && Number.isFinite(item)) ? items : []
}

/** PDF text runs can span a partial highlight; keep their context rather than invent glyph bounds. */
function markedText(annotation: Record<string, unknown>, content: TextContent): string {
  const quads = numbers(annotation.quadPoints)
  const boxes: number[][] = []
  for (let i = 0; i + 7 < quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]]
    const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]]
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  if (!boxes.length) {
    const rect = numbers(annotation.rect)
    if (rect.length === 4) boxes.push(rect)
  }
  return content.items
    .map((item) => {
      if (!('str' in item) || !item.str) return ''
      const [a, b, , , x, y] = item.transform as number[]
      const length = Math.hypot(a, b)
      if (!length) return ''
      const ux = a / length
      const uy = b / length
      // Use the middle of the text's height to avoid the next line's bounding box.
      const startX = x - uy * item.height * 0.5
      const startY = y + ux * item.height * 0.5
      const endX = startX + ux * item.width
      const endY = startY + uy * item.width
      const overlaps = boxes.some(
        ([left, bottom, right, top]) =>
          Math.max(startX, endX) >= left &&
          Math.min(startX, endX) <= right &&
          Math.max(startY, endY) >= bottom &&
          Math.min(startY, endY) <= top
      )
      return overlaps ? item.str + (item.hasEOL ? '\n' : ' ') : ''
    })
    .join('')
    .trim()
}

export async function readPdfAnnotations(
  file: File,
  signal: AbortSignal
): Promise<ImportedPdfAnnotation[]> {
  signal.throwIfAborted()
  if (!/\.pdf$/iu.test(file.name) || file.size > MAX_ANNOTATION_PDF_BYTES || file.size === 0)
    throw new Error(i18n.t('pdfAnnotations.unsupported'))
  const bytes = new Uint8Array(await file.arrayBuffer())
  signal.throwIfAborted()
  const { pdfjs } = await import('react-pdf')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  signal.throwIfAborted()
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: bytes })
  const cancel = () => {
    void task.destroy().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const document = await task.promise
    signal.throwIfAborted()
    if (document.numPages > 2000) throw new Error(i18n.t('pdfAnnotations.unsupported'))
    const result: ImportedPdfAnnotation[] = []
    let totalText = 0
    for (let page = 1; page <= document.numPages; page++) {
      signal.throwIfAborted()
      const pdfPage = await document.getPage(page)
      try {
        const annotations: unknown[] = await pdfPage.getAnnotations({ intent: 'display' })
        signal.throwIfAborted()
        const candidates = annotations.map(object).filter((annotation) => {
          const kind = text(annotation.subtype)
          return MARKUP_TYPES.has(kind) || COMMENT_TYPES.has(kind)
        })
        const content = candidates.some((annotation) => MARKUP_TYPES.has(text(annotation.subtype)))
          ? await pdfPage.getTextContent()
          : null
        signal.throwIfAborted()
        for (const annotation of candidates) {
          const kind = text(annotation.subtype)
          const comment = text(object(annotation.contentsObj).str) || text(annotation.contents)
          if (!comment && !MARKUP_TYPES.has(kind)) continue
          const entry = {
            page,
            kind,
            comment,
            author: text(object(annotation.titleObj).str) || text(annotation.title),
            markedText: content && MARKUP_TYPES.has(kind) ? markedText(annotation, content) : ''
          }
          totalText += entry.comment.length + entry.author.length + entry.markedText.length
          if (result.length >= 5000 || totalText > 1_000_000)
            throw new Error(i18n.t('pdfAnnotations.unsupported'))
          result.push(entry)
        }
      } finally {
        pdfPage.cleanup()
      }
    }
    return result
  } finally {
    signal.removeEventListener('abort', cancel)
    await task.destroy()
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]<>#!|]/gu, '\\$&')
}

export function annotationNotes(fileName: string, annotations: ImportedPdfAnnotation[]): string[] {
  const lines = [
    `## ${i18n.t('pdfAnnotations.heading')}: ${escapeMarkdown(fileName.replace(/\s+/gu, ' '))}`,
    ''
  ]
  for (const annotation of annotations) {
    const author = annotation.author
      ? ` · ${escapeMarkdown(annotation.author.replace(/\s+/gu, ' '))}`
      : ''
    lines.push(
      `- [ ] ${i18n.t('pdfAnnotations.page', { page: annotation.page })} · ${annotation.kind}${author}`
    )
    if (annotation.markedText) {
      lines.push(`> ${i18n.t('pdfAnnotations.context')}`)
      lines.push(...annotation.markedText.split('\n').map((line) => `> ${escapeMarkdown(line)}`))
    }
    if (annotation.comment)
      lines.push(...annotation.comment.split('\n').map((line) => `> ${escapeMarkdown(line)}`))
    lines.push('')
  }
  return lines
}
