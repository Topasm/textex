import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  onAiAssistant: vi.fn(),
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
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Quick Save/))
    expect(defaultProps.onSave).toHaveBeenCalledOnce()
  })

  it('calls onCompile when Compile button is clicked', () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Compile LaTeX/))
    expect(defaultProps.onCompile).toHaveBeenCalledOnce()
  })

  it('keeps AI access but moves workspace tools out of the document toolbar', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        aiEnabled: true,
        aiProvider: 'openai'
      }
    })

    render(<Toolbar {...defaultProps} />)

    expect(screen.getByTitle(/AI Assistant/)).toHaveAttribute(
      'data-responsive-priority',
      'secondary'
    )
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
})
