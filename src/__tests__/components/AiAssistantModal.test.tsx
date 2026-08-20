import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiAssistantModal } from '../../renderer/components/AiAssistantModal'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('AiAssistantModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/projects/paper/main.tex', '\\section{Intro}')
    window.api.aiCheckCli = vi.fn().mockResolvedValue(true)
    window.api.aiCheckCodexCli = vi.fn().mockResolvedValue(true)
    window.api.aiOpenClaudeTerminal = vi.fn().mockResolvedValue({
      success: true,
      workDir: '/projects/paper',
      command: "cd '/projects/paper' && claude"
    })
    window.api.aiOpenCodexTerminal = vi.fn().mockResolvedValue({
      success: true,
      workDir: '/projects/paper',
      command: "cd '/projects/paper' && codex"
    })
  })

  it('opens Claude Code from the current project directory', async () => {
    const user = userEvent.setup()
    render(<AiAssistantModal isOpen onClose={vi.fn()} onAiDraft={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open Claude Code' }))

    await waitFor(() => {
      expect(window.api.aiCheckCli).toHaveBeenCalled()
      expect(window.api.aiOpenClaudeTerminal).toHaveBeenCalledWith({
        workDir: '/projects/paper',
        resume: false
      })
    })
    expect(screen.getByText('Claude Code opened in an external terminal.')).toBeInTheDocument()
  })

  it('opens Claude Code with resume mode', async () => {
    const user = userEvent.setup()
    render(<AiAssistantModal isOpen onClose={vi.fn()} onAiDraft={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Resume Claude Code' }))

    await waitFor(() => {
      expect(window.api.aiOpenClaudeTerminal).toHaveBeenCalledWith({
        workDir: '/projects/paper',
        resume: true
      })
    })
  })

  it('opens Codex CLI from the current project directory', async () => {
    const user = userEvent.setup()
    render(<AiAssistantModal isOpen onClose={vi.fn()} onAiDraft={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open Codex CLI' }))

    await waitFor(() => {
      expect(window.api.aiCheckCodexCli).toHaveBeenCalled()
      expect(window.api.aiOpenCodexTerminal).toHaveBeenCalledWith({
        workDir: '/projects/paper',
        resume: false
      })
    })
    expect(screen.getByText('Codex CLI opened in an external terminal.')).toBeInTheDocument()
  })

  it('opens Codex CLI with resume mode', async () => {
    const user = userEvent.setup()
    render(<AiAssistantModal isOpen onClose={vi.fn()} onAiDraft={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Resume Codex CLI' }))

    await waitFor(() => {
      expect(window.api.aiOpenCodexTerminal).toHaveBeenCalledWith({
        workDir: '/projects/paper',
        resume: true
      })
    })
  })

  it('shows the manual command when Claude CLI is unavailable', async () => {
    const user = userEvent.setup()
    window.api.aiCheckCli = vi.fn().mockResolvedValue(false)
    render(<AiAssistantModal isOpen onClose={vi.fn()} onAiDraft={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open Claude Code' }))

    await waitFor(() => {
      expect(screen.getByText(/Claude Code was not found/)).toBeInTheDocument()
    })
    expect(screen.getByText("cd '/projects/paper' && claude")).toBeInTheDocument()
    expect(window.api.aiOpenClaudeTerminal).not.toHaveBeenCalled()
  })

  it('keeps AI Draft accessible from the assistant', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onAiDraft = vi.fn()
    render(<AiAssistantModal isOpen onClose={onClose} onAiDraft={onAiDraft} />)

    await user.click(screen.getByRole('button', { name: 'Open AI Draft' }))

    expect(onClose).toHaveBeenCalled()
    expect(onAiDraft).toHaveBeenCalled()
  })
})
