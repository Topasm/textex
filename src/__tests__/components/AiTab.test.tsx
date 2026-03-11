import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiTab } from '../../renderer/components/settings/AiTab'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('AiTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      expect(screen.getByText("Couldn't verify whether an API key is already saved.")).toBeInTheDocument()
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
})
