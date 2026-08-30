import { useCallback, useRef } from 'react'
import {
  SWIPE_GESTURE_IDLE_MS,
  SWIPE_LOCK_MS,
  SWIPE_TRIGGER_TRACKPAD,
  SWIPE_TRIGGER_WHEEL
} from '../constants'

/**
 * The part of a wheel event the gesture reads, so a React synthetic event and a
 * native one from a `passive: false` listener both fit without a cast.
 */
export type SwipeWheelEvent = Pick<
  WheelEvent,
  | 'ctrlKey'
  | 'currentTarget'
  | 'deltaMode'
  | 'deltaX'
  | 'deltaY'
  | 'metaKey'
  | 'shiftKey'
  | 'target'
>

/** Line- and page-mode deltas count in rows and screens, so scale them to pixels. */
const LINE_HEIGHT_PX = 40
const PAGE_HEIGHT_PX = 800

/**
 * Weight kept from earlier events. Travel is therefore measured over roughly the
 * last five events (~80ms of a 60Hz stream): enough for a slow, deliberate swipe
 * to add up, short enough that it still reads as speed rather than distance.
 */
const TRAVEL_DECAY = 0.8

/** Horizontal travel must beat vertical by this much before a tab moves. */
const AXIS_DOMINANCE = 1.5

type SwipeDirection = 1 | -1

interface SwipeSession {
  consumed: boolean
  travelX: number
  travelY: number
  direction: SwipeDirection | 0
  lastEventTime: number
  lastSwipeTime: number
}

function monotonicNow(): number {
  // Wall-clock jumps (NTP, timezone edits) must not strand the gesture.
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** Line- and page-mode wheels report notches, not pixels; scale them up. */
export function wheelDeltaScale(deltaMode: number | undefined): number {
  if (deltaMode === 1) return LINE_HEIGHT_PX
  if (deltaMode === 2) return PAGE_HEIGHT_PX
  return 1
}

/**
 * Whether the event started inside something that scrolls sideways itself, such
 * as a wide log line: that content owns the gesture, not the panel. Once it is
 * scrolled hard against the edge the swipe is heading for it has nothing left to
 * give, so the gesture chains outwards.
 */
function isInsideHorizontalScroller(event: SwipeWheelEvent, direction: SwipeDirection): boolean {
  // A native event only carries currentTarget while it is being dispatched.
  const stop = event.currentTarget instanceof Node ? event.currentTarget : null
  let node: Element | null = event.target instanceof Element ? event.target : null
  while (node && node !== stop) {
    const room = node.scrollWidth - node.clientWidth
    if (room > 1) {
      const overflowX = window.getComputedStyle(node).overflowX
      const remaining = direction > 0 ? room - node.scrollLeft : node.scrollLeft
      if ((overflowX === 'auto' || overflowX === 'scroll') && remaining > 1) return true
    }
    node = node.parentElement
  }
  return false
}

/**
 * A two-finger horizontal trackpad swipe, or a thumb wheel.
 *
 * One flick moves exactly one step. A flick reaches the app as a burst of wheel
 * events trailed by a decaying momentum tail, so the gesture stays "spent" until
 * the complete wheel stream stops for a beat. In particular, a noisy tail that
 * briefly accelerates or reverses must not move a second tab (or toggle a paired
 * workspace straight back).
 */
export function useHorizontalSwipe(
  onSwipe: (direction: SwipeDirection) => void
): (event: SwipeWheelEvent) => void {
  const session = useRef<SwipeSession>({
    consumed: false,
    travelX: 0,
    travelY: 0,
    direction: 0,
    // Never 0: at mount that would read as recent input for one lock.
    lastEventTime: Number.NEGATIVE_INFINITY,
    lastSwipeTime: Number.NEGATIVE_INFINITY
  })

  return useCallback(
    (event: SwipeWheelEvent) => {
      // Ctrl/Cmd+wheel belongs to zoom (and Ctrl is how WebKit reports a
      // trackpad pinch). Never let either chord change the workspace or page.
      if (event.ctrlKey || event.metaKey) return

      const now = monotonicNow()
      const current = session.current
      // Every wheel event keeps the stream alive, vertical ones included: a
      // diagonal flick must not look idle just because it drifted off axis.
      const idle = now - current.lastEventTime >= SWIPE_GESTURE_IDLE_MS
      current.lastEventTime = now
      if (idle) {
        current.consumed = false
        current.travelX = 0
        current.travelY = 0
        current.direction = 0
      }

      // The momentum tail can contain dozens of events. Once this stream has
      // chosen an owner or performed a switch, timestamp it above and skip all
      // remaining axis, DOM, and smoothing work.
      if (current.consumed) return

      const scale = wheelDeltaScale(event.deltaMode)
      // Some engines report Shift+wheel as vertical travel and leave the swap to
      // the app; the ones that swap it themselves never reach this branch.
      const swapped = event.deltaX === 0 && event.shiftKey && event.deltaY !== 0
      const dx = (swapped ? event.deltaY : event.deltaX) * scale
      const stepX = Math.abs(dx)
      const stepY = swapped ? 0 : Math.abs(event.deltaY * scale)
      const direction: SwipeDirection | 0 = dx > 0 ? 1 : dx < 0 ? -1 : 0

      // Lines and pages only come from a discrete wheel, where one notch is a
      // deliberate step rather than the start of a glide.
      const trigger = scale > 1 ? SWIPE_TRIGGER_WHEEL : SWIPE_TRIGGER_TRACKPAD

      // Before a gesture commits, a direction change replaces the tentative
      // travel instead of borrowing distance from the opposite direction.
      // After it commits, the early return above keeps any reversal in the same
      // physical gesture from triggering a second action.
      if (direction !== 0 && current.direction !== 0 && direction !== current.direction) {
        current.travelX = 0
        current.travelY = 0
      }
      if (direction !== 0) current.direction = direction

      current.travelX = current.travelX * TRAVEL_DECAY + stepX
      current.travelY = current.travelY * TRAVEL_DECAY + stepY

      // A gesture the panel does not own must still decay the travel above, so
      // these checks come after the bookkeeping, not before it.
      if (direction === 0) return
      if (current.travelX <= current.travelY * AXIS_DOMINANCE) return
      if (current.travelX < trigger) return

      if (isInsideHorizontalScroller(event, direction)) {
        // The inner scroller keeps the whole gesture, edges included.
        current.consumed = true
        return
      }

      // Consume the stream before checking the animation floor. This prevents
      // an early second gesture from firing late when the floor expires.
      current.consumed = true
      if (now - current.lastSwipeTime < SWIPE_LOCK_MS) return

      current.lastSwipeTime = now
      onSwipe(direction)
    },
    [onSwipe]
  )
}
