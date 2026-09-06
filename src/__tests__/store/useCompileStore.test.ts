import { describe, it, expect, beforeEach } from 'vitest'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import type { Diagnostic } from '../../shared/types'
const initialCompileState = {
  compileStatus: 'idle' as const,
  pdfPath: null,
  pdfRevision: 0,
  pdfDocumentId: null,
  pdfDocumentRevision: null,
  logs: '',
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
  })
})
