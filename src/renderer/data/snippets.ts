export interface LatexSnippet {
  label: string
  prefix: string
  body: string
  description: string
  category: string
}

export const snippets: LatexSnippet[] = [
  // Environments
  { label: 'Begin/End Environment', prefix: 'begin', body: '\\\\begin{${1:environment}}\n\t$0\n\\\\end{${1:environment}}', description: 'Generic environment', category: 'environment' },
  { label: 'Figure', prefix: 'figure', body: '\\\\begin{figure}[${1:htbp}]\n\t\\\\centering\n\t\\\\includegraphics[width=${2:0.8}\\\\textwidth]{${3:filename}}\n\t\\\\caption{${4:caption}}\n\t\\\\label{fig:${5:label}}\n\\\\end{figure}', description: 'Figure environment with image', category: 'environment' },
  { label: 'Table', prefix: 'table', body: '\\\\begin{table}[${1:htbp}]\n\t\\\\centering\n\t\\\\caption{${2:caption}}\n\t\\\\label{tab:${3:label}}\n\t\\\\begin{tabular}{${4:cc}}\n\t\t\\\\hline\n\t\t$0 \\\\\\\\\n\t\t\\\\hline\n\t\\\\end{tabular}\n\\\\end{table}', description: 'Table environment', category: 'environment' },
  { label: 'Enumerate', prefix: 'enumerate', body: '\\\\begin{enumerate}\n\t\\\\item ${1:item}\n\t\\\\item ${2:item}\n\\\\end{enumerate}', description: 'Numbered list', category: 'environment' },
  { label: 'Itemize', prefix: 'itemize', body: '\\\\begin{itemize}\n\t\\\\item ${1:item}\n\t\\\\item ${2:item}\n\\\\end{itemize}', description: 'Bullet list', category: 'environment' },
  { label: 'Equation', prefix: 'equation', body: '\\\\begin{equation}\n\t${1:equation}\n\t\\\\label{eq:${2:label}}\n\\\\end{equation}', description: 'Numbered equation', category: 'math' },
  { label: 'Align', prefix: 'align', body: '\\\\begin{align}\n\t${1:equation} &= ${2:expression} \\\\\\\\\n\t${3:equation} &= ${4:expression}\n\\\\end{align}', description: 'Aligned equations', category: 'math' },
  { label: 'Align*', prefix: 'align*', body: '\\\\begin{align*}\n\t${1:equation} &= ${2:expression} \\\\\\\\\n\t${3:equation} &= ${4:expression}\n\\\\end{align*}', description: 'Aligned equations (unnumbered)', category: 'math' },
  { label: 'Verbatim', prefix: 'verbatim', body: '\\\\begin{verbatim}\n${1:code}\n\\\\end{verbatim}', description: 'Verbatim text', category: 'environment' },
  { label: 'Minipage', prefix: 'minipage', body: '\\\\begin{minipage}{${1:0.45}\\\\textwidth}\n\t$0\n\\\\end{minipage}', description: 'Minipage', category: 'environment' },
  { label: 'Abstract', prefix: 'abstract', body: '\\\\begin{abstract}\n\t$0\n\\\\end{abstract}', description: 'Abstract environment', category: 'environment' },
  { label: 'Quote', prefix: 'quote', body: '\\\\begin{quote}\n\t$0\n\\\\end{quote}', description: 'Block quote', category: 'environment' },
  { label: 'Description', prefix: 'description', body: '\\\\begin{description}\n\t\\\\item[${1:term}] ${2:description}\n\\\\end{description}', description: 'Description list', category: 'environment' },
  { label: 'Frame (Beamer)', prefix: 'frame', body: '\\\\begin{frame}{${1:Title}}\n\t$0\n\\\\end{frame}', description: 'Beamer slide frame', category: 'environment' },
  { label: 'Columns (Beamer)', prefix: 'columns', body: '\\\\begin{columns}\n\t\\\\begin{column}{0.5\\\\textwidth}\n\t\t${1:left}\n\t\\\\end{column}\n\t\\\\begin{column}{0.5\\\\textwidth}\n\t\t${2:right}\n\t\\\\end{column}\n\\\\end{columns}', description: 'Two-column layout', category: 'environment' },

  // Sections
  { label: 'Section', prefix: 'sec', body: '\\\\section{${1:title}}\n\\\\label{sec:${2:label}}\n\n$0', description: 'Section heading', category: 'structure' },
  { label: 'Subsection', prefix: 'sub', body: '\\\\subsection{${1:title}}\n\\\\label{subsec:${2:label}}\n\n$0', description: 'Subsection heading', category: 'structure' },
  { label: 'Subsubsection', prefix: 'subsub', body: '\\\\subsubsection{${1:title}}\n\n$0', description: 'Subsubsection heading', category: 'structure' },
  { label: 'Chapter', prefix: 'chap', body: '\\\\chapter{${1:title}}\n\\\\label{chap:${2:label}}\n\n$0', description: 'Chapter heading', category: 'structure' },
  { label: 'Paragraph', prefix: 'par', body: '\\\\paragraph{${1:title}} $0', description: 'Paragraph heading', category: 'structure' },

  // Formatting
  { label: 'Bold', prefix: 'bf', body: '\\\\textbf{${1:text}}', description: 'Bold text', category: 'formatting' },
  { label: 'Italic', prefix: 'it', body: '\\\\textit{${1:text}}', description: 'Italic text', category: 'formatting' },
  { label: 'Underline', prefix: 'ul', body: '\\\\underline{${1:text}}', description: 'Underlined text', category: 'formatting' },
  { label: 'Emphasis', prefix: 'em', body: '\\\\emph{${1:text}}', description: 'Emphasized text', category: 'formatting' },
  { label: 'Typewriter', prefix: 'tt', body: '\\\\texttt{${1:text}}', description: 'Monospace text', category: 'formatting' },
  { label: 'Small Caps', prefix: 'sc', body: '\\\\textsc{${1:text}}', description: 'Small caps', category: 'formatting' },

  // References
  { label: 'Citation', prefix: 'cite', body: '\\\\cite{${1:key}}', description: 'Citation reference', category: 'reference' },
  { label: 'Reference', prefix: 'ref', body: '\\\\ref{${1:label}}', description: 'Cross-reference', category: 'reference' },
  { label: 'Label', prefix: 'label', body: '\\\\label{${1:label}}', description: 'Label', category: 'reference' },
  { label: 'Page Reference', prefix: 'pageref', body: '\\\\pageref{${1:label}}', description: 'Page reference', category: 'reference' },
  { label: 'Footnote', prefix: 'fn', body: '\\\\footnote{${1:text}}', description: 'Footnote', category: 'reference' },
  { label: 'URL', prefix: 'url', body: '\\\\url{${1:url}}', description: 'URL link', category: 'reference' },
  { label: 'Hyperref', prefix: 'href', body: '\\\\href{${1:url}}{${2:text}}', description: 'Hyperlink', category: 'reference' },

  // Math
  { label: 'Inline Math', prefix: 'mk', body: '\\$${1:math}\\$', description: 'Inline math mode', category: 'math' },
  { label: 'Display Math', prefix: 'dm', body: '\\[\n\t${1:math}\n\\]', description: 'Display math mode', category: 'math' },
  { label: 'Fraction', prefix: 'frac', body: '\\\\frac{${1:numerator}}{${2:denominator}}', description: 'Fraction', category: 'math' },
  { label: 'Square Root', prefix: 'sqrt', body: '\\\\sqrt{${1:expression}}', description: 'Square root', category: 'math' },
  { label: 'Summation', prefix: 'sum', body: '\\\\sum_{${1:i=1}}^{${2:n}} ${3:expression}', description: 'Summation', category: 'math' },
  { label: 'Integral', prefix: 'int', body: '\\\\int_{${1:a}}^{${2:b}} ${3:f(x)} \\\\, dx', description: 'Integral', category: 'math' },
  { label: 'Limit', prefix: 'lim', body: '\\\\lim_{${1:x \\\\to \\\\infty}} ${2:expression}', description: 'Limit', category: 'math' },
  { label: 'Matrix', prefix: 'matrix', body: '\\\\begin{${1:pmatrix}}\n\t${2:a} & ${3:b} \\\\\\\\\n\t${4:c} & ${5:d}\n\\\\end{${1:pmatrix}}', description: 'Matrix', category: 'math' },
  { label: 'Cases', prefix: 'cases', body: '\\\\begin{cases}\n\t${1:case1} & \\\\text{if } ${2:cond1} \\\\\\\\\n\t${3:case2} & \\\\text{otherwise}\n\\\\end{cases}', description: 'Piecewise function', category: 'math' },

  // Preamble
  { label: 'Use Package', prefix: 'pkg', body: '\\\\usepackage{${1:package}}', description: 'Import package', category: 'preamble' },
  { label: 'Use Package (options)', prefix: 'pkgo', body: '\\\\usepackage[${1:options}]{${2:package}}', description: 'Import package with options', category: 'preamble' },
  { label: 'New Command', prefix: 'newcmd', body: '\\\\newcommand{\\\\${1:name}}[${2:args}]{${3:definition}}', description: 'Define new command', category: 'preamble' },
  { label: 'Document Class', prefix: 'docclass', body: '\\\\documentclass[${1:options}]{${2:article}}', description: 'Document class', category: 'preamble' },
  { label: 'Include Graphics', prefix: 'img', body: '\\\\includegraphics[width=${1:0.8}\\\\textwidth]{${2:filename}}', description: 'Include image', category: 'formatting' },
  { label: 'Input File', prefix: 'input', body: '\\\\input{${1:filename}}', description: 'Input file', category: 'structure' },
  { label: 'Include File', prefix: 'include', body: '\\\\include{${1:filename}}', description: 'Include file (new page)', category: 'structure' },
  { label: 'Bibliography', prefix: 'bib', body: '\\\\bibliography{${1:references}}\n\\\\bibliographystyle{${2:plain}}', description: 'Bibliography', category: 'reference' },
]
