import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ReferenceEvidence } from '../../renderer/components/research/ReferenceEvidence'

it('labels abstracts as unverified context and opens the original source', () => {
  vi.mocked(window.api.openExternal).mockResolvedValue({ success: true })
  render(<ReferenceEvidence abstract="The observed result." url="https://example.org/paper" />)
  expect(screen.getByText(/Abstract context only/)).toBeVisible()
  expect(screen.getByText('The observed result.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Check original source' }))
  expect(window.api.openExternal).toHaveBeenCalledWith('https://example.org/paper')
})
it('does not present metadata as full-text evidence or expose unsafe URL schemes', () => {
  render(<ReferenceEvidence url="javascript:alert(1)" />)
  expect(screen.getByText(/Bibliographic metadata only/)).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
