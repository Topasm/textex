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
  onToggleTheme: vi.fn(),
  onNewFromTemplate: vi.fn(),
  onExport: vi.fn()
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
  it('renders all action buttons', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByTitle(/Open file/)).toBeInTheDocument()
    expect(screen.getByTitle(/Open folder/)).toBeInTheDocument()
    expect(screen.getByText(/Save As/)).toBeInTheDocument()
    expect(screen.getByText(/Compile/)).toBeInTheDocument()
    expect(screen.getByText(/Log/)).toBeInTheDocument()
    expect(screen.getByText(/Template/)).toBeInTheDocument()
    expect(screen.getByTitle(/Toggle theme/)).toBeInTheDocument()
  })

  it('shows Untitled when no file is open', () => {
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('shows file name when a file is open', () => {
    useAppStore.setState({ filePath: '/home/user/document.tex' })
    render(<Toolbar {...defaultProps} />)
    expect(screen.getByText('document.tex')).toBeInTheDocument()
  })

  it('disables compile button while compiling', () => {
    useAppStore.setState({ compileStatus: 'compiling' })
    render(<Toolbar {...defaultProps} />)
    const compileBtn = screen.getByText(/Compiling\.\.\./).closest('button')
    expect(compileBtn).toBeDisabled()
  })

  it('shows Compile text when not compiling', () => {
    render(<Toolbar {...defaultProps} />)
    const compileBtn = screen.getByText(/Compile/).closest('button')
    expect(compileBtn).not.toBeDisabled()
  })

  it('calls onOpen when Open button is clicked', () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Open file/))
    expect(defaultProps.onOpen).toHaveBeenCalledOnce()
  })

  it('calls onSave when Save button is clicked', () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Save file/))
    expect(defaultProps.onSave).toHaveBeenCalledOnce()
  })

  it('calls onCompile when Compile button is clicked', () => {
    render(<Toolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle(/Compile LaTeX/))
    expect(defaultProps.onCompile).toHaveBeenCalledOnce()
  })
})
