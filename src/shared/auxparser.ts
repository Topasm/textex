export interface AuxCitationMap {
  keyToLabel: Map<string, string>
  labelToKeys: Map<string, string[]>
}

/**
 * Parse a LaTeX .aux file to extract \bibcite{KEY}{LABEL} mappings.
 * Returns bidirectional maps: cite key → label and label → cite keys.
 */
export function parseAuxContent(content: string): AuxCitationMap {
  const keyToLabel = new Map<string, string>()
  const labelToKeys = new Map<string, string[]>()

  // Match \bibcite{KEY}{LABEL} — label can be a number or author-year text
  const re = /\\bibcite\{([^}]+)\}\{([^}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const key = match[1]
    const label = match[2]
    keyToLabel.set(key, label)

    const existing = labelToKeys.get(label)
    if (existing) {
      existing.push(key)
    } else {
      labelToKeys.set(label, [key])
    }
  }

  return { keyToLabel, labelToKeys }
}
