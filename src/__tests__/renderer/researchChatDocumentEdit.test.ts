import { describe, expect, it } from 'vitest'
import type { DocumentSnapshot } from '../../renderer/models/documentModel'
import {
  buildPendingResearchChatDocumentEdit,
  buildResearchChatDocumentEditRequest
} from '../../renderer/services/researchChatDocumentEdit'

const snapshot: DocumentSnapshot = Object.freeze({
  documentId: '/project/main.tex',
  revision: 4,
  text: ['before', 'replace me', 'after'].join('\n')
})

describe('Research Chat document edits', () => {
  it('requests minimal structured replacements without renderer state', () => {
    const request = buildResearchChatDocumentEditRequest(
      'Guard the pdfLaTeX-only commands.',
      '/project/main.tex',
      snapshot
    )

    expect(request).toMatchObject({
      selectedText: snapshot.text,
      filePath: '/project/main.tex',
      summaryContext: null,
      lightContext: { filePath: '/project/main.tex' }
    })
    expect(request.command).toContain('Guard the pdfLaTeX-only commands.')
    expect(request.command).toContain('Do not return the complete document')
  })

  it('builds minimal editor ranges and summarizes the changed lines', () => {
    const edit = buildPendingResearchChatDocumentEdit(
      '/project/main.tex',
      snapshot,
      JSON.stringify({
        edits: [{ oldText: 'replace me', newText: 'replacement one\nreplacement two' }]
      })
    )

    expect(edit).toMatchObject({
      startLine: 2,
      removedLines: 1,
      addedLines: 2,
      excerpt: 'replacement one\nreplacement two',
      excerptTruncated: false
    })
    expect(edit.snapshot).toBe(snapshot)
    expect(edit.proposedText).toBe('before\nreplacement one\nreplacement two\nafter')
    expect(edit.edits).toEqual([
      {
        range: {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 11 }
        },
        text: 'replacement one\nreplacement two',
        forceMoveMarkers: true
      }
    ])
  })

  it('rejects ambiguous, missing, and overlapping replacements', () => {
    expect(() =>
      buildPendingResearchChatDocumentEdit('/project/main.tex', snapshot, '{"edits":[]}')
    ).toThrow('invalid number')
    expect(() =>
      buildPendingResearchChatDocumentEdit(
        '/project/main.tex',
        snapshot,
        JSON.stringify({ edits: [{ oldText: 'missing', newText: 'fixed' }] })
      )
    ).toThrow('unique passage')
    expect(() =>
      buildPendingResearchChatDocumentEdit(
        '/project/main.tex',
        snapshot,
        JSON.stringify({
          edits: [
            { oldText: 'replace me', newText: 'fixed' },
            { oldText: 'me', newText: 'value' }
          ]
        })
      )
    ).toThrow('overlapping')
  })
})
