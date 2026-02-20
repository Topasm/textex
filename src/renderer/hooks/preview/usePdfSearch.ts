import { useState, useDeferredValue, useEffect, useCallback, useRef } from 'react'
import { usePdfStore } from '../../store/usePdfStore'

export interface PdfSearchState {
  searchVisible: boolean
  searchQuery: string
  searchMatches: HTMLElement[]
  currentMatchIndex: number
  handleSearchNext: () => void
  handleSearchPrev: () => void
  handleSearchClose: () => void
  setSearchQuery: (query: string) => void
}

export function usePdfSearch(
  containerRef: React.RefObject<HTMLDivElement | null>,
  numPages: number
): PdfSearchState {
  const searchVisible = usePdfStore((s) => s.pdfSearchVisible)
  const searchQuery = usePdfStore((s) => s.pdfSearchQuery)
  const setSearchVisible = usePdfStore((s) => s.setPdfSearchVisible)
  const setSearchQuery = usePdfStore((s) => s.setPdfSearchQuery)
  const nextRequest = usePdfStore((s) => s.pdfSearchNextRequest)
  const prevRequest = usePdfStore((s) => s.pdfSearchPrevRequest)

  const [searchMatches, setSearchMatches] = useState<HTMLElement[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  // Defer search query so DOM scanning doesn't block input responsiveness
  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Perform search in text layer spans
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear previous highlights
    container.querySelectorAll('.pdf-search-highlight').forEach((el) => {
      el.classList.remove('pdf-search-highlight', 'pdf-search-current')
    })

    if (!deferredSearchQuery || !searchVisible) {
      setSearchMatches([])
      setCurrentMatchIndex(0)
      usePdfStore.getState().setPdfMatchCount(0)
      usePdfStore.getState().setPdfCurrentMatch(0)
      return
    }

    const query = deferredSearchQuery.toLowerCase()
    const matches: HTMLElement[] = []

    const spans = container.querySelectorAll('.react-pdf__Page__textContent span')
    spans.forEach((span) => {
      const text = span.textContent?.toLowerCase() || ''
      if (text.includes(query)) {
        const el = span as HTMLElement
        el.classList.add('pdf-search-highlight')
        matches.push(el)
      }
    })

    setSearchMatches(matches)
    setCurrentMatchIndex(0)
    usePdfStore.getState().setPdfMatchCount(matches.length)
    usePdfStore.getState().setPdfCurrentMatch(0)

    if (matches.length > 0) {
      matches[0].classList.add('pdf-search-current')
      matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [deferredSearchQuery, searchVisible, numPages, containerRef])

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return
    searchMatches[currentMatchIndex]?.classList.remove('pdf-search-current')
    const next = (currentMatchIndex + 1) % searchMatches.length
    setCurrentMatchIndex(next)
    searchMatches[next]?.classList.add('pdf-search-current')
    searchMatches[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    usePdfStore.getState().setPdfCurrentMatch(next)
  }, [searchMatches, currentMatchIndex])

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return
    searchMatches[currentMatchIndex]?.classList.remove('pdf-search-current')
    const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(prev)
    searchMatches[prev]?.classList.add('pdf-search-current')
    searchMatches[prev]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    usePdfStore.getState().setPdfCurrentMatch(prev)
  }, [searchMatches, currentMatchIndex])

  const handleSearchClose = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
  }, [setSearchVisible, setSearchQuery])

  // Use refs so the store-driven effects always call the latest handler
  const handleSearchNextRef = useRef(handleSearchNext)
  handleSearchNextRef.current = handleSearchNext
  const handleSearchPrevRef = useRef(handleSearchPrev)
  handleSearchPrevRef.current = handleSearchPrev

  // React to next/prev requests from OmniSearch via store timestamps
  useEffect(() => {
    if (nextRequest) handleSearchNextRef.current()
  }, [nextRequest])

  useEffect(() => {
    if (prevRequest) handleSearchPrevRef.current()
  }, [prevRequest])

  return {
    searchVisible,
    searchQuery,
    searchMatches,
    currentMatchIndex,
    handleSearchNext,
    handleSearchPrev,
    handleSearchClose,
    setSearchQuery
  }
}
