import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface PdfState {
  zoomLevel: number
  splitRatio: number
  synctexHighlight: { page: number; x: number; y: number; timestamp: number } | null

  // PDF Search
  pdfSearchVisible: boolean
  pdfSearchQuery: string

  // Sync request from toolbar to PreviewPane
  syncToCodeRequest: number | null

  // Actions
  setSplitRatio: (ratio: number) => void
  setZoomLevel: (level: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setSynctexHighlight: (highlight: { page: number; x: number; y: number } | null) => void
  setPdfSearchVisible: (visible: boolean) => void
  setPdfSearchQuery: (query: string) => void
  triggerSyncToCode: () => void
}

export const usePdfStore = create<PdfState>()(
  subscribeWithSelector((set) => ({
    zoomLevel: 100,
    splitRatio: 0.5,
    synctexHighlight: null,
    pdfSearchVisible: false,
    pdfSearchQuery: '',
    syncToCodeRequest: null,

    setSplitRatio: (splitRatio) => set({ splitRatio: Math.max(0.2, Math.min(0.8, splitRatio)) }),
    setZoomLevel: (level) => set({ zoomLevel: Math.max(25, Math.min(400, level)) }),
    zoomIn: () => set((state) => ({ zoomLevel: Math.min(400, state.zoomLevel + 25) })),
    zoomOut: () => set((state) => ({ zoomLevel: Math.max(25, state.zoomLevel - 25) })),
    resetZoom: () => set({ zoomLevel: 100 }),
    setSynctexHighlight: (highlight) =>
      set({ synctexHighlight: highlight ? { ...highlight, timestamp: Date.now() } : null }),
    setPdfSearchVisible: (pdfSearchVisible) => set({ pdfSearchVisible }),
    setPdfSearchQuery: (pdfSearchQuery) => set({ pdfSearchQuery }),
    triggerSyncToCode: () => set({ syncToCodeRequest: Date.now() })
  }))
)
