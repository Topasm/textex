import { describe, it, expect, beforeEach } from 'vitest'
import {
  selectActiveSupportFileDownload,
  trackSupportFileDownloads,
  useCompileStore
} from '../../renderer/store/useCompileStore'
import type { Diagnostic } from '../../shared/types'
const initialCompileState = {
  compileStatus: 'idle' as const,
  pdfPath: null,
  pdfRevision: 0,
  pdfDocumentId: null,
  pdfDocumentRevision: null,
  logs: '',
  partialLogLine: '',
  supportFileDownloads: { currentFile: null, count: 0 },
  diagnostics: [] as Diagnostic[],
  logViewMode: 'structured' as const
}

beforeEach(() => useCompileStore.setState(initialCompileState))

describe('useCompileStore', () => {
  describe('setPdfPath', () => {
    it('updates pdfPath and increments pdfRevision', () => {
      useCompileStore.getState().setPdfPath('/path/to/output.pdf')
      expect(useCompileStore.getState().pdfPath).toBe('/path/to/output.pdf')
      expect(useCompileStore.getState().pdfRevision).toBe(1)
    })

    it('can set pdfPath to null', () => {
      useCompileStore.getState().setPdfPath('/path/to/output.pdf')
      useCompileStore.getState().setPdfPath(null)
      expect(useCompileStore.getState().pdfPath).toBeNull()
    })

    it('increments pdfRevision on each call', () => {
      useCompileStore.getState().setPdfPath('/path/a.pdf')
      useCompileStore.getState().setPdfPath('/path/b.pdf')
      expect(useCompileStore.getState().pdfRevision).toBe(2)
    })

    it('tracks the document revision that produced the PDF', () => {
      useCompileStore.getState().setPdfPath('/path/output.pdf', {
        documentId: '/path/main.tex',
        revision: 12
      })

      expect(useCompileStore.getState()).toMatchObject({
        pdfDocumentId: '/path/main.tex',
        pdfDocumentRevision: 12
      })
    })
  })

  describe('appendLog', () => {
    it('appends text to logs', () => {
      useCompileStore.getState().appendLog('line 1\n')
      useCompileStore.getState().appendLog('line 2\n')
      expect(useCompileStore.getState().logs).toBe('line 1\nline 2\n')
    })

    it('concatenates to existing logs', () => {
      useCompileStore.setState({ logs: 'existing ' })
      useCompileStore.getState().appendLog('new')
      expect(useCompileStore.getState().logs).toBe('existing new')
    })

    it('caps the raw log buffer to avoid unbounded memory growth', () => {
      useCompileStore.setState({ logs: 'head' + 'a'.repeat(511_996) })
      useCompileStore.getState().appendLog('b')
      const logs = useCompileStore.getState().logs
      expect(logs).toHaveLength(512_000)
      expect(logs.startsWith('head')).toBe(false)
      expect(logs.endsWith('b')).toBe(true)
    })
  })

  describe('clearLogs', () => {
    it('resets logs to empty string', () => {
      useCompileStore.setState({ logs: 'some logs here' })
      useCompileStore.getState().clearLogs()
      expect(useCompileStore.getState().logs).toBe('')
    })

    it('forgets the download phase of the previous compile', () => {
      useCompileStore.getState().appendLog('note: downloading latex.ltx\n')
      useCompileStore.getState().clearLogs()
      expect(useCompileStore.getState().supportFileDownloads).toEqual({
        currentFile: null,
        count: 0
      })
      expect(useCompileStore.getState().partialLogLine).toBe('')
    })
  })

  describe('support file downloads', () => {
    it('counts Tectonic download notes and names the current file', () => {
      const { appendLog } = useCompileStore.getState()
      appendLog('Using the bundled Tectonic cache.\n')
      appendLog('note: downloading tectonic-format-latex.tex\n')
      appendLog('note: downloading latex.ltx\n')
      expect(useCompileStore.getState().supportFileDownloads).toEqual({
        currentFile: 'latex.ltx',
        count: 2
      })
    })

    it('ends the download phase when the engine prints other output', () => {
      const { appendLog } = useCompileStore.getState()
      appendLog('note: downloading natbib.sty\n')
      appendLog('Running TeX ...\n')
      expect(useCompileStore.getState().supportFileDownloads).toEqual({
        currentFile: null,
        count: 1
      })
      appendLog('note: downloading plainnat.bst\n')
      expect(useCompileStore.getState().supportFileDownloads).toEqual({
        currentFile: 'plainnat.bst',
        count: 2
      })
    })

    it('reassembles a note that arrives split across chunks', () => {
      const { appendLog } = useCompileStore.getState()
      appendLog('note: down')
      expect(useCompileStore.getState().supportFileDownloads.count).toBe(0)
      appendLog('loading article.cls\r\nnote: downloading index https://relay.example/bundle.tar\n')
      expect(useCompileStore.getState().supportFileDownloads).toEqual({
        currentFile: 'bundle.tar',
        count: 2
      })
    })

    it('is only reported as active while a compile is running', () => {
      useCompileStore.getState().appendLog('note: downloading amsmath.sty\n')
      expect(selectActiveSupportFileDownload(useCompileStore.getState())).toBeNull()
      useCompileStore.getState().setCompileStatus('compiling')
      expect(selectActiveSupportFileDownload(useCompileStore.getState())).toEqual({
        currentFile: 'amsmath.sty',
        count: 1
      })
    })

    it('keeps the same state object when a chunk changes nothing', () => {
      const before = { currentFile: 'a.sty', count: 1 }
      const tracked = trackSupportFileDownloads(before, '', 'warning: something\n')
      expect(tracked.downloads).toEqual({ currentFile: null, count: 1 })
      const unchanged = trackSupportFileDownloads(tracked.downloads, '', '\n\n')
      expect(unchanged.downloads).toBe(tracked.downloads)
    })
  })
})
