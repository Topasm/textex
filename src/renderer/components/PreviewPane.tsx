import { useMemo, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function PreviewPane(): JSX.Element {
  const pdfBase64 = useAppStore((s) => s.pdfBase64)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const containerRef = useRef<HTMLDivElement>(null)
  const numPagesRef = useRef<number>(0)

  const pdfData = useMemo(() => {
    if (!pdfBase64) return null
    const binaryString = atob(pdfBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return { data: bytes }
  }, [pdfBase64])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    numPagesRef.current = numPages
  }, [])

  if (compileStatus === 'compiling') {
    return (
      <div className="h-full flex items-center justify-center text-[#999999]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#007acc] border-t-transparent rounded-full mx-auto mb-3" />
          <p>Compiling...</p>
        </div>
      </div>
    )
  }

  if (compileStatus === 'error' && !pdfBase64) {
    return (
      <div className="h-full flex items-center justify-center text-[#f44747]">
        <p>Compilation failed. Check the log panel.</p>
      </div>
    )
  }

  if (!pdfData) {
    return (
      <div className="h-full flex items-center justify-center text-[#666666]">
        <div className="text-center">
          <p className="text-lg mb-2">No PDF to display</p>
          <p className="text-sm">Open a .tex file and compile to see the preview</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[#2d2d2d] p-4">
      <Document file={pdfData} onLoadSuccess={onDocumentLoadSuccess}>
        {Array.from({ length: numPagesRef.current }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={containerRef.current ? containerRef.current.clientWidth - 32 : 600}
            className="mb-4 shadow-lg"
          />
        ))}
      </Document>
    </div>
  )
}

export default PreviewPane
