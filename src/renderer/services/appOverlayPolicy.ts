export type ExclusiveAppOverlay =
  'commandPalette' | 'help' | 'settings' | 'aiDraft' | 'templateGallery'

export interface AppOverlaySnapshot {
  commandPalette: boolean
  help: boolean
  settings: boolean
  aiDraft: boolean
  templateGallery: boolean
  /**
   * A dialog owned by a feature rather than by App — the table editor, crash
   * recovery, bibliography registration. Features declare themselves through
   * `useFeatureModal`, so this is plain state rather than something inferred
   * from the rendered DOM.
   */
  featureModal: boolean
}

/**
 * Highest-first ordering for defensive recovery if two exclusive surfaces are
 * requested in the same render. Modal workflows always outrank the palette.
 */
const OVERLAY_PRIORITY: readonly ExclusiveAppOverlay[] = [
  'templateGallery',
  'aiDraft',
  'settings',
  'help',
  'commandPalette'
]

export function getTopmostAppOverlay(snapshot: AppOverlaySnapshot): ExclusiveAppOverlay | null {
  if (snapshot.featureModal) return null
  return OVERLAY_PRIORITY.find((surface) => snapshot[surface]) ?? null
}

/** Loading fallbacks inherit their owning exclusive surface's flag, so they are covered here. */
export function hasBlockingModalOverlay(snapshot: AppOverlaySnapshot): boolean {
  return (
    snapshot.featureModal ||
    snapshot.help ||
    snapshot.settings ||
    snapshot.aiDraft ||
    snapshot.templateGallery
  )
}

/**
 * The palette never covers an exclusive page or modal. Either may atomically
 * replace the palette, but exclusive workflows never stack on each other.
 */
export function canOpenExclusiveAppOverlay(
  target: ExclusiveAppOverlay,
  snapshot: AppOverlaySnapshot
): boolean {
  if (snapshot.featureModal) return false
  const topmost = getTopmostAppOverlay(snapshot)
  if (target === 'commandPalette') {
    return !hasBlockingModalOverlay(snapshot)
  }
  return topmost === null || topmost === target || topmost === 'commandPalette'
}

export function shouldSuppressBackgroundSurfaces(snapshot: AppOverlaySnapshot): boolean {
  return snapshot.featureModal || getTopmostAppOverlay(snapshot) !== null
}
