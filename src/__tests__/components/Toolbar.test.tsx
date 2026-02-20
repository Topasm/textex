import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Toolbar from '../../renderer/components/Toolbar'
import { useAppStore } from '../../renderer/store/useAppStore'

const defaultProps = {
  onOpen: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onCompile: vi.fn(),
  onToggleLog: vi.fn(),
  onOpenFolder: vi.fn(),
  onReturnHome: vi.fn(),
  onNewFromTemplate: vi.fn(),
  onAiDraft: vi.fn(),
  onExport: vi.fn(),
  onOpenSettings: vi.fn()
}

beforeEach(() => {
  useAppStore.setState({
    filePath: null,
    isDirty: false,
    compileStatus: 'idle'
  })
  vi.clearAllMocks()
})

describe('Toolbar', () => {
  it('renders fixed action buttons', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByTitle(/File operations/)).toBeInTheDocument()
    expect(screen.getByTitle(/Quick Save/)).toBeInTheDocument()
    expect(screen.getByTitle(/Compile LaTeX/)).toBeInTheDocument()
    expect(screen.getByTitle(/Toggle log/)).toBeInTheDocument()
    // PDF controls
    expect(screen.getByTitle(/Sync PDF to Code/)).toBeInTheDocument()
    expect(screen.getByTitle(/Sync Code to PDF/)).toBeInTheDocument()
    expect(screen.getByTitle(/Zoom level/)).toBeInTheDocument()
  })

  it('shows file menu items when File is clicked', async () => {
    render(<Toolbar {...defaultProps} />)
    const fileBtn = screen.getByTitle(/File operations/)
    fireEvent.click(fileBtn)

    // Wait for buttons to appear and find the specific one
    const buttons = await screen.findAllByRole('button')
    const openBtn = buttons.find(
      (b) => b.textContent?.includes('Open') && b.textContent?.includes('Ctrl+O')
    )
    expect(openBtn).toBeInTheDocument()

    expect(screen.getByText(/Open Folder/)).toBeInTheDocument()
    expect(screen.getByText(/Save As/)).toBeInTheDocument()
    expect(screen.getByText(/New from Template/)).toBeInTheDocument()
    expect(screen.getByText(/Export/i)).toBeInTheDocument()
  })

  it('shows Untitled when no file is open', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })
  // ...
  it('calls onOpen when Open button is clicked in menu', async () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/File operations/))
    // Use findAllByRole to match button with specific text content spanning multiple nodes
    const buttons = await screen.findAllByRole('button')
    const openBtn = buttons.find(
      (b) => b.textContent?.includes('Open') && b.textContent?.includes('Ctrl+O')
    )

    if (!openBtn) throw new Error('Open button not found')
    fireEvent.click(openBtn)
    expect(defaultProps.onOpen).toHaveBeenCalledOnce()
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

  it('shows OmniSearch with default citations mode', () => {
    useAppStore.setState({ projectRoot: '/test' })
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search citations...')).toBeInTheDocument()
  })

  it('OmniSearch is always visible regardless of zoteroEnabled setting', () => {
    useAppStore.setState({
      projectRoot: '/test',
      settings: { ...useAppStore.getState().settings, zoteroEnabled: false }
    })
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search citations...')).toBeInTheDocument()
  })

  it('hides PDF toolbar controls when showPdfToolbarControls is false', () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, showPdfToolbarControls: false }
    })
    render(<Toolbar {...defaultProps} />)
    expect(screen.queryByTitle(/Sync PDF to Code/)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Sync Code to PDF/)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Zoom level/)).not.toBeInTheDocument()
  })
})
