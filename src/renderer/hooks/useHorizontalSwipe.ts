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
  'ctrlKey' | 'currentTarget' | 'deltaMode' | 'deltaX' | 'deltaY' | 'shiftKey' | 'target'
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

/** Momentum only ever slows down, so a jump this steep is the user flicking again. */
const REACCELERATION = 2

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
function isInsideHorizontalScroller(event: SwipeWheelEvent, direction: 1 | -1): boolean {
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
 * the events either stop for a beat, fade to a standstill, or speed back up
 * because the user flicked again; a faster flick therefore travels further, not
 * twice.
 */
export function useHorizontalSwipe(
  onSwipe: (direction: 1 | -1) => void
): (event: SwipeWheelEvent) => void {
  const armed = useRef(true)
  const travelX = useRef(0)
  const travelY = useRef(0)
  const lastStepX = useRef(0)
  const lastDirection = useRef(0)
  // Never 0: at mount that would read as "a swipe just happened" for one lock.
  const lastEventTime = useRef(Number.NEGATIVE_INFINITY)
  const lastSwipeTime = useRef(Number.NEGATIVE_INFINITY)

  return useCallback(
    (event: SwipeWheelEvent) => {
      // Ctrl+wheel is a zoom, on a trackpad a pinch. Never a swipe.
      if (event.ctrlKey) return

      const now = monotonicNow()
      // Every wheel event keeps the stream alive, vertical ones included: a
      // diagonal flick must not look idle just because it drifted off axis.
      const idle = now - lastEventTime.current >= SWIPE_GESTURE_IDLE_MS
      lastEventTime.current = now
      if (idle) {
        armed.current = true
        travelX.current = 0
        travelY.current = 0
        lastStepX.current = 0
        lastDirection.current = 0
      }

      const scale = wheelDeltaScale(event.deltaMode)
      // Some engines report Shift+wheel as vertical travel and leave the swap to
      // the app; the ones that swap it themselves never reach this branch.
      const swapped = event.deltaX === 0 && event.shiftKey && event.deltaY !== 0
      const dx = (swapped ? event.deltaY : event.deltaX) * scale
      const stepX = Math.abs(dx)
      const stepY = swapped ? 0 : Math.abs(event.deltaY * scale)
      const direction = dx > 0 ? 1 : dx < 0 ? -1 : 0

      // Lines and pages only come from a discrete wheel, where one notch is a
      // deliberate step rather than the start of a glide.
      const trigger = scale > 1 ? SWIPE_TRIGGER_WHEEL : SWIPE_TRIGGER_TRACKPAD

      // Reversing mid-stream is a new intent, not the tail of the last flick.
      if (direction !== 0 && lastDirection.current !== 0 && direction !== lastDirection.current) {
        if (stepX > trigger / 5) {
          armed.current = true
          travelX.current = 0
          travelY.current = 0
        }
      }

      // Speed of the stream so far, in delta per event, before this one lands.
      const pace = travelX.current * (1 - TRAVEL_DECAY)

      travelX.current = travelX.current * TRAVEL_DECAY + stepX
      travelY.current = travelY.current * TRAVEL_DECAY + stepY

      if (travelX.current <= trigger / 5) {
        // The tail ran out of speed, so the next decisive event starts fresh.
        armed.current = true
      } else if (
        !armed.current &&
        stepX >= trigger &&
        // Momentum only ever slows down. Outrunning both the event before it and
        // the smoothed pace of the stream means the user threw a second flick;
        // needing both keeps a flick's own ramp-up and a noisy tail out.
        stepX > lastStepX.current * REACCELERATION &&
        stepX > pace * REACCELERATION
      ) {
        armed.current = true
      }

      lastStepX.current = stepX
      lastDirection.current = direction

      // A gesture the panel does not own must still decay the travel above, so
      // these checks come after the bookkeeping, not before it.
      if (direction === 0) return
      if (travelX.current <= travelY.current * AXIS_DOMINANCE) return
      if (travelX.current < trigger) return
      if (!armed.current) return

      if (isInsideHorizontalScroller(event, direction)) {
        // The inner scroller keeps the whole gesture, edges included.
        armed.current = false
        return
      }

      // Stay armed through the floor so a genuine second flick lands late
      // instead of vanishing; the tail of the first one is still disarmed.
      if (now - lastSwipeTime.current < SWIPE_LOCK_MS) return

      armed.current = false
      lastSwipeTime.current = now
      onSwipe(direction)
    },
    [onSwipe]
  )
}
