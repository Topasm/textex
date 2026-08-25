import { useCallback, useEffect, useRef, useState } from 'react'

export type AnimatedPresencePhase = 'entering' | 'entered' | 'exiting'

interface AnimatedPresence {
  mounted: boolean
  phase: AnimatedPresencePhase
}

/**
 * Keeps a surface mounted briefly while it exits. The caller owns the CSS;
 * this hook only provides deterministic presence phases and cleanup.
 */
export function useAnimatedPresence(visible: boolean, duration = 180): AnimatedPresence {
  const [presence, setPresence] = useState<AnimatedPresence>({
    mounted: visible,
    phase: 'entered'
  })
  const presenceRef = useRef(presence)
  presenceRef.current = presence

  const updatePresence = useCallback((next: AnimatedPresence): void => {
    presenceRef.current = next
    setPresence(next)
  }, [])

  useEffect(() => {
    let frame: number | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const current = presenceRef.current

    if (visible) {
      if (current.mounted && current.phase === 'entered') return

      updatePresence({ mounted: true, phase: 'entering' })
      frame = window.requestAnimationFrame(() => {
        updatePresence({ mounted: true, phase: 'entered' })
      })
    } else if (current.mounted) {
      updatePresence({ mounted: true, phase: 'exiting' })
      timeout = setTimeout(() => {
        updatePresence({ mounted: false, phase: 'entered' })
      }, duration)
    }

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }, [duration, updatePresence, visible])

  return presence
}
