import type { PropsWithChildren } from 'react'
import { LucideProvider } from 'lucide-react'

/**
 * The only icon sizes the UI uses.
 *
 * Six steps, each with one job. Components reference the name, never a number,
 * so an icon cannot land between steps and read as a rendering bug — `flat.css`
 * also pins a few chrome slots to these same values, and an off-scale prop
 * there would be silently overridden while the same icon elsewhere was not.
 */
export const ICON_SIZE = {
  /** Inline markers inside dense rows: chevrons, dots, tab close. */
  micro: 12,
  /** Sidebar tabs, panel tabs, list-row actions. */
  compact: 14,
  /** Toolbar and other standalone controls. */
  control: 16,
  /** Feature entry points and primary actions. */
  feature: 18,
  /** Section headers and status icons that anchor a block of content. */
  prominent: 22,
  /** The single illustrative icon in an empty state. */
  emptyState: 28
} as const

export const ICON_STROKE_WIDTH = 1.75

export function IconSystemProvider({ children }: PropsWithChildren) {
  return (
    <LucideProvider
      size={ICON_SIZE.control}
      strokeWidth={ICON_STROKE_WIDTH}
      absoluteStrokeWidth
      className="ui-icon"
    >
      {children}
    </LucideProvider>
  )
}
