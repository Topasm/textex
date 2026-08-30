import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HelpCenter } from '../../renderer/components/HelpCenter'
import i18n from '../../renderer/i18n'
import { useLearningStore } from '../../renderer/store/useLearningStore'

const FULL_CONTEXT = { document: true, pdf: true, project: true }

beforeEach(async () => {
  await i18n.changeLanguage('en')
  useLearningStore.setState({ dismissedHintIds: [], completedTourItemIds: [] })
  vi.useRealTimers()
})

describe('HelpCenter', () => {
  it('opens on a requested section and searches the full learning catalog', () => {
    const { container } = render(
      <HelpCenter
        initialSection="gestures"
        context={FULL_CONTEXT}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )

    expect(container.querySelector('[data-app-page="help"]')).toHaveClass('app-page', 'help-center')
    expect(container.querySelector('.modal-overlay')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gestures and navigation' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'TeX/PDF and Markdown/render pair' })
    ).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Zotero' } })

    expect(screen.getByRole('heading', { name: 'Search results' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Search Citations' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Turn PDF pages' })).not.toBeInTheDocument()
  })

  it('explains missing context instead of exposing an inert action', () => {
    render(
      <HelpCenter
        initialSection="quick-start"
        context={{ document: false, pdf: false, project: false }}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )

    const compileCard = screen.getByRole('heading', { name: 'Compile Document' }).closest('article')
    expect(compileCard).not.toBeNull()
    expect(within(compileCard!).getByRole('button', { name: 'Not available yet' })).toBeDisabled()
    expect(within(compileCard!).getByRole('button')).toHaveAttribute(
      'title',
      'Open a document first'
    )
  })

  it('renders app and renderer shortcuts from their canonical manifests', () => {
    render(
      <HelpCenter
        initialSection="shortcuts"
        context={FULL_CONTEXT}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )

    expect(screen.getByText('Command Palette')).toBeInTheDocument()
    expect(screen.getByText('Increase editor font size')).toBeInTheDocument()
    const helpCommandRow = screen
      .getByText('Open TextEx Guide')
      .closest<HTMLElement>('.help-shortcut-row')
    expect(helpCommandRow).not.toBeNull()
    expect(within(helpCommandRow!).getByText('F1')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'F1' } })
    expect(document.querySelector('.help-results-count')).toHaveTextContent('Results: 1')
    expect(screen.getByText('Open TextEx Guide')).toBeInTheDocument()
  })

  it('clears an active search before Escape closes the guide', () => {
    const onClose = vi.fn()
    render(
      <HelpCenter
        initialSection="quick-start"
        context={FULL_CONTEXT}
        onClose={onClose}
        onRunCommand={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog')
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'no matching feature' } })

    expect(document.querySelector('.help-results-count')).toHaveTextContent('Results: 0')
    expect(screen.getByText('No matching guide entries were found.')).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(onClose).not.toHaveBeenCalled()

    screen.getByRole('button', { name: 'Close TextEx guide' }).focus()
    fireEvent.keyDown(dialog, { key: 'f', ctrlKey: true })
    expect(search).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('returns to Settings through visible and browser-style back navigation', () => {
    const onBack = vi.fn()
    const view = render(
      <HelpCenter
        initialSection="quick-start"
        context={FULL_CONTEXT}
        onBack={onBack}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(onBack).toHaveBeenCalledOnce()

    view.rerender(
      <HelpCenter
        initialSection="quick-start"
        context={FULL_CONTEXT}
        onBack={onBack}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft', altKey: true })
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('supports directional keyboard navigation between guide sections', () => {
    render(
      <HelpCenter
        initialSection="quick-start"
        context={FULL_CONTEXT}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )

    const quickStart = screen.getByRole('button', { name: 'Quick start' })
    quickStart.focus()
    fireEvent.keyDown(quickStart, { key: 'ArrowDown' })

    expect(screen.getByRole('button', { name: 'Gestures and navigation' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Gestures and navigation' })).toBeInTheDocument()
  })

  it('closes before dispatching a command from the guide', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onRunCommand = vi.fn()
    render(
      <HelpCenter
        initialSection="gestures"
        context={FULL_CONTEXT}
        onClose={onClose}
        onRunCommand={onRunCommand}
      />
    )

    const pairedCard = screen
      .getByRole('heading', { name: 'TeX/PDF and Markdown/render pair' })
      .closest('article')
    fireEvent.click(within(pairedCard!).getByRole('button', { name: 'Try it' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onRunCommand).not.toHaveBeenCalled()
    await act(async () => vi.runOnlyPendingTimers())
    expect(onRunCommand).toHaveBeenCalledWith('view.toggleProse')
  })

  it('persists manual tour progress and can reset it', async () => {
    render(
      <HelpCenter
        initialSection="tour"
        context={FULL_CONTEXT}
        onClose={vi.fn()}
        onRunCommand={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Edit the marked sentence/ }))
    await waitFor(() =>
      expect(useLearningStore.getState().completedTourItemIds).toContain('tour-edit')
    )
    expect(screen.getByText('1 of 7 steps complete')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset tour progress' }))
    expect(useLearningStore.getState().completedTourItemIds).toEqual([])
  })
})
