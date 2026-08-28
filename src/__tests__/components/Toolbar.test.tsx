import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Toolbar from '../../renderer/components/Toolbar'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

vi.mock('../../renderer/components/OmniSearch', () => ({
  OmniSearch: () => <div data-testid="omni-search-mock">Search citations...</div>
}))

const defaultProps = {
  onSave: vi.fn(),
  onCompile: vi.fn(),
  onOpenFolder: vi.fn(),
  onReturnHome: vi.fn(),
  onNewFromTemplate: vi.fn(),
  onAiDraft: vi.fn(),
  onRunCommand: vi.fn(),
  onOpenCommandPalette: vi.fn(),
  onOpenSettings: vi.fn()
}

beforeEach(() => {
  document.documentElement.dataset.platform = 'linux'
  useEditorStore.setState({
    filePath: null,
    isDirty: false
  })
  useCompileStore.setState({
    compileStatus: 'idle'
  })
  useProjectStore.setState({
    projectRoot: null
  })
  usePdfStore.setState({
    zoomLevel: 100,
    currentPage: 1,
    numPages: 0,
    fitRequest: null
  })
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      aiEnabled: false,
      aiProvider: '',
      showPdfToolbarControls: true
    }
  })
  vi.clearAllMocks()
})

afterEach(() => {
  delete document.documentElement.dataset.platform
})

