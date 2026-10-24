import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../../renderer/components/SettingsModal'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import { useLearningStore } from '../../renderer/store/useLearningStore'

const highlightedText = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('mark.settings-search-match')).map(
    (mark) => mark.textContent ?? ''
  )

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

  it('renders three settings tabs with summaries', () => {
    const { container } = render(<SettingsModal onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(container.querySelector('[data-app-page="settings"]')).toHaveClass(
      'app-page',
      'settings-page'
    )
    expect(container.querySelector('.modal-overlay')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Settings' })).toHaveClass('settings-sidebar')
    expect(screen.getByRole('button', { name: 'General & Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editor & Compiler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI & Integrations' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Automation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Integrations' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Typography, editing behavior, compiler, and spell check')
    ).toBeInTheDocument()
    expect(screen.getByText(`TextEx v${__APP_VERSION__}`)).toBeInTheDocument()
    expect(screen.queryByText('Build 2026')).not.toBeInTheDocument()
  })

  it('frames the page as a mode with a way back beside the close button', () => {
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Back to workspace' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows appearance and compiler settings inside the merged tabs', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Application' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Editor & Compiler' }))
    expect(screen.getByRole('heading', { name: 'Typography' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Compiler & Tools' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI & Integrations' }))
    expect(screen.getByRole('heading', { name: 'AI Assistant' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zotero Integration' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Git Integration' })).toBeInTheDocument()
  })

  it('searches localized setting copy and filters categories', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    const search = screen.getByRole('searchbox', { name: 'Search settings' })
    fireEvent.change(search, { target: { value: 'Zotero' } })

    expect(screen.getByRole('button', { name: 'AI & Integrations' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.queryByRole('button', { name: 'General & Appearance' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zotero Integration' })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'setting that does not exist' } })
    const emptyState = screen.getByRole('status')
    expect(emptyState).toHaveTextContent('No settings found')
    fireEvent.click(within(emptyState).getByRole('button', { name: 'Clear settings search' }))
    expect(screen.getByRole('button', { name: 'General & Appearance' })).toBeInTheDocument()
  })

  it('filters to matching rows and highlights the matched words', () => {
    const { container } = render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
      target: { value: 'word wrap' }
    })

    expect(screen.getByRole('button', { name: 'Editor & Compiler' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      screen.getByText('Showing settings that match “word wrap”. Press Escape to show everything.')
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Word Wrap' })).toBeVisible()
    expect(screen.queryByRole('switch', { name: 'Line Numbers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Auto Compile' })).not.toBeInTheDocument()
    expect(highlightedText(container)).toEqual(expect.arrayContaining(['Word', 'Wrap']))

    // Sections without a surviving row fold away; the one holding the match stays.
    expect(screen.getByText('Behavior')).toBeVisible()
    expect(screen.getByText('Typography')).not.toBeVisible()
    expect(screen.getByText('Compiler & Tools')).not.toBeVisible()
  })

  it('shows every row of a section whose own title matches', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
      target: { value: 'typography' }
    })

    expect(screen.getByText('Typography')).toBeVisible()
    expect(screen.getByLabelText('Font Size')).toBeVisible()
    expect(screen.getByLabelText('Tab Size')).toBeVisible()
    expect(screen.queryByRole('switch', { name: 'Word Wrap' })).not.toBeInTheDocument()
  })

  it('keeps a disabled integration reachable when the search hits its hidden options', () => {
    const { container } = render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
      target: { value: 'port number' }
    })

    // "support files" and "Line Numbers" keep the editor tab listed too; the
    // tab filter is only a secondary effect, so pick the integrations tab.
    fireEvent.click(screen.getByRole('button', { name: 'AI & Integrations' }))
    const zotero = screen.getByRole('switch', { name: 'Zotero Integration' })
    expect(zotero).toBeVisible()
    expect(screen.queryByLabelText('Port Number')).not.toBeInTheDocument()
    expect(screen.getByText('Git Integration')).not.toBeVisible()

    fireEvent.click(zotero)
    expect(screen.getByLabelText('Port Number')).toBeVisible()
    expect(highlightedText(container)).toEqual(['Port', 'Number'])
    expect(screen.queryByText('Collection sync')).not.toBeInTheDocument()
  })

  it('matches across accents and keeps the tab filter as a secondary effect', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    const search = screen.getByRole('searchbox', { name: 'Search settings' })
    fireEvent.change(search, { target: { value: 'auto' } })

    expect(screen.getByRole('button', { name: 'General & Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editor & Compiler' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Automatically check for updates' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Editor & Compiler' }))
    expect(screen.getByRole('switch', { name: 'Auto Compile' })).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Auto-hide Sidebar' })).toBeVisible()
    expect(screen.queryByRole('switch', { name: 'Vim Mode' })).not.toBeInTheDocument()
  })

  it('switches tabs and updates a persisted setting', () => {
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(useSettingsStore.getState().settings.theme).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'Editor & Compiler' }))
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
    vi.mocked(window.api.aiCheckCli).mockResolvedValue({ available: false })
    vi.mocked(window.api.aiCheckCodexCli).mockResolvedValue({ available: false })
    render(<SettingsModal onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'AI & Integrations' }))
    expect(screen.getByRole('heading', { name: 'AI Assistant' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'AI Assistant' }))
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
    expect(screen.getByRole('button', { name: 'General & Appearance' })).toHaveFocus()

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    const first = focusable[0]
    const last = focusable.at(-1)
    expect(first).toBeDefined()
    expect(last).toBeDefined()

    first?.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    last?.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()

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
