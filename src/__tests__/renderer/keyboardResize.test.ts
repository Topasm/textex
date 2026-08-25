import { describe, expect, it } from 'vitest'
import { getKeyboardResizeValue } from '../../renderer/utils/keyboardResize'

const options = { min: 100, max: 500, step: 10, largeStep: 40 }

describe('getKeyboardResizeValue', () => {
  it('handles arrows, accelerated resizing, and bounds', () => {
    expect(getKeyboardResizeValue({ key: 'ArrowRight', shiftKey: false }, 240, options)).toBe(250)
    expect(getKeyboardResizeValue({ key: 'ArrowLeft', shiftKey: true }, 240, options)).toBe(200)
    expect(getKeyboardResizeValue({ key: 'ArrowLeft', shiftKey: true }, 110, options)).toBe(100)
    expect(getKeyboardResizeValue({ key: 'ArrowRight', shiftKey: true }, 490, options)).toBe(500)
  })

  it('supports Home, End, inverted panel edges, and unrelated keys', () => {
    expect(getKeyboardResizeValue({ key: 'Home', shiftKey: false }, 240, options)).toBe(100)
    expect(getKeyboardResizeValue({ key: 'End', shiftKey: false }, 240, options)).toBe(500)
    expect(
      getKeyboardResizeValue({ key: 'ArrowLeft', shiftKey: false }, 240, {
        ...options,
        invertArrows: true
      })
    ).toBe(250)
    expect(getKeyboardResizeValue({ key: 'Enter', shiftKey: false }, 240, options)).toBeNull()
  })
})
