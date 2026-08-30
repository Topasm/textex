import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../../renderer/components/SettingsModal'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import { useLearningStore } from '../../renderer/store/useLearningStore'

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.saveSettings).mockResolvedValue(createDefaultUserSettings())
    useSettingsStore.setState({ settings: createDefaultUserSettings() })
    useUiStore.setState({
      updateStatus: 'idle',
      updateMetadata: null,
      updateProgress: null,
      updateError: '',
      updateErrorAction: null,
      helpRequestedSection: null
    })
    useLearningStore.setState({ dismissedHintIds: [], completedTourItemIds: [] })
  })

  it('renders the Tauri settings tabs', () => {
    const { container } = render(<SettingsModal onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(container.querySelector('[data-app-page="settings"]')).toHaveClass(
      'app-page',
      'settings-page'
    )
    expect(container.querySelector('.modal-overlay')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Settings' })).toHaveClass('settings-sidebar')
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Integrations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Automation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI' })).toBeInTheDocument()
    expect(screen.getByText(`TextEx v${__APP_VERSION__}`)).toBeInTheDocument()
    expect(screen.queryByText('Build 2026')).not.toBeInTheDocument()
  })

  it('searches localized setting copy and filters categories', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    const search = screen.getByRole('searchbox', { name: 'Search settings' })
    fireEvent.change(search, { target: { value: 'Zotero' } })

    expect(screen.getByRole('button', { name: 'Integrations' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.queryByRole('button', { name: 'General' })).not.toBeInTheDocument()
    expect(screen.getByText('Zotero Integration')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'setting that does not exist' } })
    const emptyState = screen.getByRole('status')
    expect(emptyState).toHaveTextContent('No settings found')
    fireEvent.click(within(emptyState).getByRole('button', { name: 'Clear settings search' }))
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument()
  })

  it('switches tabs and updates a persisted setting', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(useSettingsStore.getState().settings.theme).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'Automation' }))
    expect(screen.getByText('Auto Compile')).toBeInTheDocument()
    const compilerEngine = screen.getByRole('combobox', { name: 'Compiler engine' })
    fireEvent.change(compilerEngine, { target: { value: 'pdf-latex' } })
    expect(useSettingsStore.getState().settings.latexEngine).toBe('pdf-latex')
    expect(screen.getByText(/Use system latexmk in pdfLaTeX mode/)).toBeInTheDocument()
    expect(screen.queryByText('Language Server')).not.toBeInTheDocument()
  })

  it('opens the in-app guide and restores dismissed feature hints', () => {
    useLearningStore.setState({ dismissedHintIds: ['workspace-pair-swipe'] })
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open guide' }))
    expect(useUiStore.getState().helpRequestedSection).toBe('quick-start')

    fireEvent.click(screen.getByRole('button', { name: 'Reset hints' }))
    expect(useLearningStore.getState().dismissedHintIds).toEqual([])
  })

  it('renders and configures the native AI settings flow', async () => {
    vi.mocked(window.api.aiHasApiKey).mockResolvedValue(false)
    vi.mocked(window.api.aiCheckCli).mockResolvedValue(false)
    vi.mocked(window.api.aiCheckCodexCli).mockResolvedValue(false)
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('heading', { name: 'AI Assistant' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider and model' }), {
      target: { value: 'openai:gpt-5.4' }
    })

    expect(useSettingsStore.getState().settings.aiEnabled).toBe(true)
    expect(useSettingsStore.getState().settings.aiProvider).toBe('openai')
    expect(useSettingsStore.getState().settings.aiModel).toBe('gpt-5.4')
    await waitFor(() => expect(window.api.aiHasApiKey).toHaveBeenCalledWith('openai'))
    const openAiConnection = await screen.findByRole('button', {
      name: /OpenAI.*API key required/
    })
    fireEvent.click(openAiConnection)
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()
  })

  it('closes from the close button without backdrop dismissal', () => {
    const onClose = vi.fn()
    const { container } = render(<SettingsModal onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(container.querySelector('.settings-content') as HTMLElement)

    expect(onClose).toHaveBeenCalledOnce()
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
    const search = screen.getByRole('searchbox', { name: 'Search settings' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'General' })).toHaveFocus()

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    const last = focusable.at(-1)
    expect(last).toBeDefined()

    search.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    last?.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(search).toHaveFocus()

    fireEvent.change(search, { target: { value: 'theme' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
