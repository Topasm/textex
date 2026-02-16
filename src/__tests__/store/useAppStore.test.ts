import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../renderer/store/useAppStore'

const initialState = {
  filePath: null,
  content: '',
  isDirty: false,
  compileStatus: 'idle' as const,
  pdfBase64: null,
  logs: '',
  isLogPanelOpen: false,
  cursorLine: 1,
  cursorColumn: 1,
  diagnostics: [],
  logViewMode: 'structured' as const,
  pendingJump: null,
  synctexHighlight: null,
  splitRatio: 0.5,
  zoomLevel: 100
}

beforeEach(() => {
  useAppStore.setState(initialState)
})

describe('useAppStore', () => {
  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useAppStore.getState()
      expect(state.filePath).toBeNull()
      expect(state.content).toBe('')
      expect(state.isDirty).toBe(false)
      expect(state.compileStatus).toBe('idle')
      expect(state.pdfBase64).toBeNull()
      expect(state.logs).toBe('')
      expect(state.isLogPanelOpen).toBe(false)
      expect(state.cursorLine).toBe(1)
      expect(state.cursorColumn).toBe(1)
      expect(state.diagnostics).toEqual([])
      expect(state.logViewMode).toBe('structured')
      expect(state.pendingJump).toBeNull()
      expect(state.synctexHighlight).toBeNull()
      expect(state.splitRatio).toBe(0.5)
      expect(state.zoomLevel).toBe(100)
    })
  })

  describe('setContent', () => {
    it('updates content and sets isDirty to true', () => {
      useAppStore.getState().setContent('\\documentclass{article}')
      const state = useAppStore.getState()
      expect(state.content).toBe('\\documentclass{article}')
      expect(state.isDirty).toBe(true)
    })

    it('sets isDirty even when content is empty string', () => {
      useAppStore.getState().setContent('')
      expect(useAppStore.getState().isDirty).toBe(true)
    })
  })

  describe('setFilePath', () => {
    it('updates filePath', () => {
      useAppStore.getState().setFilePath('/home/user/doc.tex')
      expect(useAppStore.getState().filePath).toBe('/home/user/doc.tex')
    })

    it('can set filePath to null', () => {
      useAppStore.getState().setFilePath('/some/file.tex')
      useAppStore.getState().setFilePath(null)
      expect(useAppStore.getState().filePath).toBeNull()
    })
  })

  describe('setDirty', () => {
    it('sets isDirty to true', () => {
      useAppStore.getState().setDirty(true)
      expect(useAppStore.getState().isDirty).toBe(true)
    })

    it('sets isDirty to false', () => {
      useAppStore.getState().setDirty(true)
      useAppStore.getState().setDirty(false)
      expect(useAppStore.getState().isDirty).toBe(false)
    })
  })

  describe('setCompileStatus', () => {
    it('updates compileStatus to compiling', () => {
      useAppStore.getState().setCompileStatus('compiling')
      expect(useAppStore.getState().compileStatus).toBe('compiling')
    })

    it('updates compileStatus to success', () => {
      useAppStore.getState().setCompileStatus('success')
      expect(useAppStore.getState().compileStatus).toBe('success')
    })

    it('updates compileStatus to error', () => {
      useAppStore.getState().setCompileStatus('error')
      expect(useAppStore.getState().compileStatus).toBe('error')
    })

    it('updates compileStatus to idle', () => {
      useAppStore.getState().setCompileStatus('compiling')
      useAppStore.getState().setCompileStatus('idle')
      expect(useAppStore.getState().compileStatus).toBe('idle')
    })
  })

  describe('setPdfBase64', () => {
    it('updates pdfBase64', () => {
      useAppStore.getState().setPdfBase64('abc123base64data')
      expect(useAppStore.getState().pdfBase64).toBe('abc123base64data')
    })

    it('can set pdfBase64 to null', () => {
      useAppStore.getState().setPdfBase64('data')
      useAppStore.getState().setPdfBase64(null)
      expect(useAppStore.getState().pdfBase64).toBeNull()
    })
  })

  describe('appendLog', () => {
    it('appends text to logs', () => {
      useAppStore.getState().appendLog('line 1\n')
      useAppStore.getState().appendLog('line 2\n')
      expect(useAppStore.getState().logs).toBe('line 1\nline 2\n')
    })

    it('concatenates to existing logs', () => {
      useAppStore.setState({ logs: 'existing ' })
      useAppStore.getState().appendLog('new')
      expect(useAppStore.getState().logs).toBe('existing new')
    })
  })

  describe('clearLogs', () => {
    it('resets logs to empty string', () => {
      useAppStore.setState({ logs: 'some logs here' })
      useAppStore.getState().clearLogs()
      expect(useAppStore.getState().logs).toBe('')
    })
  })

  describe('toggleLogPanel', () => {
    it('flips isLogPanelOpen from false to true', () => {
      useAppStore.getState().toggleLogPanel()
      expect(useAppStore.getState().isLogPanelOpen).toBe(true)
    })

    it('flips isLogPanelOpen from true to false', () => {
      useAppStore.setState({ isLogPanelOpen: true })
      useAppStore.getState().toggleLogPanel()
      expect(useAppStore.getState().isLogPanelOpen).toBe(false)
    })
  })

  describe('setLogPanelOpen', () => {
    it('sets isLogPanelOpen directly', () => {
      useAppStore.getState().setLogPanelOpen(true)
      expect(useAppStore.getState().isLogPanelOpen).toBe(true)
    })

    it('can close log panel', () => {
      useAppStore.setState({ isLogPanelOpen: true })
      useAppStore.getState().setLogPanelOpen(false)
      expect(useAppStore.getState().isLogPanelOpen).toBe(false)
    })
  })

  describe('setCursorPosition', () => {
    it('updates cursorLine and cursorColumn', () => {
      useAppStore.getState().setCursorPosition(10, 25)
      const state = useAppStore.getState()
      expect(state.cursorLine).toBe(10)
      expect(state.cursorColumn).toBe(25)
    })
  })

  describe('setDiagnostics', () => {
    it('sets diagnostics array', () => {
      const diags: Diagnostic[] = [
        { file: 'test.tex', line: 5, severity: 'error', message: 'Undefined control sequence' },
        { file: 'test.tex', line: 10, severity: 'warning', message: 'Overfull hbox' }
      ]
      useAppStore.getState().setDiagnostics(diags)
      expect(useAppStore.getState().diagnostics).toEqual(diags)
    })

    it('can clear diagnostics with empty array', () => {
      useAppStore.setState({
        diagnostics: [{ file: 'test.tex', line: 1, severity: 'error', message: 'err' }]
      })
      useAppStore.getState().setDiagnostics([])
      expect(useAppStore.getState().diagnostics).toEqual([])
    })
  })

  describe('setLogViewMode', () => {
    it('sets mode to raw', () => {
      useAppStore.getState().setLogViewMode('raw')
      expect(useAppStore.getState().logViewMode).toBe('raw')
    })

    it('sets mode to structured', () => {
      useAppStore.setState({ logViewMode: 'raw' })
      useAppStore.getState().setLogViewMode('structured')
      expect(useAppStore.getState().logViewMode).toBe('structured')
    })
  })

  describe('requestJumpToLine', () => {
    it('sets pendingJump with line and column', () => {
      useAppStore.getState().requestJumpToLine(42, 8)
      expect(useAppStore.getState().pendingJump).toEqual({ line: 42, column: 8 })
    })
  })

  describe('clearPendingJump', () => {
    it('sets pendingJump to null', () => {
      useAppStore.setState({ pendingJump: { line: 10, column: 1 } })
      useAppStore.getState().clearPendingJump()
      expect(useAppStore.getState().pendingJump).toBeNull()
    })
  })

  describe('setSynctexHighlight', () => {
    it('sets highlight with timestamp', () => {
      const before = Date.now()
      useAppStore.getState().setSynctexHighlight({ page: 1, x: 100, y: 200 })
      const after = Date.now()
      const highlight = useAppStore.getState().synctexHighlight
      expect(highlight).not.toBeNull()
      expect(highlight!.page).toBe(1)
      expect(highlight!.x).toBe(100)
      expect(highlight!.y).toBe(200)
      expect(highlight!.timestamp).toBeGreaterThanOrEqual(before)
      expect(highlight!.timestamp).toBeLessThanOrEqual(after)
    })

    it('sets highlight to null', () => {
      useAppStore.getState().setSynctexHighlight({ page: 1, x: 0, y: 0 })
      useAppStore.getState().setSynctexHighlight(null)
      expect(useAppStore.getState().synctexHighlight).toBeNull()
    })
  })

  describe('setSplitRatio', () => {
    it('updates splitRatio', () => {
      useAppStore.getState().setSplitRatio(0.7)
      expect(useAppStore.getState().splitRatio).toBe(0.7)
    })
  })

  describe('setZoomLevel', () => {
    it('sets zoom level', () => {
      useAppStore.getState().setZoomLevel(150)
      expect(useAppStore.getState().zoomLevel).toBe(150)
    })

    it('clamps zoom level to minimum of 25', () => {
      useAppStore.getState().setZoomLevel(10)
      expect(useAppStore.getState().zoomLevel).toBe(25)
    })

    it('clamps zoom level to maximum of 400', () => {
      useAppStore.getState().setZoomLevel(500)
      expect(useAppStore.getState().zoomLevel).toBe(400)
    })
  })

  describe('zoomIn', () => {
    it('increases zoom by 25', () => {
      useAppStore.getState().zoomIn()
      expect(useAppStore.getState().zoomLevel).toBe(125)
    })

    it('does not exceed maximum of 400', () => {
      useAppStore.setState({ zoomLevel: 400 })
      useAppStore.getState().zoomIn()
      expect(useAppStore.getState().zoomLevel).toBe(400)
    })
  })

  describe('zoomOut', () => {
    it('decreases zoom by 25', () => {
      useAppStore.getState().zoomOut()
      expect(useAppStore.getState().zoomLevel).toBe(75)
    })

    it('does not go below minimum of 25', () => {
      useAppStore.setState({ zoomLevel: 25 })
      useAppStore.getState().zoomOut()
      expect(useAppStore.getState().zoomLevel).toBe(25)
    })
  })

  describe('resetZoom', () => {
    it('resets zoom to 100', () => {
      useAppStore.setState({ zoomLevel: 250 })
      useAppStore.getState().resetZoom()
      expect(useAppStore.getState().zoomLevel).toBe(100)
    })
  })
})
