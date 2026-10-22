import { useState, useEffect, useCallback, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../../store/usePdfStore'
import {
  buildPdfPageText,
  findPdfTextMatches,
  type PdfPageText,
  type PdfSearchMatch
} from '../../services/pdfTextSearch'
import {
  clearPdfSearchHighlights,
  observeTextLayerRepaint,
  paintPdfSearchHighlights
} from '../../services/pdfSearchHighlights'
import { logError } from '../../utils/errorMessage'

export interface PdfSearchState {
  searchVisible: boolean
  searchQuery: string
  searchMatches: readonly PdfSearchMatch[]
  currentMatchIndex: number
  isSearching: boolean
  searchFailed: boolean
  handleSearchNext: () => void
  handleSearchPrev: () => void
  handleSearchClose: () => void
  setSearchQuery: (query: string) => void
}
const EMPTY_MATCHES: readonly PdfSearchMatch[] = []
interface SearchResult {
  document: PDFDocumentProxy
  revision: number
  query: string
  matches: PdfSearchMatch[]
  failed: boolean
}

export function usePdfSearch(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pdfDocument: PDFDocumentProxy | undefined,
  displayedRevision: number
): PdfSearchState {
  const searchVisible = usePdfStore((s) => s.pdfSearchVisible)
  const searchQuery = usePdfStore((s) => s.pdfSearchQuery)
  const setSearchVisible = usePdfStore((s) => s.setPdfSearchVisible)
  const setSearchQuery = usePdfStore((s) => s.setPdfSearchQuery)
  const cacheRef = useRef<{
    document: PDFDocumentProxy
    pages: Map<number, Promise<PdfPageText>>
  } | null>(null)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [index, setIndex] = useState(0)
  const active =
    searchVisible &&
    result?.document === pdfDocument &&
    result?.revision === displayedRevision &&
    result?.query === searchQuery
      ? result
      : null
  const searchMatches = active?.matches ?? EMPTY_MATCHES
  const currentMatchIndex = Math.min(index, Math.max(0, searchMatches.length - 1))
  const isSearching = Boolean(searchVisible && searchQuery.trim() && pdfDocument && !active)

  useEffect(() => {
    if (cacheRef.current?.document !== pdfDocument)
      cacheRef.current = pdfDocument ? { document: pdfDocument, pages: new Map() } : null
    const cache = cacheRef.current
    setIndex(0)
    setResult(null)
    if (!searchVisible || !searchQuery.trim() || !pdfDocument || !cache) return
    let cancelled = false
    const run = async () => {
      const matches: PdfSearchMatch[] = []
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
        if (cancelled) return
        let pageText = cache.pages.get(pageNumber)
        if (!pageText) {
          pageText = pdfDocument
            .getPage(pageNumber)
            .then((page) => page.getTextContent())
            .then((content) => buildPdfPageText(content.items.filter((item) => 'str' in item)))
          cache.pages.set(pageNumber, pageText)
          void pageText.catch(() => {
            cache.pages.delete(pageNumber)
          })
        }
        const page = await pageText
        if (cancelled) return
        matches.push(...findPdfTextMatches(page, searchQuery, pageNumber))
        // Bound main-thread work when all text is cached in a long document.
        if (pageNumber % 16 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
      }
      if (!cancelled)
        setResult({
          document: pdfDocument,
          revision: displayedRevision,
          query: searchQuery,
          matches,
          failed: false
        })
    }
    void run().catch((error) => {
      if (cancelled) return
      logError('PDF:search', error)
      setResult({
        document: pdfDocument,
        revision: displayedRevision,
        query: searchQuery,
        matches: [],
        failed: true
      })
    })
    return () => {
      cancelled = true
    }
  }, [pdfDocument, displayedRevision, searchQuery, searchVisible])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const match = searchMatches[currentMatchIndex]
    if (
      match &&
      !container.querySelector(
        `[data-pdf-generation="${displayedRevision}"] [data-page-number="${match.page}"] .textLayer`
      )
    ) {
      const pdf = usePdfStore.getState()
      if (pdf.scrollToPage) pdf.scrollToPage(match.page)
      else pdf.setCurrentPage(match.page)
    }
    const stop = observeTextLayerRepaint(
      container,
      () =>
        paintPdfSearchHighlights(container, displayedRevision, searchMatches, currentMatchIndex),
      { scroll: Boolean(match) }
    )
    return () => {
      stop()
      clearPdfSearchHighlights(container)
    }
  }, [containerRef, searchMatches, currentMatchIndex, displayedRevision])

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length) setIndex((current) => (current + 1) % searchMatches.length)
  }, [searchMatches])
  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length)
      setIndex((current) => (current - 1 + searchMatches.length) % searchMatches.length)
  }, [searchMatches])
  const handleSearchClose = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
  }, [setSearchVisible, setSearchQuery])
  return {
    searchVisible,
    searchQuery,
    searchMatches,
    currentMatchIndex,
    isSearching,
    searchFailed: active?.failed ?? false,
    handleSearchNext,
    handleSearchPrev,
    handleSearchClose,
    setSearchQuery
  }
}
