import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CrashRecoveryDialog } from '../../renderer/components/CrashRecoveryDialog'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('CrashRecoveryDialog', () => {
  const item = {
    id: 'b'.repeat(64),
    filePath: '/project/main.tex',
    capturedAtEpochMs: 1_700_000_000_000,
    size: 15,
    diskState: 'modified' as const
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useProjectStore.getState().setProjectRoot('/project')
    vi.mocked(window.api.listRecoverySnapshots).mockResolvedValue([item])
    vi.mocked(window.api.loadRecoverySnapshot).mockResolvedValue({
      item,
      content: 'recovered draft',
      diskContent: 'disk version'
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('compares and restores a snapshot without writing the source file', async () => {
    render(<CrashRecoveryDialog enabled />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(await screen.findByText('disk version')).toBeInTheDocument()
    expect(screen.getByText('recovered draft')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(documentRegistry.snapshot(item.filePath)?.text).toBe('recovered draft')
    expect(documentRegistry.getModel(item.filePath)?.isDirty).toBe(true)
    expect(window.api.saveFile).not.toHaveBeenCalled()
    expect(window.api.discardRecoverySnapshot).not.toHaveBeenCalled()
  })

  it('traps focus, blocks Escape, and restores focus after a decision', async () => {
    const background = document.createElement('button')
    background.textContent = 'Background action'
    document.body.append(background)
    background.focus()
    vi.mocked(window.api.discardRecoverySnapshot).mockResolvedValue(undefined)

    render(<CrashRecoveryDialog enabled />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const recover = screen.getByRole('button', { name: 'Recover' })
    recover.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(document.activeElement).not.toBe(recover)

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(background).toHaveFocus()
    background.remove()
  })
})
