import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../renderer/App'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

vi.mock('../../renderer/components/Toolbar', () => ({
  default: ({ onAiDraft }: { onAiDraft: () => void }) => (
    <button onClick={() => onAiDraft()}>Open AI Draft</button>
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
  SettingsModal: () => null
}))

vi.mock('../../renderer/components/DraftModal', () => ({
  DraftModal: ({
    isOpen,
    onInsert
  }: {
    isOpen: boolean
    onInsert: (latex: string) => void
  }) => (isOpen ? <button onClick={() => onInsert('generated latex')}>Insert Draft</button> : null)
}))

vi.mock('../../renderer/components/TemplateGallery', () => ({
  default: () => null
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
  useKeyboardShortcuts: () => {}
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
  openProject: vi.fn()
}))

vi.mock('../../renderer/lsp/lspClient', () => ({
  stopLspClient: vi.fn()
}))

describe('App AI Draft flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      setContent: vi.fn()
    }))
  })

  it('routes AI Draft insertion through cursor insertion instead of replacing the document', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Open AI Draft'))
    fireEvent.click(await screen.findByText('Insert Draft'))

    expect(useEditorStore.getState().requestInsertAtCursor).toHaveBeenCalledWith('generated latex')
    expect(useEditorStore.getState().setContent).not.toHaveBeenCalled()
  })
})
