export interface TableData {
  rows: string[][];
  alignment: string; // e.g., "|c|c|l|"
}

export function parseLatexTable(latex: string): TableData {
  const lines = latex.trim().split('\n');
  let alignment = '';
  const rows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('\\begin{tabular}')) {
      const match = trimmed.match(/\\begin{tabular}\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/);
      if (match && match[1]) {
        alignment = match[1];
      }
      continue;
    }
    if (trimmed.startsWith('\\end{tabular}')) {
      continue;
    }
    if (trimmed.startsWith('\\hline')) {
      // Ignore hlines for now
      continue;
    }

    // simplistic split, doesn't handle escaped \&
    const rowContent = trimmed.replace(/\\\\$/, '');
    const cells = rowContent.split('&').map(cell => cell.trim());
    if (cells.length > 0 && (cells.length > 1 || cells[0] !== '')) {
      rows.push(cells);
    }
  }

  return { rows, alignment };
}

export function generateLatexTable(data: TableData): string {
  const { rows, alignment } = data;
  let latex = `\\begin{tabular}{${alignment}}\n`;
  latex += `  \\hline\n`;

  for (const row of rows) {
    latex += `  ${row.join(' & ')} \\\\\n`;
    latex += `  \\hline\n`;
  }

  latex += `\\end{tabular}`;
  return latex;
}
