import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX } from '../constants'

interface PdfState {
  zoomLevel: number
  splitRatio: number
  synctexHighlight: { page: number; x: number; y: number; timestamp: number } | null

  // PDF Search
  pdfSearchVisible: boolean
  pdfSearchQuery: string
  pdfMatchCount: number
  pdfCurrentMatch: number
  pdfSearchNextRequest: number | null
  pdfSearchPrevRequest: number | null

  // Sync request from toolbar to PreviewPane
  syncToCodeRequest: number | null

  // Page navigation
  currentPage: number
  numPages: number
  scrollToPage: ((page: number) => void) | null

  // Fit mode request
  fitRequest: 'width' | 'height' | null

  // Per-project scroll persistence
  savedScrollPositions: Record<string, number>

  // Actions
  setSplitRatio: (ratio: number) => void
  setZoomLevel: (level: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setSynctexHighlight: (highlight: { page: number; x: number; y: number } | null) => void
  setPdfSearchVisible: (visible: boolean) => void
  setPdfSearchQuery: (query: string) => void
  setPdfMatchCount: (count: number) => void
  setPdfCurrentMatch: (index: number) => void
  requestPdfSearchNext: () => void
  requestPdfSearchPrev: () => void
  triggerSyncToCode: () => void
  setCurrentPage: (page: number) => void
  setNumPages: (n: number) => void
  setScrollToPage: (fn: ((page: number) => void) | null) => void
  requestFit: (mode: 'width' | 'height') => void
  clearFitRequest: () => void
  saveScrollPosition: (projectRoot: string, scrollTop: number) => void
  getScrollPosition: (projectRoot: string) => number
}

export const usePdfStore = create<PdfState>()(
  persist(
    subscribeWithSelector((set, get) => ({
      zoomLevel: 100,
      splitRatio: 0.5,
      synctexHighlight: null,
      pdfSearchVisible: false,
      pdfSearchQuery: '',
      pdfMatchCount: 0,
      pdfCurrentMatch: 0,
      pdfSearchNextRequest: null,
      pdfSearchPrevRequest: null,
      syncToCodeRequest: null,
      currentPage: 1,
      numPages: 0,
      scrollToPage: null,
      fitRequest: null,
      savedScrollPositions: {},

      setSplitRatio: (splitRatio) =>
        set({ splitRatio: Math.max(SPLIT_RATIO_MIN, Math.min(SPLIT_RATIO_MAX, splitRatio)) }),
      setZoomLevel: (level) => set({ zoomLevel: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level)) }),
      zoomIn: () =>
        set((state) => ({ zoomLevel: Math.min(ZOOM_MAX, state.zoomLevel + ZOOM_STEP) })),
      zoomOut: () =>
        set((state) => ({ zoomLevel: Math.max(ZOOM_MIN, state.zoomLevel - ZOOM_STEP) })),
      resetZoom: () => set({ zoomLevel: 100 }),
      setSynctexHighlight: (highlight) =>
        set({ synctexHighlight: highlight ? { ...highlight, timestamp: Date.now() } : null }),
      setPdfSearchVisible: (pdfSearchVisible) => set({ pdfSearchVisible }),
      setPdfSearchQuery: (pdfSearchQuery) => set({ pdfSearchQuery }),
      setPdfMatchCount: (pdfMatchCount) => set({ pdfMatchCount }),
      setPdfCurrentMatch: (pdfCurrentMatch) => set({ pdfCurrentMatch }),
      requestPdfSearchNext: () => set({ pdfSearchNextRequest: Date.now() }),
      requestPdfSearchPrev: () => set({ pdfSearchPrevRequest: Date.now() }),
      triggerSyncToCode: () => set({ syncToCodeRequest: Date.now() }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setNumPages: (n) => set({ numPages: n }),
      setScrollToPage: (fn) => set({ scrollToPage: fn }),
      requestFit: (mode) => set({ fitRequest: mode }),
      clearFitRequest: () => set({ fitRequest: null }),
      saveScrollPosition: (projectRoot, scrollTop) =>
        set((state) => ({
          savedScrollPositions: { ...state.savedScrollPositions, [projectRoot]: scrollTop }
        })),
      getScrollPosition: (projectRoot) => get().savedScrollPositions[projectRoot] ?? 0
    })),
    {
      name: 'textex-pdf-layout',
      partialize: (state) => ({
        zoomLevel: state.zoomLevel,
        splitRatio: state.splitRatio,
        savedScrollPositions: state.savedScrollPositions
      })
    }
  )
)
