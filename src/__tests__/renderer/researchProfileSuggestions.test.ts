import { describe, expect, it } from 'vitest'
import type { ResearchProfile } from '../../shared/types'
import {
  alternateGitRemote,
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
        arXiv:2401.01234v2
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
