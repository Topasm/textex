import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiTab } from '../../renderer/components/settings/AiTab'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('AiTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.api.aiHasApiKey = vi.fn().mockResolvedValue(false)
    window.api.aiCheckCli = vi.fn().mockResolvedValue({ available: false })
    window.api.aiCheckCodexCli = vi.fn().mockResolvedValue({ available: false })
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        aiEnabled: true,
        aiProvider: 'openai',
        aiModel: ''
      }
    }))
  })

  it('shows an inline error when checking for an existing API key fails', async () => {
    window.api.aiHasApiKey = vi.fn().mockRejectedValue(new Error('lookup failed'))

    render(<AiTab />)

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't verify whether an API key is already saved.")
      ).toBeInTheDocument()
    })
  })

  it('shows an inline error when saving the API key fails', async () => {
    window.api.aiHasApiKey = vi.fn().mockResolvedValue(false)
    window.api.aiSaveApiKey = vi.fn().mockRejectedValue(new Error('save failed'))

    render(<AiTab />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test-key' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to save API key. Try again.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('checks cloud and local connections together without changing the default target', async () => {
    window.api.aiHasApiKey = vi
      .fn()
      .mockImplementation((provider: string) => Promise.resolve(provider === 'anthropic'))
    window.api.aiCheckCli = vi.fn().mockResolvedValue({
      available: true,
      version: 'claude 1.0.0'
    })
    window.api.aiCheckCodexCli = vi.fn().mockResolvedValue({ available: false })

    render(<AiTab />)

    await waitFor(() => {
      expect(window.api.aiHasApiKey).toHaveBeenCalledTimes(3)
      expect(window.api.aiCheckCli).toHaveBeenCalledTimes(1)
      expect(window.api.aiCheckCodexCli).toHaveBeenCalledTimes(1)
    })

    expect(useSettingsStore.getState().settings.aiProvider).toBe('openai')
    expect(screen.getByRole('button', { name: /Claude Code \(CLI\).*Ready/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Codex \(CLI\).*Not installed/ })).toBeInTheDocument()
  })

  it('shows the CLI runtime failure instead of reporting it as merely not installed', async () => {
    window.api.aiCheckCodexCli = vi.fn().mockResolvedValue({
      available: false,
      error: '/usr/bin/env: node: No such file or directory'
    })

    render(<AiTab />)

    fireEvent.click(await screen.findByRole('button', { name: /Codex \(CLI\).*Check failed/ }))

    expect(screen.getByText('/usr/bin/env: node: No such file or directory')).toBeInTheDocument()
  })

  it('changes the default execution target independently from provider connections', async () => {
    render(<AiTab />)

    fireEvent.change(screen.getByLabelText('Provider and model'), {
      target: { value: 'codex-cli:gpt-5.6-sol' }
    })

    expect(useSettingsStore.getState().settings.aiProvider).toBe('codex-cli')
    expect(useSettingsStore.getState().settings.aiModel).toBe('gpt-5.6-sol')
    expect(window.api.aiSaveApiKey).not.toHaveBeenCalled()
  })
})
