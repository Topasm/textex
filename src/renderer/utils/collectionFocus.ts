export type CollectionFocusPosition = 'first' | 'last' | 'next' | 'previous'

/**
 * Move focus within a rendered collection without storing a second active index.
 * Returns false when the collection has no enabled items so callers can choose
 * an appropriate fallback target.
 */
export function focusCollectionItem<T extends HTMLElement>(
  container: ParentNode | null,
  selector: string,
  position: CollectionFocusPosition
): boolean {
  const items = Array.from(container?.querySelectorAll<T>(selector) ?? [])
  if (items.length === 0) return false

  const currentIndex = items.indexOf(document.activeElement as T)
  let nextIndex = 0
  if (position === 'last') nextIndex = items.length - 1
  else if (position === 'next') nextIndex = (Math.max(currentIndex, -1) + 1) % items.length
  else if (position === 'previous')
    nextIndex = (currentIndex <= 0 ? items.length : currentIndex) - 1

  items[nextIndex]?.focus()
  return true
}
