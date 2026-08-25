import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchPanel } from '../../renderer/components/ResearchPanel'
import { TEXTEX_REFERENCE_MIME } from '../../renderer/components/research/referenceActions'
import { clearResearchProfileDraft } from '../../renderer/services/researchProfileDraft'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

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
    useCompileStore.setState({ diagnostics: [], logs: '', logViewMode: 'structured' })
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

  it('keeps the icon-only Research navigation explicitly named', () => {
    const { container } = render(<ResearchPanel onAiDraft={vi.fn()} />)

    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('title', 'Chat')
    expect(screen.getByRole('tab', { name: 'References' })).toHaveAttribute('title', 'References')
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('title', 'Project profile')
    expect(container.querySelectorAll('.research-panel-tab-label')).toHaveLength(4)
  })

  it('keeps the Chat composer mounted while switching through References', async () => {
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })
    fireEvent.change(input, { target: { value: 'Keep this draft across tabs.' } })

    fireEvent.click(screen.getByRole('tab', { name: 'References' }))
    await screen.findByRole('region', { name: 'Reference manager items' })
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))

    expect(screen.getByRole('textbox', { name: 'Research question' })).toHaveValue(
      'Keep this draft across tabs.'
    )
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

  it('cleans up an active resize gesture when the panel unmounts', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'text'
    const { container, unmount } = render(<ResearchPanel onAiDraft={vi.fn()} />)

    fireEvent.mouseDown(container.querySelector('.research-resize-handle')!, { button: 0 })
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    unmount()

    expect(document.body.style.cursor).toBe('crosshair')
    expect(document.body.style.userSelect).toBe('text')
    expect(removeEventListener.mock.calls.some(([event]) => event === 'mousemove')).toBe(true)
    expect(removeEventListener.mock.calls.some(([event]) => event === 'mouseup')).toBe(true)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('always renders as a PDF overlay without adding a desktop backdrop', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })

    const { container, unmount } = render(<ResearchPanel onAiDraft={vi.fn()} />)

    expect(container.querySelector('.research-panel')).toHaveClass('overlay')
    expect(container.querySelector('.research-panel-backdrop')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useProjectStore.getState().isResearchPanelOpen).toBe(true)

    unmount()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth
    })
  })

  it('keeps the visible PDF interactive under a compact overlay and supports Escape', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })

    const { container, unmount } = render(<ResearchPanel onAiDraft={vi.fn()} />)

    expect(container.querySelector('.research-panel')).toHaveClass('overlay')
    expect(container.querySelector('.research-panel-backdrop')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useProjectStore.getState().isResearchPanelOpen).toBe(false)

    unmount()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth
    })
  })

  it('hosts compilation problems in the right panel without an embedded terminal', () => {
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

    const problems = screen.getByRole('tab', { name: /Problems \(2\)/ })
    expect(screen.queryByRole('button', { name: /terminal/i })).not.toBeInTheDocument()
    expect(problems).toHaveAttribute('aria-selected', 'false')
    expect(problems).toHaveTextContent('2')

    fireEvent.click(problems)

    expect(useProjectStore.getState().researchPanelTab).toBe('problems')
    expect(problems).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Compilation Log')).toBeInTheDocument()
  })

  it('exposes the unified reference manager as the References scroll region', async () => {
    useProjectStore.setState({
      researchPanelTab: 'references',
      researchReferenceSource: 'project',
      bibEntries: [
        { key: 'one', type: 'article', title: 'First paper', author: 'Ada', year: '2024' },
        { key: 'two', type: 'article', title: 'Second paper', author: 'Grace', year: '2025' }
      ]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue({
      version: 1,
      referencesFile: 'references.bib',
      zoteroFile: 'zotero.bib',
      zoteroCollection: null,
      syncOnOpen: false
    })
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    render(<ResearchPanel onAiDraft={vi.fn()} />)

    const list = await screen.findByRole('region', { name: 'Reference manager items' })
    expect(list).toHaveClass('reference-card-list')
    expect(list).toHaveAttribute('tabindex', '0')
    expect(within(list).getByText('First paper')).toBeInTheDocument()
    expect(within(list).getByText('Second paper')).toBeInTheDocument()
  })

  it('keeps Zotero search results in a dedicated scroll region', async () => {
    useProjectStore.setState({
      researchPanelTab: 'references',
      researchReferenceSource: 'zotero',
      researchSearchQuery: 'robot'
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue({
      version: 1,
      referencesFile: 'references.bib',
      zoteroFile: 'zotero.bib',
      zoteroCollection: null,
      syncOnOpen: false
    })
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    window.api.zoteroSearch = vi.fn().mockResolvedValue([
      {
        citekey: 'robot2025',
        title: 'Robot Paper',
        author: 'Ada',
        year: '2025',
        type: 'article'
      },
      {
        citekey: 'vision2026',
        title: 'Vision Paper',
        author: 'Grace',
        year: '2026',
        type: 'article'
      }
    ])
    render(<ResearchPanel onAiDraft={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Search' }))
    await waitFor(() => expect(window.api.zoteroSearch).toHaveBeenCalledWith('robot', 23_119))
    const list = screen.getByRole('region', { name: 'Local reference search results' })
    expect(list).toHaveClass('reference-card-list')
    expect(list).toHaveAttribute('tabindex', '0')
    expect(within(list).getAllByRole('article')).toHaveLength(2)
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
