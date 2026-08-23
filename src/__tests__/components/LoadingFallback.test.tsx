import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingFallback } from '../../renderer/components/LoadingFallback'

describe('LoadingFallback', () => {
  it('announces contextual loading state and exposes the requested layout', () => {
    render(<LoadingFallback variant="modal" label="Loading settings…" />)

    const status = screen.getByRole('status', { name: 'Loading settings…' })
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveClass('loading-fallback--modal')
  })

  it('keeps compact floating feedback free of decorative skeleton rows', () => {
    const { container } = render(
      <LoadingFallback variant="floating" label="Loading math preview…" />
    )

    expect(screen.getByRole('status')).toHaveClass('loading-fallback--floating')
    expect(container.querySelector('.loading-fallback__skeleton')).not.toBeInTheDocument()
  })
})
