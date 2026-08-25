import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModalCloseButton, ModalFrame } from '../../renderer/components/ui/ModalChrome'

describe('ModalChrome', () => {
  it('provides shared dialog semantics and only closes from the backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalFrame owner="settings" titleId="shared-modal-title" onClose={onClose}>
        <h2 id="shared-modal-title">Shared modal</h2>
        <button type="button">Action</button>
      </ModalFrame>
    )

    const dialog = screen.getByRole('dialog', { name: 'Shared modal' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(container.querySelector('.modal-overlay')).toHaveAttribute(
      'data-app-overlay-owner',
      'settings'
    )

    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    const overlay = container.querySelector('.modal-overlay')
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uses the shared localized close label', () => {
    render(<ModalCloseButton onClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAccessibleName()
  })
})
