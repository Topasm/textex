import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchPanel } from '../../renderer/components/ResearchPanel'
import { TEXTEX_REFERENCE_MIME } from '../../renderer/components/research/referenceActions'
import { clearResearchProfileDraft } from '../../renderer/services/researchProfileDraft'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'

describe('ResearchPanel tabs', () => {
  beforeEach(() => {
    clearResearchProfileDraft()
    useNotificationStore.getState().clearNotifications()
    vi.restoreAllMocks()
    useProjectStore.setState({
      projectRoot: '/project',
      isResearchPanelOpen: true,
      researchPanelTab: 'chat'
    })
    useCompileStore.setState({ diagnostics: [], isLogPanelOpen: false })
    useUiStore.setState({ isTerminalPaneOpen: false })
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      version: 1,
      paper: { title: '', authors: [] },
      resources: [],
      instructions: []
    })
  })

  it('opens the project research profile from its own tab', async () => {
    render(<ResearchPanel onAiDraft={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }))

    expect(useProjectStore.getState().researchPanelTab).toBe('profile')
    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
  })

  it('does not discard an edited profile when leaving its tab is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }))
    const title = await screen.findByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Unsaved title' } })

    fireEvent.click(screen.getByRole('tab', { name: 'References' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().researchPanelTab).toBe('profile')
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved title')
  })

  it('does not close the panel while profile discard is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    useProjectStore.setState({ researchPanelTab: 'profile' })
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Unsaved title' }
    })

    const closeButtons = screen.getAllByRole('button', { name: 'Close research panel' })
    fireEvent.click(closeButtons.at(-1)!)

    expect(useProjectStore.getState().isResearchPanelOpen).toBe(true)
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'research-tab-profile')
  })

  it('does not install panel listeners while the panel is closed', () => {
    useProjectStore.setState({ isResearchPanelOpen: false })
    const addEventListener = vi.spyOn(window, 'addEventListener')

    const { container } = render(<ResearchPanel onAiDraft={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
    expect(addEventListener.mock.calls.some(([event]) => event === 'resize')).toBe(false)
    expect(addEventListener.mock.calls.some(([event]) => event === 'keydown')).toBe(false)
  })

  it('hosts terminal and compilation-log controls outside the top toolbar', () => {
    useCompileStore.setState({
      diagnostics: [
        { severity: 'error', message: 'Missing brace', file: 'paper.tex', line: 3, column: 1 },
        {
          severity: 'warning',
          message: 'Overfull box',
          file: 'paper.tex',
          line: 8,
          column: 1
        }
      ]
    })
    render(<ResearchPanel onAiDraft={vi.fn()} />)

    const terminal = screen.getByRole('button', { name: 'Terminal pane' })
    const log = screen.getByRole('button', { name: /Toggle log/ })
    expect(terminal).toHaveAttribute('aria-pressed', 'false')
    expect(log).toHaveAttribute('aria-pressed', 'false')
    expect(log).toHaveTextContent('2')

    fireEvent.click(terminal)
    fireEvent.click(log)

    expect(useUiStore.getState().isTerminalPaneOpen).toBe(true)
    expect(useCompileStore.getState().isLogPanelOpen).toBe(true)
    expect(terminal).toHaveAttribute('aria-pressed', 'true')
    expect(log).toHaveAttribute('aria-pressed', 'true')
  })

  it('accepts a reference on the Chat tab and switches only after drop', async () => {
    useProjectStore.setState({ researchPanelTab: 'references' })
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    const chatTab = screen.getByRole('tab', { name: 'Chat' })
    const payload = JSON.stringify({
      source: 'project',
      citekey: 'robot2026',
      metadata: { title: 'Robot Research' }
    })
    const dataTransfer = {
      types: [TEXTEX_REFERENCE_MIME],
      dropEffect: 'none',
      getData: (type: string) => (type === TEXTEX_REFERENCE_MIME ? payload : '')
    }

    fireEvent.dragEnter(chatTab, { dataTransfer })
    expect(chatTab).toHaveClass('drop-active')
    expect(useProjectStore.getState().researchPanelTab).toBe('references')

    fireEvent.drop(chatTab, { dataTransfer })

    expect(useProjectStore.getState().researchPanelTab).toBe('chat')
    expect(await screen.findByRole('button', { name: 'Robot Research' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByText('Added “Robot Research” to Chat context.')).toBeInTheDocument()
  })

  it('rejects an invalid Chat-tab drop without switching tabs', () => {
    useProjectStore.setState({ researchPanelTab: 'references' })
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    const chatTab = screen.getByRole('tab', { name: 'Chat' })

    fireEvent.drop(chatTab, {
      dataTransfer: { getData: () => '{not-json' }
    })

    expect(useProjectStore.getState().researchPanelTab).toBe('references')
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({
        tone: 'error',
        message: 'This item is not a valid TextEx reference.'
      })
    ])
  })

  it('does not queue a dropped reference when profile discard is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    useProjectStore.setState({ researchPanelTab: 'profile' })
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Unsaved title' }
    })

    fireEvent.drop(screen.getByRole('tab', { name: 'Chat' }), {
      dataTransfer: {
        getData: () =>
          JSON.stringify({
            source: 'project',
            citekey: 'robot2026',
            metadata: { title: 'Robot Research' }
          })
      }
    })

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().researchPanelTab).toBe('profile')
    expect(screen.queryByRole('button', { name: 'Robot Research' })).not.toBeInTheDocument()
  })
})
