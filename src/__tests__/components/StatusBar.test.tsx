import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBar from '../../renderer/components/StatusBar'
import { useAppStore } from '../../renderer/store/useAppStore'

beforeEach(() => {
  useAppStore.setState({
    compileStatus: 'idle',
    cursorLine: 1,
    cursorColumn: 1,
    diagnostics: []
  })
})

describe('StatusBar', () => {
  it('renders cursor position', () => {
    useAppStore.setState({ cursorLine: 5, cursorColumn: 10 })
    render(<StatusBar />)
    expect(screen.getByText(/Ln 5/)).toBeInTheDocument()
    expect(screen.getByText(/Col 10/)).toBeInTheDocument()
  })

  it('renders Ready label when idle', () => {
    useAppStore.setState({ compileStatus: 'idle' })
    render(<StatusBar />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('renders Compiling... label when compiling', () => {
    useAppStore.setState({ compileStatus: 'compiling' })
    render(<StatusBar />)
    expect(screen.getByText('Compiling...')).toBeInTheDocument()
  })

  it('renders Success label on success', () => {
    useAppStore.setState({ compileStatus: 'success' })
    render(<StatusBar />)
    expect(screen.getByText('Success')).toBeInTheDocument()
  })

  it('renders Error label on error', () => {
    useAppStore.setState({ compileStatus: 'error' })
    render(<StatusBar />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('renders error and warning counts', () => {
    useAppStore.setState({
      diagnostics: [
        { file: 'test.tex', line: 1, severity: 'error', message: 'err1' },
        { file: 'test.tex', line: 2, severity: 'error', message: 'err2' },
        { file: 'test.tex', line: 3, severity: 'warning', message: 'warn1' }
      ]
    })
    const { container } = render(<StatusBar />)
    const errSpan = container.querySelector('.status-errors')
    const warnSpan = container.querySelector('.status-warnings')
    expect(errSpan).not.toBeNull()
    expect(errSpan!.textContent).toContain('2')
    expect(warnSpan).not.toBeNull()
    expect(warnSpan!.textContent).toContain('1')
  })

  it('does not render diagnostic counts when there are none', () => {
    useAppStore.setState({ diagnostics: [] })
    const { container } = render(<StatusBar />)
    expect(container.querySelector('.status-diagnostics')).toBeNull()
  })
})
