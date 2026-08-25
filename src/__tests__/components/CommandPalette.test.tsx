import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, formatCommandShortcut } from '../../renderer/components/CommandPalette'
import i18n from '../../renderer/i18n'

describe('CommandPalette', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('exposes an accessible combobox with all Tauri commands', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} onRunCommand={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Command Palette' })
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    const options = screen.getAllByRole('option')

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Create AI Draft/ })).toBeInTheDocument()
  })

  it('searches metadata and runs the selected manifest command through its callback', () => {
    const onClose = vi.fn()
    const onRunCommand = vi.fn()
    render(<CommandPalette isOpen onClose={onClose} onRunCommand={onRunCommand} />)

    const input = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'release' } })

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'Check for Updates' })).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onRunCommand).toHaveBeenCalledWith('app.checkUpdates')
  })

  it('exposes context-dependent commands without running unavailable actions', () => {
    const onRunCommand = vi.fn()
    render(
      <CommandPalette
        isOpen
        onClose={vi.fn()}
        onRunCommand={onRunCommand}
        context={{ document: false, pdf: false, project: false }}
      />
    )

    const saveCommand = screen.getByRole('option', { name: 'Save File' })
    const openCommand = screen.getByRole('option', { name: 'Open File' })
    const terminalCommand = screen.getByRole('option', { name: 'Open Project in Terminal' })
    expect(saveCommand).toHaveAttribute('aria-disabled', 'true')
    expect(saveCommand).toHaveTextContent('Open a document first')
    expect(openCommand).toHaveAttribute('aria-disabled', 'false')
    expect(terminalCommand).toHaveAttribute('aria-disabled', 'true')
    expect(terminalCommand).toHaveTextContent('Open a project first')

    fireEvent.click(saveCommand)
    expect(onRunCommand).not.toHaveBeenCalled()
  })

  it('supports active-descendant navigation, Escape, focus trapping, and focus restore', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open palette'
    document.body.appendChild(opener)
    opener.focus()

    const onClose = vi.fn()
    const view = render(<CommandPalette isOpen onClose={onClose} onRunCommand={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    const closeButton = screen.getByRole('button', { name: 'Close command palette' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    closeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(input).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('announces an empty result set', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} onRunCommand={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'definitely-not-a-command' }
    })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('No matching commands')
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant')
  })
})

describe('formatCommandShortcut', () => {
  it('formats the platform modifier without renderer dependencies', () => {
    expect(formatCommandShortcut({ key: 'p', mod: true, shift: true }, false)).toBe('Ctrl+Shift+P')
    expect(formatCommandShortcut({ key: 'p', mod: true, shift: true }, true)).toBe('⌘⇧P')
  })
})
