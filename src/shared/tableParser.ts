export interface TableData {
  rows: string[][]
  alignment: string // e.g., "|c|c|l|"
}

export function parseLatexTable(latex: string): TableData {
  const lines = latex.trim().split('\n')
  let alignment = ''
  const rows: string[][] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('\\begin{tabular}')) {
      const match = trimmed.match(/\\begin{tabular}\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)
      if (match && match[1]) {
        alignment = match[1]
      }
      continue
    }
    if (trimmed.startsWith('\\end{tabular}')) {
      continue
    }
    if (trimmed.startsWith('\\hline')) {
      // Preserve hlines or similar structure if we want to,
      // but for a basic data grid, we often just ignore them
      // or handle them as specific row attributes.
      // For now, we ignore them to populate the grid.
      continue
    }

    // simplistic split, doesn't handle escaped \&
    // We remove the trailing \\ if present
    const rowContent = trimmed.replace(/\\\\$/, '')

    // Split by & but be careful of escaped \& (basic check)
    // A more robust regex split:
    const cells = rowContent.split(/(?<!\\)&/g).map((cell) => cell.trim().replace(/\\&/g, '&'))

    if (cells.length > 0 && (cells.length > 1 || cells[0] !== '')) {
      rows.push(cells)
    }
  }

  // Ensure all rows have the same number of columns?
  // Not strictly necessary for the grid, but good for stability.

  return { rows, alignment }
}

export function generateLatexTable(data: TableData): string {
  const { rows, alignment } = data
  let latex = `\\begin{tabular}{${alignment}}\n`
  latex += `  \\hline\n`

  for (const row of rows) {
    // Escape & back to \& if needed?
    // Usually user types raw text in grid.
    const escapedRow = row.map((cell) => cell.replace(/&/g, '\\&'))
    latex += `  ${escapedRow.join(' & ')} \\\\\n`
    latex += `  \\hline\n`
  }

  latex += `\\end{tabular}`
  return latex
}
