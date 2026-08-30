import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../renderer/App'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { proseModeFor, useUiStore } from '../../renderer/store/useUiStore'

const shortcutHarness = vi.hoisted(() => ({ openCommandPalette: null as (() => void) | null }))

vi.mock('../../renderer/components/Toolbar', () => ({
  default: ({
    onAiDraft,
    onOpenSettings,
    onNewFromTemplate
  }: {
    onAiDraft: () => void
    onOpenSettings: () => void
    onNewFromTemplate: () => void
  }) => (
    <div>
      <button onClick={() => onAiDraft()}>Open AI Draft</button>
      <button onClick={onOpenSettings}>Open Settings</button>
      <button onClick={onNewFromTemplate}>Open Templates</button>
    </div>
  )
}))

vi.mock('../../renderer/data/monacoSetup', () => ({}))

vi.mock('../../renderer/components/EditorPane', () => ({
  default: () => <div data-testid="editor-pane" onWheel={(event) => event.stopPropagation()} />
}))

vi.mock('../../renderer/components/PreviewPane', () => ({
  default: () => <div data-testid="pdf-preview" />
}))

vi.mock('../../renderer/components/ProsePane', () => ({
  ProsePane: () => (
    <div data-testid="markdown-source" onWheel={(event) => event.stopPropagation()} />
  )
}))

vi.mock('../../renderer/components/ProsePreview', () => ({
  ProsePreview: () => (
    <div data-testid="markdown-preview" onWheel={(event) => event.stopPropagation()} />
  )
}))

vi.mock('../../renderer/components/LogPanel', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/StatusBar', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/FileTree', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/TabBar', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/BibPanel', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/OutlinePanel', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/GitPanel', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/TodoPanel', () => ({
  TodoPanel: () => null
}))

vi.mock('../../renderer/components/TimelinePanel', () => ({
  TimelinePanel: () => null
}))

vi.mock('../../renderer/components/UpdateNotification', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/PreviewErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('../../renderer/components/HomeScreen', () => ({
  default: () => null
}))

vi.mock('../../renderer/components/SettingsModal', () => ({
  SettingsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Mock Settings" data-app-overlay-owner="settings">
      <button onClick={onClose}>Close Settings</button>
    </div>
  )
}))

vi.mock('../../renderer/components/HelpCenter', () => ({
  HelpCenter: ({
    onClose,
    onBack,
    onRunCommand
  }: {
    onClose: () => void
    onBack?: () => void
    onRunCommand: (command: 'app.settings') => void
  }) => (
    <div role="dialog" aria-label="Mock Help" data-app-overlay-owner="help">
      {onBack && <button onClick={onBack}>Back to Settings</button>}
      <button
        onClick={() => {
          onClose()
          onRunCommand('app.settings')
        }}
      >
        Open Settings from Help
      </button>
    </div>
  )
}))

vi.mock('../../renderer/components/DraftModal', () => ({
  DraftModal: ({ isOpen, onInsert }: { isOpen: boolean; onInsert: (latex: string) => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="Mock AI Draft" data-app-overlay-owner="aiDraft">
        <button onClick={() => onInsert('generated latex')}>Insert Draft</button>
      </div>
    ) : null
}))

vi.mock('../../renderer/components/TemplateGallery', () => ({
  default: () => (
    <div role="dialog" aria-label="Mock Templates" data-app-overlay-owner="templateGallery" />
  )
}))

vi.mock('../../renderer/hooks/useAutoCompile', () => ({
  useAutoCompile: () => {}
}))

vi.mock('../../renderer/hooks/useFileOps', () => ({
  useFileOps: () => ({
    handleOpen: vi.fn(),
    handleSave: vi.fn(),
    handleSaveAs: vi.fn()
  })
}))

vi.mock('../../renderer/hooks/useSessionRestore', () => ({
  useSessionRestore: () => true
}))

vi.mock('../../renderer/hooks/useIpcListeners', () => ({
  useIpcListeners: () => {}
}))

vi.mock('../../renderer/hooks/useGitAutoRefresh', () => ({
  useGitAutoRefresh: () => {}
}))

vi.mock('../../renderer/hooks/useBibAutoLoad', () => ({
  useBibAutoLoad: () => {}
}))

vi.mock('../../renderer/hooks/useLspLifecycle', () => ({
  useLspLifecycle: () => {}
}))

vi.mock('../../renderer/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: ({ openCommandPalette }: { openCommandPalette: () => void }) => {
    shortcutHarness.openCommandPalette = openCommandPalette
  }
}))

