import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import type { Theme } from '../../renderer/store/useSettingsStore'
import type { UserSettings, Diagnostic, DocumentSymbolNode } from '../../shared/types'

const initialEditorState = {
  filePath: null,
  content: '',
  isDirty: false,
  openFiles: {},
  activeFilePath: null,
  cursorLine: 1,
  cursorColumn: 1,
  pendingJump: null,
  pendingInsertText: null,
  _sessionOpenPaths: [] as string[],
  _sessionActiveFile: null
}

const initialCompileState = {
  compileStatus: 'idle' as const,
  pdfPath: null,
  pdfRevision: 0,
  logs: '',
  isLogPanelOpen: false,
  diagnostics: [] as Diagnostic[],
  logViewMode: 'structured' as const
}

const initialPdfState = {
  splitRatio: 0.5,
  zoomLevel: 100,
  synctexHighlight: null
}

const initialUiState = {
  documentSymbols: [] as DocumentSymbolNode[]
}

const initialSettings = {
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
  useEditorStore.setState(initialEditorState)
  useCompileStore.setState(initialCompileState)
  usePdfStore.setState(initialPdfState)
  useUiStore.setState(initialUiState)
  useSettingsStore.setState(initialSettings)
})

describe('useAppStore', () => {
  describe('initial state', () => {
    it('has correct default values', () => {
      const editor = useEditorStore.getState()
      const compile = useCompileStore.getState()
      const pdf = usePdfStore.getState()

      expect(editor.filePath).toBeNull()
      expect(editor.content).toBe('')
      expect(editor.isDirty).toBe(false)
      expect(compile.compileStatus).toBe('idle')
      expect(compile.pdfPath).toBeNull()
      expect(compile.logs).toBe('')
      expect(compile.isLogPanelOpen).toBe(false)
      expect(editor.cursorLine).toBe(1)
      expect(editor.cursorColumn).toBe(1)
      expect(compile.diagnostics).toEqual([])
      expect(compile.logViewMode).toBe('structured')
      expect(editor.pendingJump).toBeNull()
      expect(pdf.synctexHighlight).toBeNull()
      expect(pdf.splitRatio).toBe(0.5)
      expect(pdf.zoomLevel).toBe(100)
    })
  })

  describe('setContent', () => {
    it('updates content and sets isDirty to true', () => {
      useEditorStore.getState().setContent('\\documentclass{article}')
      const state = useEditorStore.getState()
      expect(state.content).toBe('\\documentclass{article}')
      expect(state.isDirty).toBe(true)
    })

    it('sets isDirty even when content is empty string', () => {
      useEditorStore.getState().setContent('')
      expect(useEditorStore.getState().isDirty).toBe(true)
    })
  })

  describe('setFilePath', () => {
    it('updates filePath', () => {
      useEditorStore.getState().setFilePath('/home/user/doc.tex')
      expect(useEditorStore.getState().filePath).toBe('/home/user/doc.tex')
    })

    it('can set filePath to null', () => {
      useEditorStore.getState().setFilePath('/some/file.tex')
      useEditorStore.getState().setFilePath(null)
      expect(useEditorStore.getState().filePath).toBeNull()
    })
  })

  describe('setDirty', () => {
    it('sets isDirty to true', () => {
      useEditorStore.getState().setDirty(true)
      expect(useEditorStore.getState().isDirty).toBe(true)
    })

    it('sets isDirty to false', () => {
      useEditorStore.getState().setDirty(true)
      useEditorStore.getState().setDirty(false)
      expect(useEditorStore.getState().isDirty).toBe(false)
    })
  })

  describe('setCompileStatus', () => {
    it('updates compileStatus to compiling', () => {
      useCompileStore.getState().setCompileStatus('compiling')
      expect(useCompileStore.getState().compileStatus).toBe('compiling')
    })

    it('updates compileStatus to success', () => {
      useCompileStore.getState().setCompileStatus('success')
      expect(useCompileStore.getState().compileStatus).toBe('success')
    })

    it('updates compileStatus to error', () => {
      useCompileStore.getState().setCompileStatus('error')
      expect(useCompileStore.getState().compileStatus).toBe('error')
    })

    it('updates compileStatus to idle', () => {
      useCompileStore.getState().setCompileStatus('compiling')
      useCompileStore.getState().setCompileStatus('idle')
      expect(useCompileStore.getState().compileStatus).toBe('idle')
    })
  })

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
  })

  describe('clearLogs', () => {
    it('resets logs to empty string', () => {
      useCompileStore.setState({ logs: 'some logs here' })
      useCompileStore.getState().clearLogs()
      expect(useCompileStore.getState().logs).toBe('')
    })
  })

  describe('toggleLogPanel', () => {
    it('flips isLogPanelOpen from false to true', () => {
      useCompileStore.getState().toggleLogPanel()
      expect(useCompileStore.getState().isLogPanelOpen).toBe(true)
    })

    it('flips isLogPanelOpen from true to false', () => {
      useCompileStore.setState({ isLogPanelOpen: true })
      useCompileStore.getState().toggleLogPanel()
      expect(useCompileStore.getState().isLogPanelOpen).toBe(false)
    })
  })

  describe('setLogPanelOpen', () => {
    it('sets isLogPanelOpen directly', () => {
      useCompileStore.getState().setLogPanelOpen(true)
      expect(useCompileStore.getState().isLogPanelOpen).toBe(true)
    })

    it('can close log panel', () => {
      useCompileStore.setState({ isLogPanelOpen: true })
      useCompileStore.getState().setLogPanelOpen(false)
      expect(useCompileStore.getState().isLogPanelOpen).toBe(false)
    })
  })

  describe('setCursorPosition', () => {
    it('updates cursorLine and cursorColumn', () => {
      useEditorStore.getState().setCursorPosition(10, 25)
      const state = useEditorStore.getState()
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
      useCompileStore.getState().setDiagnostics(diags)
      expect(useCompileStore.getState().diagnostics).toEqual(diags)
    })

    it('can clear diagnostics with empty array', () => {
      useCompileStore.setState({
        diagnostics: [{ file: 'test.tex', line: 1, severity: 'error', message: 'err' }]
      })
      useCompileStore.getState().setDiagnostics([])
      expect(useCompileStore.getState().diagnostics).toEqual([])
    })
  })

  describe('setLogViewMode', () => {
    it('sets mode to raw', () => {
      useCompileStore.getState().setLogViewMode('raw')
      expect(useCompileStore.getState().logViewMode).toBe('raw')
    })

    it('sets mode to structured', () => {
      useCompileStore.setState({ logViewMode: 'raw' })
      useCompileStore.getState().setLogViewMode('structured')
      expect(useCompileStore.getState().logViewMode).toBe('structured')
    })
  })

  describe('requestJumpToLine', () => {
    it('sets pendingJump with line and column', () => {
      useEditorStore.getState().requestJumpToLine(42, 8)
      expect(useEditorStore.getState().pendingJump).toEqual({ line: 42, column: 8 })
    })
  })

  describe('clearPendingJump', () => {
    it('sets pendingJump to null', () => {
      useEditorStore.setState({ pendingJump: { line: 10, column: 1 } })
      useEditorStore.getState().clearPendingJump()
      expect(useEditorStore.getState().pendingJump).toBeNull()
    })
  })

  describe('setSynctexHighlight', () => {
    it('sets highlight with timestamp', () => {
      const before = Date.now()
      usePdfStore.getState().setSynctexHighlight({ page: 1, x: 100, y: 200 })
      const after = Date.now()
      const highlight = usePdfStore.getState().synctexHighlight
      expect(highlight).not.toBeNull()
      expect(highlight!.page).toBe(1)
      expect(highlight!.x).toBe(100)
      expect(highlight!.y).toBe(200)
      expect(highlight!.timestamp).toBeGreaterThanOrEqual(before)
      expect(highlight!.timestamp).toBeLessThanOrEqual(after)
    })

    it('sets highlight to null', () => {
      usePdfStore.getState().setSynctexHighlight({ page: 1, x: 0, y: 0 })
      usePdfStore.getState().setSynctexHighlight(null)
      expect(usePdfStore.getState().synctexHighlight).toBeNull()
    })
  })

  describe('setSplitRatio', () => {
    it('updates splitRatio', () => {
      usePdfStore.getState().setSplitRatio(0.7)
      expect(usePdfStore.getState().splitRatio).toBe(0.7)
    })
  })

  describe('setZoomLevel', () => {
    it('sets zoom level', () => {
      usePdfStore.getState().setZoomLevel(150)
      expect(usePdfStore.getState().zoomLevel).toBe(150)
    })

    it('clamps zoom level to minimum of 25', () => {
      usePdfStore.getState().setZoomLevel(10)
      expect(usePdfStore.getState().zoomLevel).toBe(25)
    })

    it('clamps zoom level to maximum of 400', () => {
      usePdfStore.getState().setZoomLevel(500)
      expect(usePdfStore.getState().zoomLevel).toBe(400)
    })
  })

  describe('zoomIn', () => {
    it('increases zoom by 25', () => {
      usePdfStore.getState().zoomIn()
      expect(usePdfStore.getState().zoomLevel).toBe(125)
    })

    it('does not exceed maximum of 400', () => {
      usePdfStore.setState({ zoomLevel: 400 })
      usePdfStore.getState().zoomIn()
      expect(usePdfStore.getState().zoomLevel).toBe(400)
    })
  })

  describe('zoomOut', () => {
    it('decreases zoom by 25', () => {
      usePdfStore.getState().zoomOut()
      expect(usePdfStore.getState().zoomLevel).toBe(75)
    })

    it('does not go below minimum of 25', () => {
      usePdfStore.setState({ zoomLevel: 25 })
      usePdfStore.getState().zoomOut()
      expect(usePdfStore.getState().zoomLevel).toBe(25)
    })
  })

  describe('resetZoom', () => {
    it('resets zoom to 100', () => {
      usePdfStore.setState({ zoomLevel: 250 })
      usePdfStore.getState().resetZoom()
      expect(usePdfStore.getState().zoomLevel).toBe(100)
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
      useUiStore.getState().setDocumentSymbols(symbols)
      expect(useUiStore.getState().documentSymbols).toEqual(symbols)
    })

    it('can clear document symbols with empty array', () => {
      useUiStore.getState().setDocumentSymbols([
        {
          name: 'Test',
          detail: '',
          kind: 3,
          range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
          selectionRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
          children: []
        }
      ])
      useUiStore.getState().setDocumentSymbols([])
      expect(useUiStore.getState().documentSymbols).toEqual([])
    })
  })

  describe('openFileInTab', () => {
    it('opens a new file and sets it as active', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      const state = useEditorStore.getState()
      expect(state.activeFilePath).toBe('/path/a.tex')
      expect(state.filePath).toBe('/path/a.tex')
      expect(state.content).toBe('content A')
      expect(state.isDirty).toBe(false)
      expect(state.openFiles['/path/a.tex']).toBeDefined()
      expect(state.openFiles['/path/a.tex'].content).toBe('content A')
    })

    it('refreshes content when reopening an already-open file', () => {
      // Open file with original content
      useEditorStore.getState().openFileInTab('/path/a.tex', 'original content')
      // Edit it
      useEditorStore.getState().setContent('edited content')
      expect(useEditorStore.getState().openFiles['/path/a.tex'].content).toBe('edited content')

      // Reopen with fresh content from disk
      useEditorStore.getState().openFileInTab('/path/a.tex', 'fresh from disk')
      const state = useEditorStore.getState()
      expect(state.content).toBe('fresh from disk')
      expect(state.openFiles['/path/a.tex'].content).toBe('fresh from disk')
      expect(state.isDirty).toBe(false)
    })

    it('preserves cursor position when reopening an already-open file', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content')
      useEditorStore.getState().setCursorPosition(10, 5)
      // Simulate cursor being saved in openFiles via setActiveTab flow
      useEditorStore.setState({
        openFiles: {
          '/path/a.tex': { content: 'content', isDirty: false, cursorLine: 10, cursorColumn: 5 }
        }
      })

      useEditorStore.getState().openFileInTab('/path/a.tex', 'refreshed')
      const state = useEditorStore.getState()
      expect(state.content).toBe('refreshed')
      expect(state.cursorLine).toBe(10)
      expect(state.cursorColumn).toBe(5)
    })

    it('does not corrupt other open files when opening a new file', () => {
      // Open file A
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')

      // Open file B — this should NOT overwrite A's content
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')
      const state = useEditorStore.getState()
      expect(state.activeFilePath).toBe('/path/b.tex')
      expect(state.content).toBe('content B')
      expect(state.openFiles['/path/a.tex'].content).toBe('content A')
      expect(state.openFiles['/path/b.tex'].content).toBe('content B')
    })
  })

  describe('setActiveTab', () => {
    it('persists current content when switching tabs', () => {
      // Open file A and edit it
      useEditorStore.getState().openFileInTab('/path/a.tex', 'original A')
      useEditorStore.getState().setContent('edited A')

      // Open file B
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Switch back to A — the edited content should be preserved
      useEditorStore.getState().setActiveTab('/path/a.tex')
      const state = useEditorStore.getState()
      expect(state.activeFilePath).toBe('/path/a.tex')
      expect(state.content).toBe('edited A')
      expect(state.openFiles['/path/a.tex'].content).toBe('edited A')
    })

    it('saves content of current tab before switching away', () => {
      // Open two files
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Edit B
      useEditorStore.getState().setContent('edited B')

      // Switch to A — B's edited content should be saved in openFiles
      useEditorStore.getState().setActiveTab('/path/a.tex')
      expect(useEditorStore.getState().openFiles['/path/b.tex'].content).toBe('edited B')
    })

    it('preserves cursor position across tab switches', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      useEditorStore.getState().setCursorPosition(15, 8)

      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')
      useEditorStore.getState().setCursorPosition(3, 12)

      // Switch back to A
      useEditorStore.getState().setActiveTab('/path/a.tex')
      expect(useEditorStore.getState().cursorLine).toBe(15)
      expect(useEditorStore.getState().cursorColumn).toBe(8)

      // Switch back to B
      useEditorStore.getState().setActiveTab('/path/b.tex')
      expect(useEditorStore.getState().cursorLine).toBe(3)
      expect(useEditorStore.getState().cursorColumn).toBe(12)
    })
  })

  describe('setContent with multi-file', () => {
    it('updates only the active file in openFiles', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Edit B (the active file)
      useEditorStore.getState().setContent('modified B')

      const state = useEditorStore.getState()
      expect(state.openFiles['/path/b.tex'].content).toBe('modified B')
      expect(state.openFiles['/path/a.tex'].content).toBe('content A')
    })
  })

  describe('updateSetting', () => {
    it('updates user info settings', () => {
      useSettingsStore.getState().updateSetting('name', 'John Doe')
      useSettingsStore.getState().updateSetting('email', 'john@example.com')
      useSettingsStore.getState().updateSetting('affiliation', 'OpenAI')

      const settings = useSettingsStore.getState().settings
      expect(settings.name).toBe('John Doe')
      expect(settings.email).toBe('john@example.com')
      expect(settings.affiliation).toBe('OpenAI')
    })

    it('updates other settings', () => {
      useSettingsStore.getState().updateSetting('fontSize', 20)
      expect(useSettingsStore.getState().settings.fontSize).toBe(20)
    })
  })
})
