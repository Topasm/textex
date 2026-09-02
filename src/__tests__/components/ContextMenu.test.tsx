import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextMenu, type ContextMenuItem } from '../../renderer/components/ui/ContextMenu'

function items(run = vi.fn()): ContextMenuItem[] {
  return [
    { id: 'cite', label: 'Insert citation', run },
    { id: 'add', label: 'Add to bibliography', run },
    { id: 'open', label: 'Open in Zotero', disabled: true, run }
  ]
}

function renderMenu(overrides: Partial<Parameters<typeof ContextMenu>[0]> = {}) {
  const onClose = vi.fn()
  const run = vi.fn()
  render(
    <ContextMenu
      anchor={{ x: 40, y: 60 }}
      items={items(run)}
      label="Reference actions"
      onClose={onClose}
      {...overrides}
    />
  )
  return { onClose, run, menu: screen.getByRole('menu', { name: 'Reference actions' }) }
}

describe('ContextMenu', () => {
  it('focuses the first enabled item when it opens', () => {
    renderMenu()

    expect(screen.getByRole('menuitem', { name: 'Insert citation' })).toHaveFocus()
  })

  it('moves focus with the arrow keys and skips disabled items', () => {
    const { menu } = renderMenu()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Add to bibliography' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Insert citation' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Add to bibliography' })).toHaveFocus()
  })

  it('runs an item once and asks for focus to return to the opener', () => {
    const { onClose, run } = renderMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Insert citation' }))

    expect(run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('closes on Escape and restores focus, but not on an outside click', () => {
    const { onClose, menu } = renderMenu()

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(true)

    onClose.mockClear()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('closes when the surface under the anchor scrolls away', () => {
    const { onClose } = renderMenu()

    fireEvent.scroll(document.body)

    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('keeps the menu inside the viewport when the cursor is near an edge', () => {
    const { menu } = renderMenu({ anchor: { x: 100_000, y: 100_000 } })

    expect(Number.parseInt(menu.style.left, 10)).toBeLessThan(window.innerWidth)
    expect(Number.parseInt(menu.style.top, 10)).toBeLessThan(window.innerHeight)
  })
})
