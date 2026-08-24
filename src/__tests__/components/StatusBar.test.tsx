import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBar from '../../renderer/components/StatusBar'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'

beforeEach(() => {
  useCompileStore.setState({
    compileStatus: 'idle',
    diagnostics: []
  })
  useEditorStore.setState({
    cursorLine: 1,
    cursorColumn: 1
  })
})

describe('StatusBar', () => {
  it('renders cursor position', () => {
    useEditorStore.setState({ cursorLine: 5, cursorColumn: 10 })
    render(<StatusBar />)
    const cursor = screen.getByText(/Ln 5/)
    expect(cursor).toHaveTextContent(/Col 10/)
    expect(cursor).toHaveAttribute('data-responsive-priority', 'primary')
  })

  it('renders Ready label when idle', () => {
    useCompileStore.setState({ compileStatus: 'idle' })
    render(<StatusBar />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('renders Compiling... label when compiling', () => {
    useCompileStore.setState({ compileStatus: 'compiling' })
    render(<StatusBar />)
    expect(screen.getByText('Compiling...')).toBeInTheDocument()
  })

  it('renders Success label on success', () => {
    useCompileStore.setState({ compileStatus: 'success' })
    render(<StatusBar />)
    expect(screen.getByText('Success')).toBeInTheDocument()
  })

  it('renders Error label on error', () => {
    useCompileStore.setState({ compileStatus: 'error' })
    render(<StatusBar />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('renders error and warning counts', () => {
    useCompileStore.setState({
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
    expect(errSpan!.querySelector('.lucide-circle-x')).toHaveAttribute('aria-hidden', 'true')
    expect(warnSpan!.querySelector('.lucide-triangle-alert')).toHaveAttribute('aria-hidden', 'true')
    expect(errSpan).not.toHaveTextContent('\u2716')
    expect(warnSpan).not.toHaveTextContent('\u26a0')
  })

  it('does not render diagnostic counts when there are none', () => {
    useCompileStore.setState({ diagnostics: [] })
    const { container } = render(<StatusBar />)
    expect(container.querySelector('.status-diagnostics')).toBeNull()
  })

  it('marks optional status controls as compact-layout secondary content', () => {
    const { container } = render(<StatusBar />)

    expect(container.querySelector('.status-compile-indicator')).toHaveAttribute(
      'data-responsive-priority',
      'primary'
    )
    expect(container.querySelector('.status-spellcheck')).toHaveAttribute(
      'data-responsive-priority',
      'secondary'
    )
  })
})
