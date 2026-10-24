import '../platform/readableStreamAsyncIterator'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * Opens in-memory PDF bytes with pdf.js for one read and always destroys the
 * loading task. `checkpoint` throws when the caller's request became stale.
 */
export async function withPdfDocument<T>(
  bytes: Uint8Array,
  signal: AbortSignal,
  checkpoint: () => void,
  read: (document: PDFDocumentProxy) => Promise<T>
): Promise<T> {
  const { pdfjs } = await import('react-pdf')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  checkpoint()
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: bytes })
  const cancel = () => {
    void task.destroy().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const document = await task.promise
    checkpoint()
    return await read(document)
  } finally {
    signal.removeEventListener('abort', cancel)
    await task.destroy()
  }
}
