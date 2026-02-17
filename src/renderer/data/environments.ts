export interface EnvironmentInfo {
  name: string
  argSnippet?: string
}

export const environments: EnvironmentInfo[] = [
  // Standard LaTeX
  { name: 'document' },
  { name: 'figure', argSnippet: '[${1:htbp}]' },
  { name: 'figure*', argSnippet: '[${1:htbp}]' },
  { name: 'table', argSnippet: '[${1:htbp}]' },
  { name: 'table*', argSnippet: '[${1:htbp}]' },
  { name: 'tabular', argSnippet: '{${1:cols}}' },
  { name: 'tabular*', argSnippet: '{${1:width}}{${2:cols}}' },
  { name: 'array', argSnippet: '{${1:cols}}' },
  { name: 'enumerate' },
  { name: 'itemize' },
  { name: 'description' },
  { name: 'list', argSnippet: '{${1:label}}{${2:spacing}}' },
  { name: 'center' },
  { name: 'flushleft' },
  { name: 'flushright' },
  { name: 'minipage', argSnippet: '{${1:width}}' },
  { name: 'quotation' },
  { name: 'quote' },
  { name: 'verse' },
  { name: 'abstract' },
  { name: 'verbatim' },
  { name: 'titlepage' },
  { name: 'thebibliography', argSnippet: '{${1:99}}' },
  { name: 'theindex' },
  { name: 'picture', argSnippet: '(${1:width},${2:height})' },
  { name: 'letter' },

  // Math environments
  { name: 'equation' },
  { name: 'equation*' },
  { name: 'align' },
  { name: 'align*' },
  { name: 'gather' },
  { name: 'gather*' },
  { name: 'multline' },
  { name: 'multline*' },
  { name: 'flalign' },
  { name: 'flalign*' },
  { name: 'alignat', argSnippet: '{${1:n}}' },
  { name: 'alignat*', argSnippet: '{${1:n}}' },
  { name: 'split' },
  { name: 'cases' },
  { name: 'matrix' },
  { name: 'pmatrix' },
  { name: 'bmatrix' },
  { name: 'Bmatrix' },
  { name: 'vmatrix' },
  { name: 'Vmatrix' },
  { name: 'smallmatrix' },

  // Beamer
  { name: 'frame', argSnippet: '{${1:title}}' },
  { name: 'columns' },
  { name: 'column', argSnippet: '{${1:width}}' },
  { name: 'block', argSnippet: '{${1:title}}' },
  { name: 'alertblock', argSnippet: '{${1:title}}' },
  { name: 'exampleblock', argSnippet: '{${1:title}}' },
  { name: 'overlayarea', argSnippet: '{${1:width}}{${2:height}}' },
  { name: 'overprint' },

  // Floats & captions
  { name: 'subfigure', argSnippet: '{${1:width}}' },
  { name: 'subtable', argSnippet: '{${1:width}}' },
  { name: 'wrapfigure', argSnippet: '{${1:r}}{${2:width}}' },
  { name: 'wraptable', argSnippet: '{${1:r}}{${2:width}}' },

  // Theorem-like
  { name: 'theorem' },
  { name: 'lemma' },
  { name: 'corollary' },
  { name: 'proposition' },
  { name: 'definition' },
  { name: 'example' },
  { name: 'remark' },
  { name: 'proof' },

  // Code listings
  { name: 'lstlisting', argSnippet: '[${1:language=${2:Python}}]' },
  { name: 'minted', argSnippet: '{${1:python}}' },

  // TikZ
  { name: 'tikzpicture', argSnippet: '[${1:options}]' },
  { name: 'scope', argSnippet: '[${1:options}]' },

  // Misc
  { name: 'appendix' },
  { name: 'longtable', argSnippet: '{${1:cols}}' },
  { name: 'multicols', argSnippet: '{${1:2}}' }
]
