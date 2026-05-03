import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPane } from '../../renderer/components/TerminalPane'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'

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
    window.api.aiCheckCli = vi.fn().mockResolvedValue(true)
    window.api.aiOpenClaudeTerminal = vi.fn().mockResolvedValue({
      success: true,
      workDir: '/projects/paper',
      command: "cd '/projects/paper' && claude"
    })
  })

  it('opens Claude Code from the docked terminal pane', async () => {
    const user = userEvent.setup()
    render(<TerminalPane />)

    await user.click(screen.getByRole('button', { name: /Claude Code/i }))

    await waitFor(() => {
      expect(window.api.aiCheckCli).toHaveBeenCalled()
      expect(window.api.aiOpenClaudeTerminal).toHaveBeenCalledWith({
        workDir: '/projects/paper',
        resume: false
      })
    })
    expect(screen.getByText('Claude Code opened.')).toBeInTheDocument()
  })

  it('opens Claude Code resume mode', async () => {
    const user = userEvent.setup()
    render(<TerminalPane />)

    await user.click(screen.getByRole('button', { name: /Resume/i }))

    await waitFor(() => {
      expect(window.api.aiOpenClaudeTerminal).toHaveBeenCalledWith({
        workDir: '/projects/paper',
        resume: true
      })
    })
  })

  it('closes the terminal pane', async () => {
    const user = userEvent.setup()
    render(<TerminalPane />)

    await user.click(screen.getByRole('button', { name: /Close terminal pane/i }))

    expect(useUiStore.getState().isTerminalPaneOpen).toBe(false)
  })
})
