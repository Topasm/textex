import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  parseDocumentStructure,
  getSectionContent,
  updateSectionContent,
  listPapers,
  resolveSectionPath
} from '../../shared/structure'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function writeTexFile(name: string, content: string): Promise<string> {
  const filePath = path.join(tmpDir, name)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

// --- Metadata extraction ---

describe('metadata extraction', () => {
  it('extracts documentclass, title, author, date', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass[12pt,a4paper]{article}
\\title{My Great Paper}
\\author{Jane Doe}
\\date{2025-01-15}
\\begin{document}
\\maketitle
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.metadata.documentClass).toBe('article')
    expect(result.metadata.documentClassOptions).toEqual(['12pt', 'a4paper'])
    expect(result.metadata.title).toBe('My Great Paper')
    expect(result.metadata.author).toBe('Jane Doe')
    expect(result.metadata.date).toBe('2025-01-15')
  })

  it('extracts abstract', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\begin{abstract}
This is the abstract text.
It spans multiple lines.
\\end{abstract}
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.metadata.abstract).toBe('This is the abstract text.\nIt spans multiple lines.')
  })

  it('extracts packages', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage[utf8]{inputenc}
\\usepackage{graphicx,hyperref}
\\begin{document}
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.metadata.packages).toEqual(['amsmath', 'inputenc', 'graphicx', 'hyperref'])
  })

  it('handles missing metadata gracefully', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
Hello world.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.metadata.title).toBeNull()
    expect(result.metadata.author).toBeNull()
    expect(result.metadata.date).toBeNull()
    expect(result.metadata.abstract).toBeNull()
  })
})

// --- Section parsing ---

describe('section parsing', () => {
  it('parses flat sections', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Some intro text.
\\section{Methods}
Method details.
\\section{Results}
Results here.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(3)
    expect(result.outline[0].title).toBe('Introduction')
    expect(result.outline[0].level).toBe(1)
    expect(result.outline[1].title).toBe('Methods')
    expect(result.outline[2].title).toBe('Results')
  })

  it('parses nested hierarchy', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Intro text.
\\subsection{Background}
Background info.
\\subsection{Motivation}
Motivation info.
\\section{Methods}
Method text.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(2)
    expect(result.outline[0].title).toBe('Introduction')
    expect(result.outline[0].children).toHaveLength(2)
    expect(result.outline[0].children[0].title).toBe('Background')
    expect(result.outline[0].children[0].level).toBe(2)
    expect(result.outline[0].children[1].title).toBe('Motivation')
    expect(result.outline[1].title).toBe('Methods')
    expect(result.outline[1].children).toHaveLength(0)
  })

  it('parses chapters', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{book}
\\begin{document}
\\chapter{First Chapter}
\\section{Section One}
Text here.
\\chapter{Second Chapter}
More text.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(2)
    expect(result.outline[0].title).toBe('First Chapter')
    expect(result.outline[0].level).toBe(0)
    expect(result.outline[0].children).toHaveLength(1)
    expect(result.outline[0].children[0].title).toBe('Section One')
  })

  it('parses starred variants', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section*{Acknowledgments}
Thank you.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(1)
    expect(result.outline[0].title).toBe('Acknowledgments')
    expect(result.outline[0].starred).toBe(true)
  })

  it('handles optional [short] titles', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section[Short]{A Very Long Section Title}
Content.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(1)
    expect(result.outline[0].title).toBe('A Very Long Section Title')
  })

  it('handles nested braces in titles', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{A $\\beta$ Title}
Content here.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(1)
    expect(result.outline[0].title).toBe('A $\\beta$ Title')
  })

  it('skips commented-out sections', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Real Section}
Content.
% \\section{Commented Section}
% Commented content.
\\section{Another Real}
More content.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline).toHaveLength(2)
    expect(result.outline[0].title).toBe('Real Section')
    expect(result.outline[1].title).toBe('Another Real')
  })

  it('tracks correct start and end lines', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{First}
Line A.
Line B.
\\section{Second}
Line C.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    expect(result.outline[0].startLine).toBe(3)
    expect(result.outline[0].endLine).toBe(5)
    expect(result.outline[1].startLine).toBe(6)
  })
})

// --- Multi-file ---

describe('multi-file support', () => {
  it('follows \\input{} directives', async () => {
    await writeTexFile(
      'chapter1.tex',
      `\\section{Imported Section}
Imported content.
`
    )
    const mainFile = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\input{chapter1}
\\section{Local Section}
Local content.
\\end{document}
`
    )
    const result = await parseDocumentStructure(mainFile)
    expect(result.outline).toHaveLength(2)
    expect(result.outline[0].title).toBe('Imported Section')
    expect(result.outline[1].title).toBe('Local Section')
    expect(result.files.length).toBeGreaterThanOrEqual(2)
  })

  it('follows \\include{} directives', async () => {
    await writeTexFile(
      'part.tex',
      `\\section{Included Section}
Content from include.
`
    )
    const mainFile = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\include{part}
\\end{document}
`
    )
    const result = await parseDocumentStructure(mainFile)
    expect(result.outline).toHaveLength(1)
    expect(result.outline[0].title).toBe('Included Section')
  })

  it('auto-appends .tex extension', async () => {
    await writeTexFile(
      'intro.tex',
      `\\section{Auto Extension}
Works.
`
    )
    const mainFile = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\input{intro}
\\end{document}
`
    )
    const result = await parseDocumentStructure(mainFile)
    expect(result.outline).toHaveLength(1)
    expect(result.outline[0].title).toBe('Auto Extension')
  })

  it('guards against circular includes', async () => {
    const mainFile = await writeTexFile(
      'circular.tex',
      `\\documentclass{article}
\\begin{document}
\\input{circular}
\\section{Safe}
OK.
\\end{document}
`
    )
    // Should not hang or throw
    const result = await parseDocumentStructure(mainFile)
    expect(result.outline).toHaveLength(1)
    expect(result.outline[0].title).toBe('Safe')
  })
})

// --- resolveSectionPath ---

describe('resolveSectionPath', () => {
  it('resolves a top-level section', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Text.
\\section{Methods}
Text.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    const node = resolveSectionPath(result.outline, 'Methods')
    expect(node).not.toBeNull()
    expect(node!.title).toBe('Methods')
  })

  it('resolves a nested slash path', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Methods}
\\subsection{Data Collection}
Collected data.
\\subsection{Analysis}
Analyzed.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    const node = resolveSectionPath(result.outline, 'Methods/Data Collection')
    expect(node).not.toBeNull()
    expect(node!.title).toBe('Data Collection')
    expect(node!.level).toBe(2)
  })

  it('returns null for non-existent path', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Text.
\\end{document}
`
    )
    const result = await parseDocumentStructure(filePath)
    const node = resolveSectionPath(result.outline, 'NonExistent')
    expect(node).toBeNull()
  })
})

