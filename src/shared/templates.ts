export interface Template {
  id: string
  name: string
  description: string
  content: string
  builtIn: boolean
  files?: Record<string, string> // relative path -> content (base64 or text)
}

export const guidedDemoTemplate: Template = {
  id: 'guided-demo',
  builtIn: true,
  name: 'TextEx Guided Paper',
  description:
    'A small, compile-ready paper that introduces editing, citations, research context, submission checks, and Overleaf export.',
  content: `\\documentclass[10pt,letterpaper]{article}

\\usepackage{iftex}
\\ifPDFTeX
  \\usepackage[utf8]{inputenc}
  \\usepackage[T1]{fontenc}
\\fi
\\usepackage{amsmath}
\\usepackage[margin=1in]{geometry}
\\usepackage[hidelinks]{hyperref}

\\title{A Guided Paper in TextEx}
\\author{TextEx User}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This compact project is a safe place to try the complete TextEx paper workflow.
Edit a sentence, compile the document, inspect its citation, and run a submission check.
\\end{abstract}

\\section{Introduction}
% Guided step 1: edit the next sentence, then compile with Cmd/Ctrl+Enter.
Good research tools should keep writing, evidence, validation, and submission in one loop.
LaTeX provides a durable foundation for that workflow~\\cite{lamport1994latex}.

\\section{A Small Result}
% Guided step 2: change the equation and use forward/inverse PDF sync.
For a normalized score vector $p$, a useful sanity check is
\\begin{equation}
  \\sum_{i=1}^{n} p_i = 1.
  \\label{eq:normalization}
\\end{equation}
Equation~\\ref{eq:normalization} also demonstrates cross-reference diagnostics.

\\section{Next Steps}
Open \\texttt{GUIDED\\_TOUR.md} for a short checklist covering References, Research Chat,
compiler switching, submission checks, and Overleaf ZIP export.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,
  files: {
    'references.bib': `@book{lamport1994latex,
  author    = {Leslie Lamport},
  title     = {LaTeX: A Document Preparation System},
  publisher = {Addison-Wesley},
  year      = {1994},
  edition   = {2}
}
`,
    'GUIDED_TOUR.md': `# TextEx guided tour

This project is intentionally small and works with both Tectonic and pdfLaTeX.

1. Edit the marked sentence in \`main.tex\`, then compile with Cmd/Ctrl+Enter.
2. In Settings, switch between Tectonic and pdfLaTeX and compile again. TextEx keeps each engine's generated files in a separate cache.
3. Open References and locate \`lamport1994latex\`. Jump from the citation to its source use.
4. Open Research Chat. The included project profile supplies terminology and writing preferences without adding external services.
5. Try source/PDF synchronization around Equation 1.
6. Run Submission Check and inspect every finding before applying a change.
7. Export an Overleaf ZIP. Generated build files stay out of the archive.

You can delete this project at any time; it does not alter application settings.
`,
    '.textex/research-profile.json': `{
  "version": 1,
  "paper": {
    "title": "A Guided Paper in TextEx",
    "authors": []
  },
  "resources": [],
  "instructions": [
    "Use concise academic English.",
    "Call the example quantity a normalized score vector."
  ]
}
`
  }
}

export const builtInTemplates: Template[] = [
  guidedDemoTemplate,
  {
    id: 'article',
    builtIn: true,
    name: 'Article',
    description: 'Standard academic article with sections, bibliography, and common packages.',
    content: `\\documentclass[12pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

\\title{Your Title Here}
\\author{{{AUTHOR}}}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract goes here.
\\end{abstract}

\\section{Introduction}
Start writing your introduction here.

\\section{Methods}

\\section{Results}

\\section{Conclusion}

\\bibliographystyle{plain}
% \\bibliography{references}

\\end{document}
`
  },
  {
    id: 'report',
    builtIn: true,
    name: 'Report',
    description: 'Technical or academic report with chapters, table of contents, and appendices.',
    content: `\\documentclass[12pt,a4paper]{report}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

\\title{Report Title}
\\author{{{AUTHOR}}}
\\date{\\today}

\\begin{document}

\\maketitle
\\tableofcontents

\\chapter{Introduction}
Begin your report here.

\\chapter{Background}

\\chapter{Methodology}

\\chapter{Results}

\\chapter{Discussion}

\\chapter{Conclusion}

\\appendix
\\chapter{Additional Data}

\\bibliographystyle{plain}
% \\bibliography{references}

\\end{document}
`
  },
  {
    id: 'cv-resume',
    builtIn: true,
    name: 'CV / Resume',
    description: 'Curriculum vitae with sections for education, experience, and skills.',
    content: `\\documentclass[11pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}

\\pagestyle{empty}

\\newcommand{\\cvSection}[1]{%
  \\vspace{8pt}\\noindent\\textbf{\\Large #1}\\\\[-6pt]
  \\noindent\\rule{\\textwidth}{0.5pt}\\vspace{4pt}
}

\\begin{document}

\\begin{center}
  {\\Huge\\bfseries {{AUTHOR}}}\\\\[4pt]
  {{EMAIL}} \\quad | \\quad +1 (555) 000-0000 \\quad | \\quad City, Country
\\end{center}

\\cvSection{Education}
\\textbf{University Name} \\hfill 2020--2024\\\\
B.Sc.\\ in Computer Science \\hfill GPA: 3.8/4.0

\\cvSection{Experience}
\\textbf{Company Name} --- Software Engineer \\hfill Jun 2024--Present
\\begin{itemize}[leftmargin=*, nosep]
  \\item Developed features for the main product
  \\item Improved performance by 20\\%
\\end{itemize}

\\cvSection{Skills}
\\textbf{Languages:} Python, JavaScript, C++\\\\
\\textbf{Tools:} Git, Docker, LaTeX

\\cvSection{Publications}
Your Name et al. \`\`Paper Title,'' \\textit{Journal Name}, 2024.

\\end{document}
`
  }
]

/** Backward-compatible alias */
export const templates = builtInTemplates
