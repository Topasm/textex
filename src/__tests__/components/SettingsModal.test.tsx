import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../../renderer/components/SettingsModal'
import { getDesktopCapabilities } from '../../renderer/platform/capabilities'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ settings: createDefaultUserSettings() })
  })

  it('renders settings tabs according to the Tauri capability manifest', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Integrations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Automation' })).toBeInTheDocument()
    const aiTab = screen.queryByRole('button', { name: 'AI' })
    if (getDesktopCapabilities().ai) expect(aiTab).toBeInTheDocument()
    else expect(aiTab).not.toBeInTheDocument()
  })

  it('switches tabs and updates a persisted setting', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(useSettingsStore.getState().settings.theme).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'Automation' }))
    expect(screen.getByText('Auto Compile')).toBeInTheDocument()
    const languageServer = screen.queryByText('Language Server')
    if (getDesktopCapabilities().lsp) expect(languageServer).toBeInTheDocument()
    else expect(languageServer).not.toBeInTheDocument()
  })

  it('renders and configures the native AI settings flow', async () => {
    vi.mocked(window.api.aiHasApiKey).mockResolvedValue(false)
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('heading', { name: 'AI Assistant' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))

    expect(useSettingsStore.getState().settings.aiEnabled).toBe(true)
    expect(useSettingsStore.getState().settings.aiProvider).toBe('openai')
    await waitFor(() => expect(window.api.aiHasApiKey).toHaveBeenCalledWith('openai'))
    expect(screen.getByText('API Key')).toBeInTheDocument()
  })

  it('closes from the close button and overlay', () => {
    const onClose = vi.fn()
    const { container } = render(<SettingsModal onClose={onClose} />)

    fireEvent.click(container.querySelector('.close-button') as HTMLButtonElement)
    fireEvent.click(container.querySelector('.modal-overlay') as HTMLDivElement)

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
