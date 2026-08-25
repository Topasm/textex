import { describe, expect, it } from 'vitest'
import type { ResearchProfile } from '../../shared/types'
import {
  alternateGitRemote,
  applicableResearchProfileSuggestionFields,
  applyResearchProfileSuggestion,
  suggestResearchProfileFromLatex
} from '../../renderer/services/researchProfileSuggestions'

describe('research profile suggestions', () => {
  it('extracts paper metadata without treating it as trusted instructions', () => {
    expect(
      suggestResearchProfileFromLatex(String.raw`
        \title{A \emph{Useful} Paper}
        \author{Ada Lovelace \and Alan Turing}
        \doi{10.1234/example.42}
        \arxiv{2401.01234v2}
      `)
    ).toEqual({
      title: 'A Useful Paper',
      doi: '10.1234/example.42',
      arxiv: '2401.01234v2',
      authors: [
        { id: 'author-ada-lovelace', name: 'Ada Lovelace' },
        { id: 'author-alan-turing', name: 'Alan Turing' }
      ]
    })
  })

  it('ignores comments and identifier-like text outside explicit metadata commands', () => {
    expect(
      suggestResearchProfileFromLatex(String.raw`
        % \title{Commented title}
        \title[Short title]{Visible \emph{Title}}
        \author{Ada Lovelace}
        \author{Ada Lovelace}
        % \doi{10.9999/commented}
        A cited work has DOI 10.1234/not-the-project and arXiv:2401.99999.
      `)
    ).toEqual({
      title: 'Visible Title',
      doi: undefined,
      arxiv: undefined,
      authors: [
        { id: 'author-ada-lovelace', name: 'Ada Lovelace' },
        { id: 'author-ada-lovelace-2', name: 'Ada Lovelace' }
      ]
    })
  })

  it('normalizes explicit DOI and arXiv URLs', () => {
    expect(
      suggestResearchProfileFromLatex(
        String.raw`\doi{https://doi.org/10.1234/Example}\arxivId{https://arxiv.org/abs/2401.01234v3}`
      )
    ).toMatchObject({ doi: '10.1234/Example', arxiv: '2401.01234v3' })
  })

  it('only fills missing profile values', () => {
    const profile: ResearchProfile = {
      version: 1,
      paper: { title: 'Kept', doi: '10.existing/value', authors: [] },
      resources: [],
      instructions: []
    }
    const result = applyResearchProfileSuggestion(profile, {
      title: 'Ignored',
      doi: '10.new/value',
      arxiv: '2401.00001',
      authors: [{ id: 'author-a', name: 'A' }]
    })
    expect(result.paper).toMatchObject({
      title: 'Kept',
      doi: '10.existing/value',
      arxiv: '2401.00001',
      authors: [{ id: 'author-a', name: 'A' }]
    })
  })

  it('respects explicitly excluded empty fields and reuses the profile when nothing applies', () => {
    const profile: ResearchProfile = {
      version: 1,
      paper: { title: '', authors: [] },
      resources: [],
      instructions: []
    }
    const suggestion = {
      title: 'Document title',
      authors: [{ id: 'author-ada', name: 'Ada' }]
    }
    const excluded = new Set(['title'] as const)

    expect(applicableResearchProfileSuggestionFields(profile, suggestion, excluded)).toEqual([
      'authors'
    ])
    const result = applyResearchProfileSuggestion(profile, suggestion, excluded)
    expect(result.paper.title).toBe('')
    expect(result.paper.authors).toEqual(suggestion.authors)
    expect(applyResearchProfileSuggestion(result, suggestion, excluded)).toBe(result)
  })

  it('converts GitHub HTTPS and SSH remotes without credentials', () => {
    expect(alternateGitRemote('https://github.com/openai/codex')).toBe(
      'git@github.com:openai/codex.git'
    )
    expect(alternateGitRemote('git@github.com:openai/codex.git')).toBe(
      'https://github.com/openai/codex'
    )
    expect(alternateGitRemote('ssh://private.example/repo')).toBeUndefined()
  })
})
