import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import { focusCollectionItem } from '../../utils/collectionFocus'
import './ContextMenu.css'

const VIEWPORT_MARGIN = 8
const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  run: () => void | Promise<void>
}

export interface ContextMenuAnchor {
  x: number
  y: number
}

interface ContextMenuProps {
  anchor: ContextMenuAnchor
  items: ContextMenuItem[]
  label: string
  /** Called after a dismissal or a run item; receives whether focus should return to the opener. */
  onClose: (restoreFocus: boolean) => void
}

/**
 * A cursor-anchored menu rendered into `document.body`. The panel it opens over
 * scrolls and clips its own content, so the menu has to escape that stacking
 * context the same way `ImagePreviewTooltip` does.
 */
export function ContextMenu({ anchor, items, label, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<ContextMenuAnchor>(anchor)

  // Measure before paint: the menu is placed at the cursor and then pulled back
  // inside the viewport, so an unclamped first frame would visibly jump.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN
    const maxTop = window.innerHeight - height - VIEWPORT_MARGIN
    setPosition({
      x: Math.max(VIEWPORT_MARGIN, Math.min(anchor.x, Math.max(VIEWPORT_MARGIN, maxLeft))),
      y: Math.max(VIEWPORT_MARGIN, Math.min(anchor.y, Math.max(VIEWPORT_MARGIN, maxTop)))
    })
  }, [anchor.x, anchor.y, items.length])

  useEffect(() => {
    const focused = focusCollectionItem<HTMLButtonElement>(
      menuRef.current,
      MENU_ITEM_SELECTOR,
      'first'
    )
    if (!focused) menuRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleOutsideMouseDown = (event: MouseEvent): void => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose(false)
    }
    // A scroll or resize moves the row the menu points at, so the anchor stops
    // meaning anything; closing is the only honest response.
    const handleReflow = (): void => onClose(false)
    document.addEventListener('mousedown', handleOutsideMouseDown)
    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown)
      window.removeEventListener('resize', handleReflow)
      window.removeEventListener('scroll', handleReflow, true)
    }
  }, [onClose])

  const focusItem = useCallback((next: 'first' | 'last' | 'next' | 'previous') => {
    if (!focusCollectionItem<HTMLButtonElement>(menuRef.current, MENU_ITEM_SELECTOR, next)) {
      menuRef.current?.focus()
    }
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusItem('next')
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem('previous')
        break
      case 'Home':
        event.preventDefault()
        focusItem('first')
        break
      case 'End':
        event.preventDefault()
        focusItem('last')
        break
      case 'Escape':
        event.preventDefault()
        onClose(true)
        break
      case 'Tab':
        onClose(true)
        break
      default:
        break
    }
  }

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ top: position.y, left: position.x }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="context-menu-item"
          disabled={item.disabled}
          onClick={() => {
            void item.run()
            onClose(true)
          }}
        >
          {item.icon && (
            <span className="context-menu-item-icon" aria-hidden="true">
              {item.icon}
            </span>
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}
