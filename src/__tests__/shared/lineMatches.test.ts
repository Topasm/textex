import { describe, expect, it } from 'vitest'
import { commonLines } from '../../shared/lineMatches'

function original(left: string[], right: string[]): Array<[number, number]> {
  const table = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0)
  )
  for (let row = left.length - 1; row >= 0; row--) {
    for (let column = right.length - 1; column >= 0; column--)
      table[row][column] =
        left[row] === right[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1])
  }
  const pairs: Array<[number, number]> = []
  let row = 0
  let column = 0
  while (row < left.length && column < right.length) {
    if (left[row] === right[column]) pairs.push([row++, column++])
    else if (table[row + 1][column] >= table[row][column + 1]) row++
    else column++
  }
  return pairs
}

describe('bounded-change line matching', () => {
  it('preserves exact attribution for every short sequence with repeated lines', () => {
    const sequences: string[][] = [[]]
    for (let length = 1; length <= 4; length++) {
      for (let bits = 0; bits < 2 ** length; bits++)
        sequences.push(
          Array.from({ length }, (_, index) => (bits & (1 << index) ? 'paragraph' : ''))
        )
    }
    for (const left of sequences)
      for (const right of sequences) expect(commonLines(left, right)).toEqual(original(left, right))
  })
  it('handles a local edit in a 20,000-line document without a full quadratic table', () => {
    const left = Array.from({ length: 20_000 }, (_, index) => `Line ${index}`)
    const right = [...left]
    right[10] = 'Edited sentence'
    const matches = commonLines(left, right)
    expect(matches).toHaveLength(19_999)
    expect(matches[10]).toEqual([11, 11])
    expect(matches.at(-1)).toEqual([19_999, 19_999])
  })
  it('preserves tie choices across packed-byte boundaries and unequal lengths', () => {
    let seed = 17
    const sequence = (length: number) =>
      Array.from({ length }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return ['', 'paragraph', '\\begin{equation}', '\\end{equation}'][seed >>> 30]
      })
    for (const length of [7, 8, 9, 15, 16, 17, 63, 64, 65]) {
      for (let sample = 0; sample < 12; sample++) {
        const left = sequence(length)
        const right = sequence(length + sample - 6)
        expect(commonLines(left, right)).toEqual(original(left, right))
      }
    }
  })

  it('matches a large repeated document when prefix and suffix trimming cannot help', () => {
    const repeated = Array.from({ length: 3000 }, (_, index) => (index % 2 ? 'paragraph' : ''))
    const left = ['old heading', ...repeated, 'old ending']
    const right = ['new heading', ...repeated, 'new ending']
    expect(commonLines(left, right)).toEqual(repeated.map((_, index) => [index + 1, index + 1]))
  })
})
