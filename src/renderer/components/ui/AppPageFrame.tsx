import { forwardRef, type KeyboardEventHandler, type ReactNode } from 'react'
import type { ExclusiveAppOverlay } from '../../services/appOverlayPolicy'
import '../../styles/app-page.css'

interface AppPageFrameProps {
  owner: Extract<ExclusiveAppOverlay, 'settings' | 'help'>
  titleId: string
  className?: string
  children: ReactNode
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

/**
 * A route-like application page that replaces the workspace below the native
 * title bar. Settings and Help are substantial destinations, not transient
 * prompts, so they intentionally have no backdrop or outside-click dismissal.
 */
export const AppPageFrame = forwardRef<HTMLDivElement, AppPageFrameProps>(function AppPageFrame(
  { owner, titleId, className = '', children, onKeyDown },
  ref
) {
  return (
    <div
      ref={ref}
      className={`app-page${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-app-overlay-owner={owner}
      data-app-page={owner}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
})
