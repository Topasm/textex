import type { ResearchPerson, ResearchProfile } from '../../shared/types'

export interface ResearchProfileSuggestion {
  title?: string
  doi?: string
  arxiv?: string
  authors: ResearchPerson[]
}

export type ResearchProfileSuggestionField = 'title' | 'doi' | 'arxiv' | 'authors'

function stripLatexComments(content: string): string {
  return content
    .split(/\r?\n/gu)
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== '%') continue
        let escapeCount = 0
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
          escapeCount += 1
        }
        if (escapeCount % 2 === 0) return line.slice(0, index)
      }
      return line
    })
    .join('\n')
}

function latexArguments(content: string, command: string): string[] {
  const startPattern = new RegExp(
    `\\\\${command}(?![A-Za-z@])\\*?\\s*(?:\\[[^\\]]*\\]\\s*)?\\{`,
    'giu'
  )
  const arguments_: string[] = []
  let match: RegExpExecArray | null
  while ((match = startPattern.exec(content))) {
    let depth = 1
    for (let index = match.index + match[0].length; index < content.length; index += 1) {
      const character = content[index]
      if (character === '{' && content[index - 1] !== '\\') depth += 1
      if (character === '}' && content[index - 1] !== '\\') depth -= 1
      if (depth !== 0) continue
      arguments_.push(content.slice(match.index + match[0].length, index).trim())
      startPattern.lastIndex = index + 1
      break
    }
  }
  return arguments_
}

function latexArgument(content: string, commands: string[]): string | undefined {
  for (const command of commands) {
    const value = latexArguments(content, command).find((argument) => argument.trim())
    if (value) return value
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

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined
  const plain = plainLatexText(value)
    .replace(/^doi:\s*/iu, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
  return plain.match(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/iu)?.[0]
}

function normalizeArxiv(value: string | undefined): string | undefined {
  if (!value) return undefined
  const plain = plainLatexText(value)
    .replace(/^arxiv:\s*/iu, '')
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//iu, '')
    .replace(/\.pdf$/iu, '')
  return plain.match(/^\d{4}\.\d{4,5}(?:v\d+)?$/u)?.[0]
}

export function suggestResearchProfileFromLatex(content: string): ResearchProfileSuggestion {
  const uncommented = stripLatexComments(content)
  const authorNames = latexArguments(uncommented, 'author')
    .flatMap((rawAuthors) => rawAuthors.split(/\\and|\\\\|\n|;/gu))
    .map(plainLatexText)
    .filter(Boolean)
  const usedIds = new Set<string>()
  const authors = authorNames.map((name, index) => {
    const baseId = personId(name, index)
    let id = baseId
    let duplicate = 2
    while (usedIds.has(id)) {
      id = `${baseId}-${duplicate}`
      duplicate += 1
    }
    usedIds.add(id)
    return { id, name }
  })
  const rawTitle = latexArgument(uncommented, ['title'])

  return {
    title: rawTitle ? plainLatexText(rawTitle) : undefined,
    doi: normalizeDoi(latexArgument(uncommented, ['doi'])),
    arxiv: normalizeArxiv(latexArgument(uncommented, ['arxiv', 'arxivId'])),
    authors
  }
}

export function applicableResearchProfileSuggestionFields(
  profile: ResearchProfile,
  suggestion: ResearchProfileSuggestion,
  excluded: ReadonlySet<ResearchProfileSuggestionField> = new Set()
): ResearchProfileSuggestionField[] {
  const fields: ResearchProfileSuggestionField[] = []
  if (!excluded.has('title') && !profile.paper.title.trim() && suggestion.title) {
    fields.push('title')
  }
  if (!excluded.has('doi') && !profile.paper.doi?.trim() && suggestion.doi) fields.push('doi')
  if (!excluded.has('arxiv') && !profile.paper.arxiv?.trim() && suggestion.arxiv) {
    fields.push('arxiv')
  }
  if (
    !excluded.has('authors') &&
    profile.paper.authors.length === 0 &&
    suggestion.authors.length > 0
  ) {
    fields.push('authors')
  }
  return fields
}

export function applyResearchProfileSuggestion(
  profile: ResearchProfile,
  suggestion: ResearchProfileSuggestion,
  excluded: ReadonlySet<ResearchProfileSuggestionField> = new Set()
): ResearchProfile {
  const fields = new Set(applicableResearchProfileSuggestionFields(profile, suggestion, excluded))
  if (fields.size === 0) return profile
  return {
    ...profile,
    paper: {
      ...profile.paper,
      title: fields.has('title') ? suggestion.title! : profile.paper.title,
      doi: fields.has('doi') ? suggestion.doi : profile.paper.doi,
      arxiv: fields.has('arxiv') ? suggestion.arxiv : profile.paper.arxiv,
      authors: fields.has('authors') ? suggestion.authors : profile.paper.authors
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
