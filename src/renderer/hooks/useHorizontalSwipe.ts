import { useCallback, useRef } from 'react'
import type React from 'react'
import {
  SWIPE_GESTURE_IDLE_MS,
  SWIPE_LOCK_MS,
  SWIPE_TRIGGER_TRACKPAD,
  SWIPE_TRIGGER_WHEEL
} from '../constants'

/**
 * A two-finger horizontal trackpad swipe, or a thumb wheel.
 *
 * One flick moves exactly one step. A flick reaches the app as a burst of wheel
 * events trailed by a decaying momentum tail, so the gesture stays "spent"
 * until the events either stop for a beat or fade to a standstill; a faster
 * flick therefore travels further, not twice.
 */
export function useHorizontalSwipe(
  onSwipe: (direction: 1 | -1) => void
): (event: React.WheelEvent) => void {
  const armed = useRef(true)
  const lastEventTime = useRef(0)
  const lastSwipeTime = useRef(0)

  return useCallback(
    (event: React.WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return

      const now = Date.now()
      // A gap in the stream means the previous flick, momentum included, ended.
      if (now - lastEventTime.current >= SWIPE_GESTURE_IDLE_MS) armed.current = true
      lastEventTime.current = now

      // A discrete wheel reports no vertical delta and moves in bigger steps.
      const isMouseWheel = event.deltaY === 0
      const trigger = isMouseWheel ? SWIPE_TRIGGER_WHEEL : SWIPE_TRIGGER_TRACKPAD
      const travel = Math.abs(event.deltaX)

      if (travel < trigger) {
        // Either the ramp-up of a flick or a tail that has run out of speed;
        // both mean the next decisive event starts a fresh gesture.
        if (travel <= trigger / 5) armed.current = true
        return
      }

      if (!armed.current) return
      armed.current = false

      if (now - lastSwipeTime.current < SWIPE_LOCK_MS) return
      lastSwipeTime.current = now

      onSwipe(event.deltaX > 0 ? 1 : -1)
    },
    [onSwipe]
  )
}
