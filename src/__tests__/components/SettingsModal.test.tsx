import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../../renderer/components/SettingsModal'
import { getDesktopCapabilities } from '../../renderer/platform/capabilities'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useUiStore } from '../../renderer/store/useUiStore'

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ settings: createDefaultUserSettings() })
    useUiStore.setState({
      updateStatus: 'idle',
      updateMetadata: null,
      updateProgress: null,
      updateError: '',
      updateErrorAction: null
    })
  })

  it('renders settings tabs according to the Tauri capability manifest', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Settings' })).toHaveClass('settings-sidebar')
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

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(container.querySelector('.modal-overlay') as HTMLDivElement)

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps interactive update feedback and actions visible inside settings', () => {
    useUiStore.setState({ updateStatus: 'checking' })

    render(<SettingsModal onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const updateStatus = screen.getByRole('status', { name: 'Application update' })
    expect(dialog).toContainElement(updateStatus)
    expect(updateStatus).toHaveTextContent('Checking for updates')
  })

  it('labels the dialog, traps focus, closes with Escape, and restores focus', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open settings'
    document.body.appendChild(opener)
    opener.focus()

    const onClose = vi.fn()
    const view = render(<SettingsModal onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const closeButton = screen.getByRole('button', { name: 'Close' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'General' })).toHaveFocus()

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    const last = focusable.at(-1)
    expect(last).toBeDefined()

    closeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    last?.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
