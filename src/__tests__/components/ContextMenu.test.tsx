import { StrictMode } from 'react'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('native ContextMenu', () => {
  const original = window.api.showContextMenu
  let select: (id: string) => void
  let signal: AbortSignal | undefined
  let open = vi.fn<typeof window.api.showContextMenu>()
  beforeEach(() => {
    open = vi.fn<typeof window.api.showContextMenu>(async (_request, callback, abortSignal) => {
      select = callback
      signal = abortSignal
    })
    window.api.showContextMenu = open
  })
  afterEach(() => {
    window.api.showContextMenu = original
    vi.restoreAllMocks()
  })

  it('runs a delayed OS activation once without showing a second HTML menu', async () => {
    const run = vi.fn(),
      close = vi.fn()
    render(
      <ContextMenu anchor={{ x: 12, y: 24 }} items={items(run)} label="Actions" onClose={close} />
    )
    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    act(() => {
      select('open')
      select('cite')
      select('cite')
    })
    expect(run).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('ignores stale choices after unmount or a project round trip', async () => {
    const run = vi.fn()
    const root = useProjectStore.getState().projectRoot
    const view = render(
      <ContextMenu anchor={{ x: 12, y: 24 }} items={items(run)} label="Actions" onClose={vi.fn()} />
    )
    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    act(() => {
      useProjectStore.setState({ projectRoot: '/another-project' })
      useProjectStore.setState({ projectRoot: root })
      select('cite')
    })
    expect(signal?.aborted).toBe(true)
    view.unmount()
    act(() => select('cite'))
    expect(run).not.toHaveBeenCalled()
  })

  it('opens only once under StrictMode and checks the latest disabled state', async () => {
    const run = vi.fn(),
      close = vi.fn(),
      anchor = { x: 1, y: 2 }
    const view = render(
      <StrictMode>
        <ContextMenu anchor={anchor} items={items(run)} label="Actions" onClose={close} />
      </StrictMode>
    )
    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    view.rerender(
      <StrictMode>
        <ContextMenu
          anchor={anchor}
          items={items(run).map((item) => ({ ...item, disabled: true }))}
          label="Actions"
          onClose={close}
        />
      </StrictMode>
    )
    act(() => select('cite'))
    expect(run).not.toHaveBeenCalled()
  })

  it('clears the previous owner when another row opens a menu', async () => {
    const close = vi.fn(),
      run = vi.fn()
    render(<ContextMenu anchor={{ x: 1, y: 2 }} items={items(run)} label="First" onClose={close} />)
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    const previousSelect = select
    render(<ContextMenu anchor={{ x: 3, y: 4 }} items={items()} label="Second" onClose={vi.fn()} />)
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    expect(close).toHaveBeenCalledExactlyOnceWith(false)
    act(() => previousSelect('cite'))
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps actions reachable when the native popup cannot open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    open.mockRejectedValue(new Error('Native menu unavailable'))
    render(
      <ContextMenu anchor={{ x: 1, y: 2 }} items={items()} label="Actions" onClose={vi.fn()} />
    )
    expect(await screen.findByRole('menu', { name: 'Actions' })).toBeInTheDocument()
    expect(open).toHaveBeenCalledOnce()
  })
})