// --- getSectionContent ---

describe('getSectionContent', () => {
  it('reads content of a mid-document section', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Intro line 1.
Intro line 2.
\\section{Methods}
Methods content.
\\end{document}
`
    )
    const result = await getSectionContent(filePath, 'Introduction')
    expect(result.content).toContain('Intro line 1.')
    expect(result.content).toContain('Intro line 2.')
    expect(result.content).not.toContain('Methods content.')
  })

  it('reads last section content up to end of document', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Only Section}
Last section line 1.
Last section line 2.
\\end{document}
`
    )
    const result = await getSectionContent(filePath, 'Only Section')
    expect(result.content).toContain('Last section line 1.')
    expect(result.content).toContain('Last section line 2.')
  })

  it('reads content from included files', async () => {
    await writeTexFile(
      'chapter.tex',
      `\\section{Included}
Content in included file.
`
    )
    const mainFile = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\input{chapter}
\\end{document}
`
    )
    const result = await getSectionContent(mainFile, 'Included')
    expect(result.content).toContain('Content in included file.')
  })

  it('throws for non-existent section', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Real}
Content.
\\end{document}
`
    )
    await expect(getSectionContent(filePath, 'Fake')).rejects.toThrow('Section not found: Fake')
  })
})

// --- updateSectionContent ---

describe('updateSectionContent', () => {
  it('replaces section content preserving the heading', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Old intro content.
\\section{Methods}
Methods content.
\\end{document}
`
    )
    await updateSectionContent(filePath, 'Introduction', 'New intro content.')
    const updated = await fs.readFile(filePath, 'utf-8')
    expect(updated).toContain('\\section{Introduction}')
    expect(updated).toContain('New intro content.')
    expect(updated).not.toContain('Old intro content.')
    expect(updated).toContain('Methods content.')
  })

  it('replaces last section content', async () => {
    const filePath = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\section{Only}
Old content.
\\end{document}
`
    )
    await updateSectionContent(filePath, 'Only', 'Replaced content.')
    const updated = await fs.readFile(filePath, 'utf-8')
    expect(updated).toContain('\\section{Only}')
    expect(updated).toContain('Replaced content.')
    expect(updated).not.toContain('Old content.')
  })

  it('updates content in included files', async () => {
    const chapterPath = await writeTexFile(
      'chapter.tex',
      `\\section{Sub}
Old sub content.
`
    )
    const mainFile = await writeTexFile(
      'main.tex',
      `\\documentclass{article}
\\begin{document}
\\input{chapter}
\\end{document}
`
    )
    await updateSectionContent(mainFile, 'Sub', 'New sub content.')
    const updated = await fs.readFile(chapterPath, 'utf-8')
    expect(updated).toContain('\\section{Sub}')
    expect(updated).toContain('New sub content.')
    expect(updated).not.toContain('Old sub content.')
  })
})

// --- listPapers ---

describe('listPapers', () => {
  it('finds main files with \\documentclass', async () => {
    await writeTexFile('paper1.tex', '\\documentclass{article}\n\\title{Paper One}\n\\begin{document}\n\\end{document}\n')
    await writeTexFile('paper2.tex', '\\documentclass{report}\n\\title{Paper Two}\n\\begin{document}\n\\end{document}\n')
    // This is a fragment — no documentclass
    await writeTexFile('fragment.tex', '\\section{Fragment}\nSome text.\n')

    const papers = await listPapers(tmpDir)
    expect(papers.length).toBe(2)
    const titles = papers.map((p) => p.title).sort()
    expect(titles).toEqual(['Paper One', 'Paper Two'])
  })

  it('extracts title from documents', async () => {
    await writeTexFile('main.tex', '\\documentclass{article}\n\\title{My Title}\n\\begin{document}\n\\end{document}\n')
    const papers = await listPapers(tmpDir)
    expect(papers[0].title).toBe('My Title')
    expect(papers[0].documentClass).toBe('article')
  })

  it('uses filename when title is missing', async () => {
    await writeTexFile('notitle.tex', '\\documentclass{article}\n\\begin{document}\n\\end{document}\n')
    const papers = await listPapers(tmpDir)
    expect(papers[0].title).toBe('notitle')
  })

  it('scans subdirectories', async () => {
    await writeTexFile('sub/deep.tex', '\\documentclass{article}\n\\title{Deep Paper}\n\\begin{document}\n\\end{document}\n')
    const papers = await listPapers(tmpDir)
    expect(papers.length).toBe(1)
    expect(papers[0].title).toBe('Deep Paper')
  })
})
