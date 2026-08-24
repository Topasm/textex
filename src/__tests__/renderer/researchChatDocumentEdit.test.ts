import { describe, expect, it } from 'vitest'
import type { DocumentSnapshot } from '../../renderer/models/documentModel'
import {
  buildPendingResearchChatDocumentEdit,
  buildResearchChatDocumentEditRequest,
  unwrapResearchChatDocumentEdit
} from '../../renderer/services/researchChatDocumentEdit'

const snapshot: DocumentSnapshot = Object.freeze({
  documentId: '/project/main.tex',
  revision: 4,
  text: ['before', 'replace me', 'after'].join('\n')
})

describe('Research Chat document edits', () => {
  it('builds a complete-document request without renderer state', () => {
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
  })

  it('unwraps a whole fenced LaTeX response but preserves ordinary source', () => {
    expect(unwrapResearchChatDocumentEdit('```latex\n\\section{Fixed}\n```')).toBe(
      '\\section{Fixed}'
    )
    expect(unwrapResearchChatDocumentEdit('\\section{Fixed}\n')).toBe('\\section{Fixed}\n')
  })

  it('summarizes only the changed line range for approval', () => {
    const edit = buildPendingResearchChatDocumentEdit(
      '/project/main.tex',
      snapshot,
      ['before', 'replacement one', 'replacement two', 'after'].join('\n')
    )

    expect(edit).toMatchObject({
      startLine: 2,
      removedLines: 1,
      addedLines: 2,
      excerpt: 'replacement one\nreplacement two',
      excerptTruncated: false
    })
    expect(edit.snapshot).toBe(snapshot)
  })
})
