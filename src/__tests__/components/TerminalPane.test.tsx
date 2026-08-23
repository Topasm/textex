import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPane } from '../../renderer/components/TerminalPane'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'

const { webLinksHandlers } = vi.hoisted(() => ({
  webLinksHandlers: [] as Array<(event: MouseEvent, uri: string) => void>
}))

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
  return {
    WebLinksAddon: class {
      constructor(handler: (event: MouseEvent, uri: string) => void) {
        webLinksHandlers.push(handler)
      }
    }
  }
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
    webLinksHandlers.length = 0
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/projects/paper/main.tex', '\\section{Intro}')
    useUiStore.setState({ isTerminalPaneOpen: true })
    window.api.ptyCreate = vi.fn().mockResolvedValue({ id: 'pty-1' })
    window.api.ptyWrite = vi.fn().mockResolvedValue({ success: true })
    window.api.ptyResize = vi.fn().mockResolvedValue({ success: true })
    window.api.ptyDispose = vi.fn().mockResolvedValue({ success: true })
    window.api.onPtyData = vi.fn().mockReturnValue(() => {})
    window.api.onPtyExit = vi.fn().mockReturnValue(() => {})
    window.api.openExternal = vi.fn().mockResolvedValue({ success: true })
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

  it('routes terminal links through the validated desktop API', async () => {
    render(<TerminalPane />)
    await waitFor(() => expect(webLinksHandlers).toHaveLength(1))

    webLinksHandlers[0](new MouseEvent('click'), 'https://example.com/paper')

    expect(window.api.openExternal).toHaveBeenCalledWith('https://example.com/paper')
  })

  it('disposes a PTY that resolves after the pane is unmounted', async () => {
    let resolveCreate: ((value: { id: string }) => void) | undefined
    window.api.ptyCreate = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveCreate = resolve
        })
    )

    const view = render(<TerminalPane />)
    await waitFor(() => expect(window.api.ptyCreate).toHaveBeenCalledOnce())
    view.unmount()
    await act(async () => resolveCreate?.({ id: 'pty-stale' }))

    await waitFor(() => expect(window.api.ptyDispose).toHaveBeenCalledWith('pty-stale'))
    expect(window.api.onPtyData).not.toHaveBeenCalled()
  })
})