describe('Toolbar', () => {
  it('renders the slim document toolbar actions', () => {
    const { container } = render(<Toolbar {...defaultProps} />)
    expect(screen.getByTitle(/Quick Save/)).toBeInTheDocument()
    expect(screen.getByTitle(/Compile LaTeX/)).toBeInTheDocument()
    expect(screen.queryByTitle(/Toggle log/)).not.toBeInTheDocument()
    expect(screen.getByTitle(/Sync PDF to Code/)).toBeInTheDocument()
    expect(screen.getByTitle(/Sync Code to PDF/)).toBeInTheDocument()
    expect(screen.getByTitle(/Zoom level/)).toBeInTheDocument()
    expect(container.querySelector('.toolbar-center')).toHaveAttribute(
      'data-responsive-priority',
      'secondary'
    )
    expect(container.querySelector('.toolbar-pdf-controls')).toHaveAttribute(
      'data-responsive-priority',
      'compact'
    )
    expect(container.querySelector('.file-name')).toHaveAttribute(
      'data-responsive-priority',
      'tertiary'
    )

    const pdfToCode = screen.getByRole('button', { name: /Sync PDF to Code/ })
    const codeToPdf = screen.getByRole('button', { name: /Sync Code to PDF/ })
    expect(pdfToCode.querySelector('.lucide-arrow-left')).toHaveAttribute('aria-hidden', 'true')
    expect(codeToPdf.querySelector('.lucide-arrow-right')).toHaveAttribute('aria-hidden', 'true')
    expect(pdfToCode).not.toHaveTextContent('\u2190')
    expect(codeToPdf).not.toHaveTextContent('\u2192')
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
    useEditorStore.setState({ filePath: '/project/main.tex' })
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Quick Save/))
    expect(defaultProps.onSave).toHaveBeenCalledOnce()
  })

  it('calls onCompile when Compile button is clicked', () => {
    useEditorStore.setState({ filePath: '/project/main.tex' })
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Compile LaTeX/))
    expect(defaultProps.onCompile).toHaveBeenCalledOnce()
  })

  it('opens the command palette from the custom app-menu affordance', () => {
    render(<Toolbar {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open app menu' }))

    expect(defaultProps.onOpenCommandPalette).toHaveBeenCalledOnce()
  })

  it('routes custom window controls through the typed desktop boundary', () => {
    render(<Toolbar {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }))
    fireEvent.click(screen.getByRole('button', { name: 'Maximize or restore window' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))

    expect(window.api.minimizeWindow).toHaveBeenCalledOnce()
    expect(window.api.toggleMaximizeWindow).toHaveBeenCalledOnce()
    expect(window.api.requestWindowClose).toHaveBeenCalledOnce()
  })

  it('uses one typed drag path for structural space without hijacking interactive controls', () => {
    const { container } = render(<Toolbar {...defaultProps} />)
    const searchSlot = container.querySelector('.toolbar-search-slot')
    const save = screen.getByRole('button', { name: /Quick Save/ })

    expect(container.querySelector('[data-tauri-drag-region]')).not.toBeInTheDocument()

    fireEvent.mouseDown(searchSlot!, { button: 0, detail: 1 })
    expect(window.api.startWindowDragging).toHaveBeenCalledOnce()

    fireEvent.mouseDown(save, { button: 0, detail: 1 })
    expect(window.api.startWindowDragging).toHaveBeenCalledOnce()

    fireEvent.mouseDown(searchSlot!, { button: 0, detail: 2 })
    expect(window.api.toggleMaximizeWindow).toHaveBeenCalledOnce()
  })

  it('exposes all eight frameless resize directions', () => {
    const { container } = render(<Toolbar {...defaultProps} />)

    expect(container.querySelectorAll('.window-resize-handle')).toHaveLength(8)
    fireEvent.mouseDown(container.querySelector('.window-resize-handle-south-east')!, {
      button: 0
    })

    expect(window.api.startWindowResize).toHaveBeenCalledWith('SouthEast')
  })

  it('keeps native macOS traffic lights and omits custom window chrome', () => {
    document.documentElement.dataset.platform = 'darwin'

    const { container } = render(<Toolbar {...defaultProps} />)

    expect(container.querySelector('.toolbar')).toHaveAttribute(
      'data-custom-window-chrome',
      'false'
    )
    expect(screen.queryByRole('button', { name: 'Open app menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Minimize window' })).not.toBeInTheDocument()
    expect(container.querySelector('.window-resize-handles')).not.toBeInTheDocument()
  })

  it('keeps AI and workspace tools out of the document toolbar', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        aiEnabled: true,
        aiProvider: 'openai'
      }
    })

    render(<Toolbar {...defaultProps} />)

    expect(screen.queryByTitle(/AI Assistant/)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Terminal pane/)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Toggle log/)).not.toBeInTheDocument()
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

  it('offers an accessible left-sidebar toggle for an open project', () => {
    useProjectStore.setState({ projectRoot: '/test', isSidebarOpen: false })
    render(<Toolbar {...defaultProps} />)

    const toggle = screen.getByRole('button', { name: 'Toggle Sidebar' })
    expect(toggle).toHaveAttribute('aria-controls', 'project-sidebar')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)

    expect(useProjectStore.getState().isSidebarOpen).toBe(true)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveClass('active')
  })

  it('disables document actions until their required document output exists', () => {
    render(<Toolbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /Quick Save/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Compile LaTeX/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Sync PDF to Code/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Sync Code to PDF/ })).toBeDisabled()
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

  it('renders fractional zoom values as integer percentages', () => {
    usePdfStore.setState({ zoomLevel: 92.00965826511386 })

    render(<Toolbar {...defaultProps} />)

    expect(screen.getByTitle(/Zoom level/)).toHaveTextContent('92%')
  })

  it('highlights the rounded preset when opening the zoom dropdown', () => {
    usePdfStore.setState({ zoomLevel: 99.6 })

    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Zoom level/))

    const presetButtons = screen.getAllByRole('button', { name: '100%' })
    expect(presetButtons.some((button) => button.classList.contains('zoom-preset-active'))).toBe(
      true
    )
  })

  it('teaches each accelerator in the control tooltip', () => {
    render(<Toolbar {...defaultProps} />)

    // The label stays free of key names so it reads correctly on every
    // platform; the tooltip adds the binding the manifest actually holds.
    const save = screen.getByRole('button', { name: 'Quick Save' })
    expect(save).toHaveAttribute('title', 'Quick Save (Ctrl+S)')
    expect(screen.getByRole('button', { name: 'Compile LaTeX' })).toHaveAttribute(
      'title',
      'Compile LaTeX (Ctrl+Enter)'
    )
    expect(screen.getByRole('button', { name: 'Open app menu' })).toHaveAttribute(
      'title',
      'Open app menu (Ctrl+Shift+P)'
    )
  })
})
