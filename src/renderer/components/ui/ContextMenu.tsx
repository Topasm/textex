import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import { focusCollectionItem } from '../../utils/collectionFocus'
import './ContextMenu.css'
import { useProjectStore } from '../../store/useProjectStore'
import { logError } from '../../utils/errorMessage'

const VIEWPORT_MARGIN = 8
const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)'
let dismissNativeMenu: (() => void) | null = null

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
  /** Clears the owning menu state, optionally returning keyboard focus to its opener. */
  onClose: (restoreFocus: boolean) => void
}

function runItem(item: ContextMenuItem): void {
  try {
    void Promise.resolve(item.run()).catch((error: unknown) =>
      logError('ContextMenu:action', error)
    )
  } catch (error) {
    logError('ContextMenu:action', error)
  }
}

/** OS-native menus in desktop builds, with an accessible portal fallback. */
export function ContextMenu(props: ContextMenuProps) {
  return typeof window.api?.showContextMenu === 'function' ? (
    <NativeContextMenu {...props} />
  ) : (
    <WebContextMenu {...props} />
  )
}

function NativeContextMenu(props: ContextMenuProps) {
  const latest = useRef(props)
  const [fallback, setFallback] = useState(false)
  useLayoutEffect(() => {
    latest.current = props
  })
  useEffect(() => {
    if (fallback) return
    let active = true
    let selected = false
    const controller = new AbortController()
    const dismiss = () => {
      active = false
      controller.abort()
      latest.current.onClose(false)
    }
    const root = useProjectStore.getState().projectRoot
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (state.projectRoot !== root) {
        active = false
        controller.abort()
        latest.current.onClose(false)
      }
    })
    // Defer opening until after effect setup, so StrictMode's discarded mount
    // cannot flash an extra native menu.
    void Promise.resolve().then(async () => {
      if (!active) return
      dismissNativeMenu?.()
      dismissNativeMenu = dismiss
      try {
        await window.api.showContextMenu(
          {
            ...props.anchor,
            items: latest.current.items.map(({ id, label, disabled }) => ({ id, label, disabled }))
          },
          (id) => {
            if (!active || selected) return
            const item = latest.current.items.find((item) => item.id === id)
            if (!item || item.disabled) return
            selected = true
            latest.current.onClose(true)
            runItem(item)
          },
          controller.signal
        )
        // Dismissal can precede the activation event. Retain this invisible
        // listener until the owner unmounts or opens another menu; the OS
        // already restored focus. Do not discard a queued selection here.
      } catch (error) {
        if (active) {
          logError('ContextMenu:native', error)
          setFallback(true)
        }
      }
    })
    return () => {
      active = false
      controller.abort()
      if (dismissNativeMenu === dismiss) dismissNativeMenu = null
      unsubscribe()
    }
  }, [props.anchor, fallback])
  return fallback ? <WebContextMenu {...props} /> : null
}

function WebContextMenu({ anchor, items, label, onClose }: ContextMenuProps) {
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
    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.projectRoot !== previous.projectRoot) onClose(false)
    })
    // A scroll or resize moves the row the menu points at, so the anchor stops
    // meaning anything; closing is the only honest response.
    const handleReflow = (): void => onClose(false)
    document.addEventListener('mousedown', handleOutsideMouseDown)
    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)
    return () => {
      unsubscribe()
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
            onClose(true)
            runItem(item)
          }}
        >
          <span className="context-menu-item-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}
