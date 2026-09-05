/** Exact LCS matching with the same skip-left tie rule used by prose attribution. */
export function commonLines(
  left: readonly string[],
  right: readonly string[]
): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    pairs.push([prefix, prefix])
    prefix++
  }
  let suffix = 0
  while (
    left.length - suffix > prefix &&
    right.length - suffix > prefix &&
    left[left.length - suffix - 1] === right[right.length - suffix - 1]
  )
    suffix++

  // Repeated lines can match an earlier occurrence instead of the suffix.
  // Only trim when neither changed middle can match any suffix line, preserving
  // attribution around blank lines and repeated protected LaTeX blocks.
  const suffixValues = new Set(left.slice(left.length - suffix))
  if (
    left.slice(prefix, left.length - suffix).some((line) => suffixValues.has(line)) ||
    right.slice(prefix, right.length - suffix).some((line) => suffixValues.has(line))
  )
    suffix = 0

  const rows = left.length - prefix - suffix
  const columns = right.length - prefix - suffix
  // Scores need only the next row. Reconstruction needs one bit per cell:
  // skip left on ties, otherwise skip right; equal lines always match diagonally.
  // This preserves attribution while avoiding a full 32-bit score matrix.
  const scores = new Uint32Array(columns + 1)
  const bytesPerRow = Math.ceil(columns / 8)
  const skipLeft = new Uint8Array(rows * bytesPerRow)
  for (let row = rows - 1; row >= 0; row--) {
    let diagonal = 0
    const rowOffset = row * bytesPerRow
    for (let column = columns - 1; column >= 0; column--) {
      const below = scores[column]
      if (left[prefix + row] === right[prefix + column]) {
        scores[column] = diagonal + 1
      } else if (below >= scores[column + 1]) {
        skipLeft[rowOffset + Math.floor(column / 8)] |= 1 << (column % 8)
      } else {
        scores[column] = scores[column + 1]
      }
      diagonal = below
    }
  }
  let row = 0
  let column = 0
  while (row < rows && column < columns) {
    if (left[prefix + row] === right[prefix + column]) {
      pairs.push([prefix + row++, prefix + column++])
    } else if (skipLeft[row * bytesPerRow + Math.floor(column / 8)] & (1 << (column % 8))) row++
    else column++
  }
  for (let index = suffix; index > 0; index--)
    pairs.push([left.length - index, right.length - index])
  return pairs
}
