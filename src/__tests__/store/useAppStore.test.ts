import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, Theme, UserSettings } from '../../renderer/store/useAppStore'
import type { Diagnostic, DocumentSymbolNode } from '../../shared/types'

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
  zoomLevel: 100,
  documentSymbols: [],
  settings: {
    theme: 'system' as Theme,
    pdfInvertMode: false,
    name: '',
    email: '',
    affiliation: '',
    fontSize: 14,
    wordWrap: true,
    vimMode: false,
    formatOnSave: true,
    autoCompile: true,
    spellCheckEnabled: false,
    lspEnabled: true,
    zoteroEnabled: false,
    zoteroPort: 23119,
    bibGroupMode: 'flat'
  } as UserSettings
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

  describe('setDocumentSymbols', () => {
    it('stores and retrieves document symbols', () => {
      const symbols: DocumentSymbolNode[] = [
        {
          name: 'Introduction',
          detail: 'section',
          kind: 3,
          range: { startLine: 1, startColumn: 1, endLine: 10, endColumn: 1 },
          selectionRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 20 },
          children: [
            {
              name: 'Background',
              detail: 'subsection',
              kind: 3,
              range: { startLine: 3, startColumn: 1, endLine: 8, endColumn: 1 },
              selectionRange: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 22 },
              children: []
            }
          ]
        }
      ]
      useAppStore.getState().setDocumentSymbols(symbols)
      expect(useAppStore.getState().documentSymbols).toEqual(symbols)
    })

    it('can clear document symbols with empty array', () => {
      useAppStore.getState().setDocumentSymbols([
        {
          name: 'Test',
          detail: '',
          kind: 3,
          range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
          selectionRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
          children: []
        }
      ])
      useAppStore.getState().setDocumentSymbols([])
      expect(useAppStore.getState().documentSymbols).toEqual([])
    })
  })

  describe('openFileInTab', () => {
    it('opens a new file and sets it as active', () => {
      useAppStore.getState().openFileInTab('/path/a.tex', 'content A')
      const state = useAppStore.getState()
      expect(state.activeFilePath).toBe('/path/a.tex')
      expect(state.filePath).toBe('/path/a.tex')
      expect(state.content).toBe('content A')
      expect(state.isDirty).toBe(false)
      expect(state.openFiles['/path/a.tex']).toBeDefined()
      expect(state.openFiles['/path/a.tex'].content).toBe('content A')
    })

    it('refreshes content when reopening an already-open file', () => {
      // Open file with original content
      useAppStore.getState().openFileInTab('/path/a.tex', 'original content')
      // Edit it
      useAppStore.getState().setContent('edited content')
      expect(useAppStore.getState().openFiles['/path/a.tex'].content).toBe('edited content')

      // Reopen with fresh content from disk
      useAppStore.getState().openFileInTab('/path/a.tex', 'fresh from disk')
      const state = useAppStore.getState()
      expect(state.content).toBe('fresh from disk')
      expect(state.openFiles['/path/a.tex'].content).toBe('fresh from disk')
      expect(state.isDirty).toBe(false)
    })

    it('preserves cursor position when reopening an already-open file', () => {
      useAppStore.getState().openFileInTab('/path/a.tex', 'content')
      useAppStore.getState().setCursorPosition(10, 5)
      // Simulate cursor being saved in openFiles via setActiveTab flow
      useAppStore.setState({
        openFiles: {
          '/path/a.tex': { content: 'content', isDirty: false, cursorLine: 10, cursorColumn: 5 }
        }
      })

      useAppStore.getState().openFileInTab('/path/a.tex', 'refreshed')
      const state = useAppStore.getState()
      expect(state.content).toBe('refreshed')
      expect(state.cursorLine).toBe(10)
      expect(state.cursorColumn).toBe(5)
    })

    it('does not corrupt other open files when opening a new file', () => {
      // Open file A
      useAppStore.getState().openFileInTab('/path/a.tex', 'content A')

      // Open file B — this should NOT overwrite A's content
      useAppStore.getState().openFileInTab('/path/b.tex', 'content B')
      const state = useAppStore.getState()
      expect(state.activeFilePath).toBe('/path/b.tex')
      expect(state.content).toBe('content B')
      expect(state.openFiles['/path/a.tex'].content).toBe('content A')
      expect(state.openFiles['/path/b.tex'].content).toBe('content B')
    })
  })

  describe('setActiveTab', () => {
    it('persists current content when switching tabs', () => {
      // Open file A and edit it
      useAppStore.getState().openFileInTab('/path/a.tex', 'original A')
      useAppStore.getState().setContent('edited A')

      // Open file B
      useAppStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Switch back to A — the edited content should be preserved
      useAppStore.getState().setActiveTab('/path/a.tex')
      const state = useAppStore.getState()
      expect(state.activeFilePath).toBe('/path/a.tex')
      expect(state.content).toBe('edited A')
      expect(state.openFiles['/path/a.tex'].content).toBe('edited A')
    })

    it('saves content of current tab before switching away', () => {
      // Open two files
      useAppStore.getState().openFileInTab('/path/a.tex', 'content A')
      useAppStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Edit B
      useAppStore.getState().setContent('edited B')

      // Switch to A — B's edited content should be saved in openFiles
      useAppStore.getState().setActiveTab('/path/a.tex')
      expect(useAppStore.getState().openFiles['/path/b.tex'].content).toBe('edited B')
    })

    it('preserves cursor position across tab switches', () => {
      useAppStore.getState().openFileInTab('/path/a.tex', 'content A')
      useAppStore.getState().setCursorPosition(15, 8)

      useAppStore.getState().openFileInTab('/path/b.tex', 'content B')
      useAppStore.getState().setCursorPosition(3, 12)

      // Switch back to A
      useAppStore.getState().setActiveTab('/path/a.tex')
      expect(useAppStore.getState().cursorLine).toBe(15)
      expect(useAppStore.getState().cursorColumn).toBe(8)

      // Switch back to B
      useAppStore.getState().setActiveTab('/path/b.tex')
      expect(useAppStore.getState().cursorLine).toBe(3)
      expect(useAppStore.getState().cursorColumn).toBe(12)
    })
  })

  describe('setContent with multi-file', () => {
    it('updates only the active file in openFiles', () => {
      useAppStore.getState().openFileInTab('/path/a.tex', 'content A')
      useAppStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Edit B (the active file)
      useAppStore.getState().setContent('modified B')

      const state = useAppStore.getState()
      expect(state.openFiles['/path/b.tex'].content).toBe('modified B')
      expect(state.openFiles['/path/a.tex'].content).toBe('content A')
    })
  })

  describe('updateSetting', () => {
    it('updates user info settings', () => {
      useAppStore.getState().updateSetting('name', 'John Doe')
      useAppStore.getState().updateSetting('email', 'john@example.com')
      useAppStore.getState().updateSetting('affiliation', 'OpenAI')

      const settings = useAppStore.getState().settings
      expect(settings.name).toBe('John Doe')
      expect(settings.email).toBe('john@example.com')
      expect(settings.affiliation).toBe('OpenAI')
    })

    it('updates other settings', () => {
      useAppStore.getState().updateSetting('fontSize', 20)
      expect(useAppStore.getState().settings.fontSize).toBe(20)
    })
  })
})
