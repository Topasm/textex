import { describe, expect, it } from 'vitest'
import {
  getSidebarSlideAnimation,
  getSidebarWidthFromPointer
} from '../../renderer/hooks/useDragResize'

describe('useDragResize helpers', () => {
  it('calculates sidebar width from the left edge when sidebar is on the left', () => {
    expect(getSidebarWidthFromPointer({ left: 100, right: 340 }, 280, 'left')).toBe(180)
  })

  it('calculates sidebar width from the right edge when sidebar is on the right', () => {
    expect(getSidebarWidthFromPointer({ left: 860, right: 1100 }, 920, 'right')).toBe(180)
  })

  it('mirrors slide animation directions when the sidebar is on the right', () => {
    expect(getSidebarSlideAnimation(1, 'left')).toEqual({
      exit: 'exit-left',
      enter: 'enter-right'
    })
    expect(getSidebarSlideAnimation(1, 'right')).toEqual({
      exit: 'exit-right',
      enter: 'enter-left'
    })
  })
})
