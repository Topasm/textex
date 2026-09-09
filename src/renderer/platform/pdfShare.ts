import type { PdfShareResult } from '../../shared/pdfExport'

/** Call from a user gesture; desktop WebViews may not support file sharing. */
export async function sharePdf(data: Uint8Array, fileName: string): Promise<PdfShareResult> {
  if (!navigator.share || !navigator.canShare) return 'unsupported'
  const file = new File([new Uint8Array(data)], fileName, { type: 'application/pdf' })
  if (!navigator.canShare({ files: [file] })) return 'unsupported'
  try {
    await navigator.share({ files: [file] })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'AbortError') return 'cancelled'
      if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
        return 'unsupported'
      }
    }
    throw error
  }
}
