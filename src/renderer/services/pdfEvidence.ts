import { isRelativeEvidencePdf } from '../../shared/citationEvidence'
import { resolveDiagnosticFilePath } from './diagnosticNavigation'
import { checkEvidenceProject } from './citationEvidence'
import i18n from '../i18n'

export interface EvidencePage {
  pdf: string
  page: number
  pages: number
  text: string
  sha256: string
}

export async function readEvidencePage(
  root: string,
  pdf: string,
  page: number,
  signal: AbortSignal
): Promise<EvidencePage> {
  const current = () => {
    signal.throwIfAborted()
    checkEvidenceProject(root)
  }
  current()
  if (!isRelativeEvidencePdf(pdf) || !Number.isSafeInteger(page) || page < 1)
    throw new Error(i18n.t('citationEvidence.invalidPage'))
  const path = resolveDiagnosticFilePath(pdf, root)
  if (!path) throw new Error(i18n.t('citationEvidence.invalidPage'))
  // Native project and symlink containment applies to every read, including rechecks.
  const result = await window.api.readFileBase64(path)
  current()
  const prefix = 'data:application/pdf;base64,'
  if (
    result.mimeType !== 'application/pdf' ||
    !result.data.startsWith(prefix) ||
    result.data.length > 24_000_000
  )
    throw new Error(i18n.t('citationEvidence.unsupported'))
  const bytes = Uint8Array.from(atob(result.data.slice(prefix.length)), (char) =>
    char.charCodeAt(0)
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  current()
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  const { pdfjs } = await import('react-pdf')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  current()
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: bytes })
  const cancel = () => {
    void task.destroy().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const document = await task.promise
    current()
    if (page > document.numPages) throw new Error(i18n.t('citationEvidence.invalidPage'))
    const pdfPage = await document.getPage(page)
    const content = await pdfPage.getTextContent()
    current()
    const text = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
      .join('')
      .trim()
    if (!text) throw new Error(i18n.t('citationEvidence.noText'))
    if (text.length > 100_000) throw new Error(i18n.t('citationEvidence.unsupported'))
    return { pdf, page, pages: document.numPages, text, sha256 }
  } finally {
    signal.removeEventListener('abort', cancel)
    await task.destroy()
  }
}
