import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BibEntryCard } from '../../renderer/components/bib/BibEntryCard'
import type { BibEntry } from '../../shared/types'

const entry: BibEntry = {
  key: 'zhang2025laps',
  type: 'article',
  title: 'Latent Action Primitive Segmentation',
  author: 'Zhang, Jiajie and Schwertfeger, Sören',
  year: '2025'
}

function renderCard(overrides: Partial<Parameters<typeof BibEntryCard>[0]> = {}) {
  const onInsert = vi.fn()
  const onAddToChat = vi.fn()
  render(
    <BibEntryCard entry={entry} onInsert={onInsert} onAddToChat={onAddToChat} {...overrides} />
  )
  return { onInsert, onAddToChat }
}

describe('BibEntryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('never cites from a click on the card body', () => {
    const { onInsert } = renderCard()
    const card = screen.getByText('Latent Action Primitive Segmentation').closest('.bib-entry')

    fireEvent.click(card!)
    fireEvent.keyDown(card!, { key: 'Enter' })
    fireEvent.keyDown(card!, { key: ' ' })

    expect(onInsert).not.toHaveBeenCalled()
  })

  it('cites from the explicit action button', () => {
    const { onInsert } = renderCard()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Insert a citation for Latent Action Primitive Segmentation'
      })
    )

    expect(onInsert).toHaveBeenCalledWith('\\cite{zhang2025laps}')
  })

  it('offers the same actions from a right-click as the References list does', () => {
    const onRemove = vi.fn()
    const { onInsert, onAddToChat } = renderCard({ onRemove })
    const card = screen.getByText('Latent Action Primitive Segmentation').closest('.bib-entry')

    fireEvent.contextMenu(card!, { clientX: 12, clientY: 20 })
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Insert citation' }))
    expect(onInsert).toHaveBeenCalledWith('\\cite{zhang2025laps}')

    fireEvent.contextMenu(card!, { clientX: 12, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Chat' }))
    expect(onAddToChat).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'project', citekey: 'zhang2025laps' })
    )

    fireEvent.contextMenu(card!, { clientX: 12, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from group' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
