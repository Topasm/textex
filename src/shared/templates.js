export const templates = [
    {
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
\\author{Author Name}
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
\\author{Author Name}
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
        name: 'Beamer Presentation',
        description: 'Slide presentation using the Beamer class with a clean theme.',
        content: `\\documentclass{beamer}

\\usetheme{Madrid}
\\usecolortheme{default}

\\title{Presentation Title}
\\subtitle{Subtitle}
\\author{Author Name}
\\institute{Institution}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Outline}
\\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{Introduction}
\\begin{itemize}
  \\item First point
  \\item Second point
  \\item Third point
\\end{itemize}
\\end{frame}

\\section{Main Content}
\\begin{frame}{Main Content}
Your content here.
\\end{frame}

\\section{Conclusion}
\\begin{frame}{Conclusion}
\\begin{enumerate}
  \\item Summary point 1
  \\item Summary point 2
\\end{enumerate}
\\end{frame}

\\begin{frame}
\\centering
\\Large Thank You!
\\end{frame}

\\end{document}
`
    },
    {
        name: 'Letter',
        description: 'Formal letter using the LaTeX letter class.',
        content: `\\documentclass{letter}

\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}

\\signature{Your Name}
\\address{Your Address \\\\ City, State ZIP}

\\begin{document}

\\begin{letter}{Recipient Name \\\\ Recipient Address \\\\ City, State ZIP}

\\opening{Dear Recipient,}

Write your letter content here.

\\closing{Sincerely,}

\\end{letter}

\\end{document}
`
    },
    {
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
  {\\Huge\\bfseries Your Name}\\\\[4pt]
  your.email@example.com \\quad | \\quad +1 (555) 000-0000 \\quad | \\quad City, Country
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
];
