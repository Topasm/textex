import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Diagnostic } from '../../shared/types'

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'

/**
 * Support files Tectonic fetched during the current compile. `currentFile` is
 * set while the engine is still downloading and cleared once the log moves on
 * to other output, so the UI can show a "downloading" phase instead of a bare
 * spinner on a fresh machine where the first compile pulls dozens of files.
 */
export interface SupportFileDownloads {
  currentFile: string | null
  count: number
}

const MAX_LOG_CHARS = 512_000
const MAX_PARTIAL_LINE_CHARS = 4_096
const DOWNLOAD_LINE = /^note: downloading\s+(.+?)\s*$/u

const NO_DOWNLOADS: SupportFileDownloads = { currentFile: null, count: 0 }

/** Shows `bundle.tar` for `downloading index https://host/path/bundle.tar`. */
function displayDownloadName(remainder: string): string {
  const token = remainder.split(/\s+/u).filter(Boolean).pop() ?? remainder
  const segments = token.split('/').filter(Boolean)
  return segments.pop() ?? token
}

/**
 * Folds a chunk of compiler output into the download phase. Chunks arrive one
 * stdout/stderr line at a time but may be split mid-line, so an unfinished
 * tail is carried over and only complete lines are classified.
 */
export function trackSupportFileDownloads(
  previous: SupportFileDownloads,
  partialLine: string,
  chunk: string
): { downloads: SupportFileDownloads; partialLine: string } {
  const text = partialLine + chunk
  const lines = text.split('\n')
  const remainder = lines.pop() ?? ''
  let downloads = previous
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/u, '')
    const match = DOWNLOAD_LINE.exec(line)
    if (match) {
      downloads = { currentFile: displayDownloadName(match[1]), count: downloads.count + 1 }
    } else if (line.trim() !== '' && downloads.currentFile !== null) {
      downloads = { currentFile: null, count: downloads.count }
    }
  }
  return { downloads, partialLine: remainder.slice(-MAX_PARTIAL_LINE_CHARS) }
}

interface CompileState {
  compileStatus: CompileStatus
  pdfPath: string | null
  /** Monotonic counter bumped on each successful compile to signal PDF reload. */
  pdfRevision: number
  pdfDocumentId: string | null
  pdfDocumentRevision: number | null
  logs: string
  /** Unfinished trailing log line awaiting its newline; internal to appendLog. */
  partialLogLine: string
  supportFileDownloads: SupportFileDownloads
  diagnostics: Diagnostic[]
  logViewMode: 'raw' | 'structured'

  setCompileStatus: (status: CompileStatus) => void
  setPdfPath: (pdfPath: string | null, source?: { documentId: string; revision: number }) => void
  appendLog: (text: string) => void
  clearLogs: () => void
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  setLogViewMode: (mode: 'raw' | 'structured') => void
}

export const useCompileStore = create<CompileState>()(
  subscribeWithSelector((set) => ({
    compileStatus: 'idle',
    pdfPath: null,
    pdfRevision: 0,
    pdfDocumentId: null,
    pdfDocumentRevision: null,
    logs: '',
    partialLogLine: '',
    supportFileDownloads: NO_DOWNLOADS,
    diagnostics: [],
    logViewMode: 'structured',

    setCompileStatus: (compileStatus) => set({ compileStatus }),
    setPdfPath: (pdfPath, source) =>
      set((state) => ({
        pdfPath,
        pdfRevision: state.pdfRevision + 1,
        pdfDocumentId: source?.documentId ?? null,
        pdfDocumentRevision: source?.revision ?? null
      })),
    appendLog: (text) =>
      set((state) => {
        const nextLogs = state.logs + text
        const tracked = trackSupportFileDownloads(
          state.supportFileDownloads,
          state.partialLogLine,
          text
        )
        return {
          logs: nextLogs.length > MAX_LOG_CHARS ? nextLogs.slice(-MAX_LOG_CHARS) : nextLogs,
          partialLogLine: tracked.partialLine,
          supportFileDownloads:
            tracked.downloads === state.supportFileDownloads
              ? state.supportFileDownloads
              : tracked.downloads
        }
      }),
    clearLogs: () => set({ logs: '', partialLogLine: '', supportFileDownloads: NO_DOWNLOADS }),
    setDiagnostics: (diagnostics) => set({ diagnostics }),
    setLogViewMode: (logViewMode) => set({ logViewMode })
  }))
)

/** Selector: the download phase is only meaningful while a compile is running. */
export function selectActiveSupportFileDownload(state: {
  compileStatus: CompileStatus
  supportFileDownloads: SupportFileDownloads
}): SupportFileDownloads | null {
  return state.compileStatus === 'compiling' && state.supportFileDownloads.currentFile !== null
    ? state.supportFileDownloads
    : null
}
