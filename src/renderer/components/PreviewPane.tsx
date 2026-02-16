import { useMemo, useRef, useCallback, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function PreviewPane(): JSX.Element {
  const pdfBase64 = useAppStore((s) => s.pdfBase64)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)

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
    setNumPages(numPages)
  }, [])

  if (compileStatus === 'compiling') {
    return (
      <div className="preview-center">
        <div>
          <div className="preview-spinner" />
          <p style={{ color: '#999999' }}>Compiling...</p>
        </div>
      </div>
    )
  }

  if (compileStatus === 'error' && !pdfBase64) {
    return (
      <div className="preview-center preview-error">
        <p>Compilation failed. Check the log panel.</p>
      </div>
    )
  }

  if (!pdfData) {
    return (
      <div className="preview-center preview-empty">
        <div>
          <p>No PDF to display</p>
          <p>Open a .tex file and compile to see the preview</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="preview-container">
      <Document file={pdfData} onLoadSuccess={onDocumentLoadSuccess}>
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={containerRef.current ? containerRef.current.clientWidth - 32 : 600}
          />
        ))}
      </Document>
    </div>
  )
}

export default PreviewPane
