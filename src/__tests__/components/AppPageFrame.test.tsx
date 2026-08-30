import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppPageFrame } from '../../renderer/components/ui/AppPageFrame'

describe('AppPageFrame', () => {
  it('renders a labeled, backdrop-free workspace page', () => {
    const { container } = render(
      <AppPageFrame owner="settings" titleId="page-title" className="custom-page">
        <h1 id="page-title">Settings</h1>
      </AppPageFrame>
    )

    const page = screen.getByRole('dialog', { name: 'Settings' })
    expect(page).toHaveClass('app-page', 'custom-page')
    expect(page).toHaveAttribute('aria-modal', 'true')
    expect(page).toHaveAttribute('data-app-overlay-owner', 'settings')
    expect(container.querySelector('.modal-overlay')).not.toBeInTheDocument()
  })
})
