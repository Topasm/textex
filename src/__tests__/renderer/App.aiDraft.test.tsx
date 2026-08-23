import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../renderer/App'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useUiStore } from '../../renderer/store/useUiStore'

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

vi.mock('../../renderer/components/EditorPane', () => ({
  default: () => <div data-testid="editor-pane" />
}))

vi.mock('../../renderer/components/PreviewPane', () => ({
  default: () => null
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

vi.mock('../../renderer/lsp/lspClient', () => ({
  stopLspClient: vi.fn()
}))

describe('App AI Draft flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shortcutHarness.openCommandPalette = null
    useUiStore.getState().setTemplateGalleryOpen(false)
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
    const featureModal = document.createElement('div')
    featureModal.className = 'table-editor-overlay'
    document.body.appendChild(featureModal)

    fireEvent.click(screen.getByText('Open Settings'))
    expect(screen.queryByRole('dialog', { name: 'Mock Settings' })).not.toBeInTheDocument()

    await act(async () => {
      featureModal.remove()
      await Promise.resolve()
    })
    act(() => shortcutHarness.openCommandPalette?.())
    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument()

    const asyncFeatureModal = document.createElement('div')
    asyncFeatureModal.className = 'bibliography-registration-overlay modal-overlay'
    document.body.appendChild(asyncFeatureModal)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    })
    asyncFeatureModal.remove()
  })
})
