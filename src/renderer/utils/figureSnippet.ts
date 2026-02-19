/**
 * Generate a LaTeX figure environment snippet for an image file.
 */
export function generateFigureSnippet(relPath: string, fileName: string): string {
  const label = `fig:${fileName.replace(/\.[^/.]+$/, '').replace(/\s+/g, '-')}`
  return `
\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.8\\linewidth]{${relPath}}
  \\caption{Caption for ${fileName}}
  \\label{${label}}
\\end{figure}
`
}
