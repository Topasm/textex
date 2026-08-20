import { describe, expect, it } from 'vitest'
import {
  buildVirtualPageNumbers,
  computeVisibleRange,
  estimatePageHeight
} from '../../renderer/components/previewUtils'

describe('preview virtualization utilities', () => {
  it('builds DOM page numbers from only the visible and overscan window', () => {
    const visibleRange = computeVisibleRange(82, 84, 300)

    expect(visibleRange).toEqual({ start: 80, end: 86 })
    expect(buildVirtualPageNumbers(visibleRange, 300)).toEqual([80, 81, 82, 83, 84, 85, 86])
  })

  it('keeps the virtual DOM size independent of the total page count', () => {
    const range = { start: 80, end: 86 }

    expect(buildVirtualPageNumbers(range, 300)).toHaveLength(7)
    expect(buildVirtualPageNumbers(range, 30_000)).toHaveLength(7)
  })

  it('clamps a requested virtual range to valid page numbers', () => {
    expect(buildVirtualPageNumbers({ start: -5, end: 3 }, 2)).toEqual([1, 2])
    expect(buildVirtualPageNumbers({ start: 999, end: 1_000 }, 300)).toEqual([300])
    expect(buildVirtualPageNumbers({ start: 1, end: 5 }, 0)).toEqual([])
  })

  it('recomputes measured page geometry for the current width and zoom', () => {
    expect(estimatePageHeight(632, 100, 2)).toBe(1_200)
    expect(estimatePageHeight(632, 150, 2)).toBe(1_800)
  })
})
