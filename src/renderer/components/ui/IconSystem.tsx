import type { PropsWithChildren } from 'react'
import { LucideProvider } from 'lucide-react'

export const ICON_SIZE = {
  micro: 12,
  compact: 14,
  control: 16,
  feature: 18,
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
