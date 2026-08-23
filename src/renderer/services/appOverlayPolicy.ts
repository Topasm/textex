export type ExclusiveAppOverlay = 'commandPalette' | 'settings' | 'aiDraft' | 'templateGallery'

export interface AppOverlaySnapshot {
  commandPalette: boolean
  settings: boolean
  aiDraft: boolean
  templateGallery: boolean
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
  'commandPalette'
]

const RENDERED_BLOCKING_OVERLAY_SELECTOR = [
  '[aria-modal="true"]',
  '.modal-overlay',
  '.modal-backdrop',
  '.table-editor-overlay',
  '.loading-fallback--modal'
].join(',')

export function getTopmostAppOverlay(snapshot: AppOverlaySnapshot): ExclusiveAppOverlay | null {
  if (snapshot.featureModal) return null
  return OVERLAY_PRIORITY.find((surface) => snapshot[surface]) ?? null
}

/** Loading fallbacks inherit their owning modal's flag, so they are covered here. */
export function hasBlockingModalOverlay(snapshot: AppOverlaySnapshot): boolean {
  return snapshot.featureModal || snapshot.settings || snapshot.aiDraft || snapshot.templateGallery
}

/**
 * The palette never covers a modal. A modal may atomically replace the palette,
 * but one modal workflow cannot open on top of another modal workflow.
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

/** Covers feature-owned dialogs that do not participate in App's overlay state. */
export function hasRenderedBlockingOverlay(root: ParentNode): boolean {
  return root.querySelector(RENDERED_BLOCKING_OVERLAY_SELECTOR) !== null
}

export function containsRenderedBlockingOverlay(element: Element): boolean {
  return element.matches(RENDERED_BLOCKING_OVERLAY_SELECTOR) || hasRenderedBlockingOverlay(element)
}

/** Feature dialogs are rendered outside App's four explicitly owned overlays. */
export function hasRenderedFeatureModal(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>(RENDERED_BLOCKING_OVERLAY_SELECTOR)).some(
    (element) => !element.closest('[data-app-overlay-owner]')
  )
}
