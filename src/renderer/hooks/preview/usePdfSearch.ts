import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'

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
  const searchVisible = useAppStore((s) => s.pdfSearchVisible)
  const searchQuery = useAppStore((s) => s.pdfSearchQuery)
  const setSearchVisible = useAppStore((s) => s.setPdfSearchVisible)
  const setSearchQuery = useAppStore((s) => s.setPdfSearchQuery)

  const [searchMatches, setSearchMatches] = useState<HTMLElement[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Keyboard handler for Ctrl+F search toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const container = containerRef.current
        if (!container) return
        if (!container.matches(':hover') && !container.contains(document.activeElement)) return
        e.preventDefault()
        e.stopPropagation()
        setSearchVisible(true)
      }
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchVisible, setSearchVisible, setSearchQuery, containerRef])

  // Perform search in text layer spans
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear previous highlights
    container.querySelectorAll('.pdf-search-highlight').forEach((el) => {
      el.classList.remove('pdf-search-highlight', 'pdf-search-current')
    })

    if (!searchQuery || !searchVisible) {
      setSearchMatches([])
      setCurrentMatchIndex(0)
      return
    }

    const query = searchQuery.toLowerCase()
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

    if (matches.length > 0) {
      matches[0].classList.add('pdf-search-current')
      matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchQuery, searchVisible, numPages, containerRef])

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return
    searchMatches[currentMatchIndex]?.classList.remove('pdf-search-current')
    const next = (currentMatchIndex + 1) % searchMatches.length
    setCurrentMatchIndex(next)
    searchMatches[next]?.classList.add('pdf-search-current')
    searchMatches[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchMatches, currentMatchIndex])

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return
    searchMatches[currentMatchIndex]?.classList.remove('pdf-search-current')
    const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(prev)
    searchMatches[prev]?.classList.add('pdf-search-current')
    searchMatches[prev]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchMatches, currentMatchIndex])

  const handleSearchClose = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
  }, [setSearchVisible, setSearchQuery])

  return {
    searchVisible,
    searchQuery,
    searchMatches,
    currentMatchIndex,
    handleSearchNext,
    handleSearchPrev,
    handleSearchClose,
    setSearchQuery,
  }
}
