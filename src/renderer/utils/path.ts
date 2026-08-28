export function dirname(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index > 0 ? filePath.slice(0, index) : filePath
}

/**
 * Labels for a set of open files, disambiguated only where they collide.
 *
 * A LaTeX project routinely holds `sections/intro.tex` next to
 * `appendix/intro.tex`, and a bare basename makes those two tabs identical.
 * Each colliding label takes one more parent segment until it is unique, so
 * the common case stays short and only ambiguity costs width.
 */
export function disambiguateFileLabels(filePaths: readonly string[]): Map<string, string> {
  const segmentsFor = new Map<string, string[]>()
  for (const filePath of filePaths) {
    segmentsFor.set(filePath, filePath.split(/[\\/]/u).filter(Boolean))
  }

  const depth = new Map<string, number>(filePaths.map((filePath) => [filePath, 1]))
  const labelAt = (filePath: string): string => {
    const segments = segmentsFor.get(filePath) ?? []
    if (segments.length === 0) return filePath
    return segments.slice(Math.max(0, segments.length - (depth.get(filePath) ?? 1))).join('/')
  }

  // Each pass lengthens only the labels that are still ambiguous. It ends
  // because a path that cannot grow further is left alone.
  for (let pass = 0; pass < 32; pass += 1) {
    const byLabel = new Map<string, string[]>()
    for (const filePath of filePaths) {
      const label = labelAt(filePath)
      const bucket = byLabel.get(label)
      if (bucket) bucket.push(filePath)
      else byLabel.set(label, [filePath])
    }

    let grew = false
    for (const bucket of byLabel.values()) {
      if (bucket.length < 2) continue
      for (const filePath of bucket) {
        const available = segmentsFor.get(filePath)?.length ?? 0
        const current = depth.get(filePath) ?? 1
        if (current >= available) continue
        depth.set(filePath, current + 1)
        grew = true
      }
    }
    if (!grew) break
  }

  return new Map(filePaths.map((filePath) => [filePath, labelAt(filePath)]))
}
