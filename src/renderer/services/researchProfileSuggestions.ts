import type { ResearchPerson, ResearchProfile } from '../../shared/types'

export interface ResearchProfileSuggestion {
  title?: string
  doi?: string
  arxiv?: string
  authors: ResearchPerson[]
}

function latexArgument(content: string, command: string): string | undefined {
  const startPattern = new RegExp(`\\\\${command}\\s*\\{`, 'u')
  const match = startPattern.exec(content)
  if (!match) return undefined

  let depth = 1
  for (let index = match.index + match[0].length; index < content.length; index += 1) {
    const character = content[index]
    if (character === '{' && content[index - 1] !== '\\') depth += 1
    if (character === '}' && content[index - 1] !== '\\') depth -= 1
    if (depth === 0) return content.slice(match.index + match[0].length, index).trim()
  }
  return undefined
}

function plainLatexText(value: string): string {
  return value
    .replace(/\\(?:thanks|footnote)\s*\{[^{}]*\}/gu, '')
    .replace(/\\(?:text[a-zA-Z]*|emph|url|href)\s*\{([^{}]*)\}/gu, '$1')
    .replace(/[{}]/gu, '')
    .replace(/~|\\,/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function personId(name: string, index: number): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
  return `author-${slug || index + 1}`
}

export function suggestResearchProfileFromLatex(content: string): ResearchProfileSuggestion {
  const rawAuthors = latexArgument(content, 'author')
  const authorNames = rawAuthors
    ? rawAuthors
        .split(/\\and|\\\\|\n|;/gu)
        .map(plainLatexText)
        .filter(Boolean)
    : []
  const doi = content.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/iu)?.[0].replace(/[.,;]$/u, '')
  const arxiv = content.match(/\b(?:arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)\b/iu)?.[1]

  return {
    title: latexArgument(content, 'title')
      ? plainLatexText(latexArgument(content, 'title')!)
      : undefined,
    doi,
    arxiv,
    authors: authorNames.map((name, index) => ({ id: personId(name, index), name }))
  }
}

export function applyResearchProfileSuggestion(
  profile: ResearchProfile,
  suggestion: ResearchProfileSuggestion
): ResearchProfile {
  return {
    ...profile,
    paper: {
      ...profile.paper,
      title: profile.paper.title || suggestion.title || '',
      doi: profile.paper.doi || suggestion.doi,
      arxiv: profile.paper.arxiv || suggestion.arxiv,
      authors: profile.paper.authors.length > 0 ? profile.paper.authors : suggestion.authors
    }
  }
}

export function alternateGitRemote(url: string): string | undefined {
  const trimmed = url.trim().replace(/\/$/u, '')
  const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/iu)
  if (https) return `git@github.com:${https[1]}/${https[2]}.git`
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/iu)
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`
  return undefined
}
