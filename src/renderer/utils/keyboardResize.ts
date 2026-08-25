export interface KeyboardResizeInput {
  key: string
  shiftKey: boolean
}

interface KeyboardResizeOptions {
  min: number
  max: number
  step: number
  largeStep: number
  invertArrows?: boolean
}

/** Returns null for unrelated keys and a clamped value for resize keys. */
export function getKeyboardResizeValue(
  input: KeyboardResizeInput,
  current: number,
  options: KeyboardResizeOptions
): number | null {
  if (input.key === 'Home') return options.min
  if (input.key === 'End') return options.max
  if (input.key !== 'ArrowLeft' && input.key !== 'ArrowRight') return null

  const direction = input.key === 'ArrowRight' ? 1 : -1
  const adjustedDirection = options.invertArrows ? -direction : direction
  const delta = input.shiftKey ? options.largeStep : options.step
  return Math.max(options.min, Math.min(options.max, current + adjustedDirection * delta))
}
