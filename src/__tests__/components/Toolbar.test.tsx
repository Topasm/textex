import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Toolbar from '../../renderer/components/Toolbar'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

vi.mock('../../renderer/components/OmniSearch', () => ({
  OmniSearch: () => <div data-testid="omni-search-mock">Search citations...</div>
}))

const defaultProps = {
  onSave: vi.fn(),
  onCompile: vi.fn(),
  onToggleLog: vi.fn(),
  onOpenFolder: vi.fn(),
  onReturnHome: vi.fn(),
  onNewFromTemplate: vi.fn(),
  onAiDraft: vi.fn(),
  onOpenSettings: vi.fn()
}

beforeEach(() => {
  useEditorStore.setState({
    filePath: null,
    isDirty: false
  })
  useCompileStore.setState({
    compileStatus: 'idle'
  })
  vi.clearAllMocks()
})

describe('Toolbar', () => {
  it('renders the slim document toolbar actions', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByTitle(/Quick Save/)).toBeInTheDocument()
    expect(screen.getByTitle(/Compile LaTeX/)).toBeInTheDocument()
    expect(screen.getByTitle(/Toggle log/)).toBeInTheDocument()
    expect(screen.getByTitle(/Sync PDF to Code/)).toBeInTheDocument()
    expect(screen.getByTitle(/Sync Code to PDF/)).toBeInTheDocument()
    expect(screen.getByTitle(/Zoom level/)).toBeInTheDocument()
  })

  it('does not render the old file operations dropdown', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.queryByTitle(/File operations/)).not.toBeInTheDocument()
  })

  it('shows Untitled when no file is open', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onSave when Quick Save button is clicked', () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Quick Save/))
    expect(defaultProps.onSave).toHaveBeenCalledOnce()
  })

  it('calls onCompile when Compile button is clicked', () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Compile LaTeX/))
    expect(defaultProps.onCompile).toHaveBeenCalledOnce()
  })

  it('opens AI Draft without passing the click event as a prompt', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        aiEnabled: true,
        aiProvider: 'openai'
      }
    })

    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/AI Draft/))
    expect(defaultProps.onAiDraft).toHaveBeenCalledWith()
  })

  it('shows OmniSearch with default citations mode', () => {
    useProjectStore.setState({ projectRoot: '/test' })
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByTestId('omni-search-mock')).toHaveTextContent('Search citations...')
  })

  it('shows the return home button only when a project is open', () => {
    useProjectStore.setState({ projectRoot: '/test' })
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByTitle('Return to home screen')).toBeInTheDocument()
  })

  it('OmniSearch is always visible regardless of zoteroEnabled setting', () => {
    useProjectStore.setState({ projectRoot: '/test' })
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, zoteroEnabled: false }
    })
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByTestId('omni-search-mock')).toHaveTextContent('Search citations...')
  })

  it('hides PDF toolbar controls when showPdfToolbarControls is false', () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, showPdfToolbarControls: false }
    })
    render(<Toolbar {...defaultProps} />)
    expect(screen.queryByTitle(/Sync PDF to Code/)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Sync Code to PDF/)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Zoom level/)).not.toBeInTheDocument()
  })
})
