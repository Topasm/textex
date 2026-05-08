import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPane } from '../../renderer/components/TerminalPane'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'

// xterm.js requires DOM measurement APIs that jsdom does not provide.
vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    cols = 80
    rows = 24
    onData = vi.fn()
    onResize = vi.fn()
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    attachCustomKeyEventHandler = vi.fn()
  }
  return { Terminal: FakeTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  return {
    FitAddon: class {
      fit = vi.fn()
    }
  }
})

vi.mock('@xterm/addon-web-links', () => {
  return { WebLinksAddon: class {} }
})

vi.mock('@xterm/addon-webgl', () => {
  return {
    WebglAddon: class {
      onContextLoss = vi.fn()
      dispose = vi.fn()
    }
  }
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

describe('TerminalPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    useEditorStore.setState({
      filePath: '/projects/paper/main.tex',
      content: '\\section{Intro}',
      isDirty: false,
      openFiles: {},
      activeFilePath: '/projects/paper/main.tex',
      cursorLine: 1,
      cursorColumn: 1,
      pendingJump: null,
      pendingInsertText: null,
      _sessionOpenPaths: [],
      _sessionActiveFile: null
    })
    useUiStore.setState({ isTerminalPaneOpen: true })
    window.api.ptyCreate = vi.fn().mockResolvedValue({ id: 'pty-1' })
    window.api.ptyWrite = vi.fn().mockResolvedValue({ success: true })
    window.api.ptyResize = vi.fn().mockResolvedValue({ success: true })
    window.api.ptyDispose = vi.fn().mockResolvedValue({ success: true })
    window.api.onPtyData = vi.fn().mockReturnValue(() => {})
    window.api.onPtyExit = vi.fn().mockReturnValue(() => {})
  })

  it('starts a PTY session for the working directory on mount', async () => {
    render(<TerminalPane />)
    await waitFor(() => {
      expect(window.api.ptyCreate).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/projects/paper' })
      )
    })
  })

  it('restarts the shell when the restart button is clicked', async () => {
    const user = userEvent.setup()
    render(<TerminalPane />)
    await waitFor(() => {
      expect(window.api.ptyCreate).toHaveBeenCalledTimes(1)
    })
    await user.click(screen.getByRole('button', { name: /Restart shell/i }))
    await waitFor(() => {
      expect(window.api.ptyCreate).toHaveBeenCalledTimes(2)
    })
  })

  it('closes the terminal pane', async () => {
    const user = userEvent.setup()
    render(<TerminalPane />)
    await user.click(screen.getByRole('button', { name: /Close terminal pane/i }))
    expect(useUiStore.getState().isTerminalPaneOpen).toBe(false)
  })
})