vi.mock('../../renderer/hooks/useDragResize', () => ({
  useDragResize: () => ({
    mainContentRef: { current: null },
    sidebarRef: { current: null },
    handleDividerMouseDown: vi.fn(),
    handleDividerDoubleClick: vi.fn(),
    handleSidebarDividerMouseDown: vi.fn(),
    handleSidebarDividerDoubleClick: vi.fn(),
    handleSidebarWheel: vi.fn(),
    slideAnim: null
  })
}))

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: vi.fn(),
  deactivateProject: vi.fn().mockResolvedValue(true)
}))

describe('App AI Draft flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shortcutHarness.openCommandPalette = null
    useUiStore.getState().setTemplateGalleryOpen(false)
    useUiStore.setState({
      openFeatureModals: [],
      settingsRequested: false,
      helpRequestedSection: null
    })
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        aiEnabled: true,
        aiProvider: 'openai',
        showStatusBar: false
      }
    }))

    useEditorStore.setState((state) => ({
      ...state,
      requestInsertAtCursor: vi.fn(),
      updateActiveDocument: vi.fn()
    }))
  })

  it('routes AI Draft insertion through cursor insertion instead of replacing the document', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Open AI Draft'))
    fireEvent.click(await screen.findByText('Insert Draft'))

    expect(useEditorStore.getState().requestInsertAtCursor).toHaveBeenCalledWith('generated latex')
    expect(useEditorStore.getState().updateActiveDocument).not.toHaveBeenCalled()
  })

  it('registers the guarded native window close lifecycle', () => {
    const view = render(<App />)

    expect(window.api.onWindowCloseRequested).toHaveBeenCalledWith(expect.any(Function))
    view.unmount()
    expect(window.api.removeWindowCloseRequestedListener).toHaveBeenCalledOnce()
  })

  it('replaces the palette with settings and blocks the shortcut while settings owns the modal', async () => {
    render(<App />)
    expect(shortcutHarness.openCommandPalette).not.toBeNull()

    act(() => shortcutHarness.openCommandPalette?.())
    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: 'Open Settings' }))
    expect(await screen.findByRole('dialog', { name: 'Mock Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()

    act(() => shortcutHarness.openCommandPalette?.())
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
  })

  it('closes Help before dispatching a command that owns another modal', async () => {
    render(<App />)

    act(() => useUiStore.getState().requestHelp('quick-start'))
    expect(await screen.findByRole('dialog', { name: 'Mock Help' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings from Help' }))

    expect(await screen.findByRole('dialog', { name: 'Mock Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Mock Help' })).not.toBeInTheDocument()
  })

  it('returns from Guide to Settings when Settings opened it', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Open Settings'))
    expect(await screen.findByRole('dialog', { name: 'Mock Settings' })).toBeInTheDocument()

    act(() => useUiStore.getState().requestHelp('quick-start'))
    expect(await screen.findByRole('dialog', { name: 'Mock Help' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Mock Settings' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(await screen.findByRole('dialog', { name: 'Mock Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Mock Help' })).not.toBeInTheDocument()
  })

  it('does not open the palette over AI draft or template modal workflows', async () => {
    const draftView = render(<App />)
    fireEvent.click(screen.getByText('Open AI Draft'))
    expect(await screen.findByRole('dialog', { name: 'Mock AI Draft' })).toBeInTheDocument()

    act(() => shortcutHarness.openCommandPalette?.())
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    draftView.unmount()

    render(<App />)
    fireEvent.click(screen.getByText('Open Templates'))
    expect(await screen.findByRole('dialog', { name: 'Mock Templates' })).toBeInTheDocument()

    act(() => shortcutHarness.openCommandPalette?.())
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
  })

  it('blocks App modals over a feature dialog and closes a palette when one appears', async () => {
    render(<App />)
    // Feature dialogs announce themselves through the store; App no longer
    // infers them from the rendered DOM.
    act(() => useUiStore.getState().registerFeatureModal('tableEditor'))

    fireEvent.click(screen.getByText('Open Settings'))
    expect(screen.queryByRole('dialog', { name: 'Mock Settings' })).not.toBeInTheDocument()

    await act(async () => {
      useUiStore.getState().unregisterFeatureModal('tableEditor')
      await Promise.resolve()
    })
    act(() => shortcutHarness.openCommandPalette?.())
    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument()

    act(() => useUiStore.getState().registerFeatureModal('bibliographyRegistration'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    })
    act(() => useUiStore.getState().unregisterFeatureModal('bibliographyRegistration'))
  })
})

describe('App paired workspace gestures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/project', isSidebarOpen: false })
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/main.tex', 'paper')
    useUiStore.setState({ proseModeDocumentIds: [], proseAnchors: {} })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, autoHideSidebar: false, showStatusBar: false }
    }))
  })

  it('keeps PDF page swipes separate while the editor can open the Markdown pair', async () => {
    const view = render(<App />)
    const previewSurface = view.container.querySelector<HTMLElement>('.preview-pane')
    const editorSurface = view.container.querySelector<HTMLElement>('.editor-surface')

    expect(previewSurface).not.toBeNull()
    expect(editorSurface).not.toBeNull()
    expect(previewSurface).toHaveAttribute('data-workspace-view', 'pdf')
    const editorContent = await screen.findByTestId('editor-pane')

    fireEvent.wheel(previewSurface!, { deltaX: 60, deltaY: 2 })
    expect(proseModeFor(useUiStore.getState(), '/project/main.tex')).toBe(false)

    // Monaco owns wheel events and stops them during its bubble phase. The
    // workspace gesture therefore has to observe the capture phase.
    fireEvent.wheel(editorContent, { deltaX: 60, deltaY: 2 })
    await waitFor(() => {
      expect(proseModeFor(useUiStore.getState(), '/project/main.tex')).toBe(true)
    })
    expect(await screen.findByTestId('markdown-source')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
  })

  it('returns to the TeX/PDF pair from a swipe over the Markdown render', async () => {
    useUiStore.getState().setProseMode('/project/main.tex', true)
    const view = render(<App />)
    const previewSurface = view.container.querySelector<HTMLElement>('.preview-pane')

    expect(await screen.findByTestId('markdown-preview')).toBeInTheDocument()
    expect(previewSurface).toHaveAttribute('data-workspace-view', 'prose')

    fireEvent.wheel(screen.getByTestId('markdown-preview'), { deltaX: -60, deltaY: 2 })
    await waitFor(() => {
      expect(proseModeFor(useUiStore.getState(), '/project/main.tex')).toBe(false)
    })
    expect(await screen.findByTestId('pdf-preview')).toBeInTheDocument()
  })

  it('does not bounce back when the same workspace swipe has a noisy momentum tail', async () => {
    const view = render(<App />)
    const editorSurface = view.container.querySelector<HTMLElement>('.editor-surface')
    expect(editorSurface).not.toBeNull()
    await screen.findByTestId('editor-pane')

    let now = 1_000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      fireEvent.wheel(editorSurface!, { deltaX: 120, deltaY: 2 })
      expect(proseModeFor(useUiStore.getState(), '/project/main.tex')).toBe(true)
      await screen.findByTestId('markdown-source')

      // WebKit can emit a long, almost-still tail and then a larger correction
      // in the opposite direction. It is one physical gesture even though it
      // outlives the panel animation floor.
      for (let index = 0; index < 24; index += 1) {
        now += 16
        fireEvent.wheel(editorSurface!, { deltaX: 1, deltaY: 0 })
      }
      now += 16
      fireEvent.wheel(editorSurface!, { deltaX: -120, deltaY: 2 })

      expect(proseModeFor(useUiStore.getState(), '/project/main.tex')).toBe(true)
      expect(screen.getByTestId('markdown-source')).toBeInTheDocument()
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
    } finally {
      clock.mockRestore()
    }
  })
})
