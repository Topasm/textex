/**
 * Pure utility functions for PreviewPane.
 *
 * These functions contain no React imports, hooks, refs, or state.
 * They are pure input-to-output helpers for zoom, pagination,
 * coordinate calculations, and virtual-scrolling layout.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of pages to render beyond the visible viewport in each direction. */
export const PAGE_OVERSCAN = 2

/** Estimated page height in pixels when actual height is unknown. */
export const ESTIMATED_PAGE_HEIGHT = 1100

/** Debounce scroll events to reduce visible-page recalculation frequency. */
export const SCROLL_DEBOUNCE_MS = 100

/** Debounce delay for persisting scroll position. */
export const SCROLL_PERSIST_DEBOUNCE_MS = 500

/** Accumulated delta threshold to trigger page navigation in single-page mode (vertical scroll). */
export const SWIPE_THRESHOLD = 150

/** Lower threshold for pure horizontal scroll (e.g. MX Master thumb wheel). */
export const SWIPE_THRESHOLD_HORIZONTAL = 30

/** Cooldown between swipe-triggered page navigations. */
export const SWIPE_COOLDOWN_MS = 400

/** Standard A4 page width in PDF points. */
const A4_WIDTH = 595

/** Standard A4 page height in PDF points. */
const A4_HEIGHT = 842

// ---------------------------------------------------------------------------
// Page width / height helpers
// ---------------------------------------------------------------------------

/**
 * Compute the rendered page width in pixels from the container width and zoom level.
 *
 * Returns `undefined` when `containerWidth` is falsy (container not yet measured).
 */
export function calcPageWidth(containerWidth: number | undefined, zoomLevel: number): number | undefined {
  return containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : undefined
}

/**
 * Estimate the rendered height of a page.
 *
 * If a `cachedHeight` is provided (from a previous render) it is returned as-is.
 * Otherwise the height is estimated using the A4 aspect ratio and the current
 * page width derived from `containerWidth` and `zoomLevel`.
 */
export function estimatePageHeight(
  containerWidth: number | undefined,
  zoomLevel: number,
  cachedHeight?: number
): number {
  if (cachedHeight !== undefined) return cachedHeight
  const pw = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : A4_WIDTH
  return pw * (A4_HEIGHT / A4_WIDTH)
}

// ---------------------------------------------------------------------------
// Cumulative layout computation
// ---------------------------------------------------------------------------

export interface CumulativeLayout {
  /** Total height of all pages plus inter-page gaps. */
  totalHeight: number
  /** Map from 1-indexed page number to its top offset in pixels. */
  pageOffsets: Map<number, number>
  /** Array of cumulative top offsets (0-indexed, so `cumulativeHeights[i]` = offset of page i+1). */
  cumulativeHeights: number[]
}

/**
 * Pre-compute cumulative page offsets for O(log N) scroll-to-page lookup.
 *
 * @param numPages  Total number of pages in the document.
 * @param getHeight A function that returns the (estimated or cached) height for a 1-indexed page number.
 * @param gap       Pixel gap between consecutive pages (default 16).
 */
export function buildCumulativeLayout(
  numPages: number,
  getHeight: (pageNum: number) => number,
  gap: number = 16
): CumulativeLayout {
  const pageOffsets = new Map<number, number>()
  const cumulativeHeights: number[] = []
  let total = 0
  for (let i = 1; i <= numPages; i++) {
    pageOffsets.set(i, total)
    cumulativeHeights.push(total)
    total += getHeight(i) + gap
  }
  return { totalHeight: total, pageOffsets, cumulativeHeights }
}

// ---------------------------------------------------------------------------
// Binary search for visible page
// ---------------------------------------------------------------------------

/**
 * Binary search on a sorted cumulative-heights array.
 *
 * Returns the **1-indexed** page number whose top offset is the last one <= `scrollY`.
 */
export function binarySearchPage(cumHeights: number[], scrollY: number): number {
  if (cumHeights.length === 0) return 1
  let lo = 0
  let hi = cumHeights.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (cumHeights[mid] <= scrollY) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo + 1
}

// ---------------------------------------------------------------------------
// Visible range with overscan
// ---------------------------------------------------------------------------

export interface VisibleRange {
  start: number
  end: number
}

/**
 * Given the first and last visible page numbers, expand the range by `overscan`
 * pages in each direction, clamped to `[1, numPages]`.
 */
export function computeVisibleRange(
  startPage: number,
  endPage: number,
  numPages: number,
  overscan: number = PAGE_OVERSCAN
): VisibleRange {
  return {
    start: Math.max(1, startPage - overscan),
    end: Math.min(numPages, endPage + overscan)
  }
}

// ---------------------------------------------------------------------------
// Zoom helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the zoom level (as a percentage) that makes one full page fit
 * within the container height.
 *
 * @param containerHeight  The pixel height of the scrollable container.
 * @param containerWidth   The pixel width of the scrollable container.
 * @param pageWidth        The intrinsic PDF page width in points (default A4).
 * @param pageHeight       The intrinsic PDF page height in points (default A4).
 */
export function calcFitHeightZoom(
  containerHeight: number,
  containerWidth: number,
  pageWidth: number = A4_WIDTH,
  pageHeight: number = A4_HEIGHT
): number {
  return Math.round((containerHeight * pageWidth) / (pageHeight * (containerWidth - 32)) * 100)
}

// ---------------------------------------------------------------------------
// Page clamping
// ---------------------------------------------------------------------------

/**
 * Clamp a page number to the valid range `[1, numPages]`.
 */
export function clampPage(page: number, numPages: number): number {
  return Math.max(1, Math.min(numPages, page))
}
