import type { AiCustomProcessRequest } from '../../shared/types'
import type { DocumentSnapshot } from '../models/documentModel'

export const RESEARCH_CHAT_DOCUMENT_EDIT_MAX_BYTES = 2 * 1024 * 1024

const DOCUMENT_EDIT_EXCERPT_LINES = 24

export interface PendingResearchChatDocumentEdit {
  filePath: string
  snapshot: DocumentSnapshot
  proposedText: string
  startLine: number
  removedLines: number
  addedLines: number
  excerpt: string
  excerptTruncated: boolean
}

export function isResearchChatDocumentWithinEditLimit(text: string): boolean {
  return new TextEncoder().encode(text).byteLength <= RESEARCH_CHAT_DOCUMENT_EDIT_MAX_BYTES
}

export function unwrapResearchChatDocumentEdit(value: string): string {
  const trimmed = value.trim()
  const fenced = /^```(?:latex|tex)?\s*\n([\s\S]*?)\n```$/iu.exec(trimmed)
  return fenced?.[1] ?? value
}

export function buildResearchChatDocumentEditRequest(
  recommendation: string,
  filePath: string,
  snapshot: DocumentSnapshot
): AiCustomProcessRequest {
  return {
    command: [
      'Apply the Research Chat recommendation below to this complete LaTeX source document.',
      'Make only the necessary edits, preserve all unrelated content and conference-template requirements, and return the complete updated source with no Markdown fences or explanation.',
      '',
      'Research Chat recommendation:',
      recommendation
    ].join('\n'),
    selectedText: snapshot.text,
    filePath,
    lightContext: {
      filePath,
      sectionPath: [],
      outline: [],
      beforeSelection: '',
      afterSelection: ''
    },
    summaryContext: null
  }
}

export function buildPendingResearchChatDocumentEdit(
  filePath: string,
  snapshot: DocumentSnapshot,
  proposedText: string
): PendingResearchChatDocumentEdit {
  const originalLines = snapshot.text.split('\n')
  const proposedLines = proposedText.split('\n')
  let prefix = 0
  while (
    prefix < originalLines.length &&
    prefix < proposedLines.length &&
    originalLines[prefix] === proposedLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < originalLines.length - prefix &&
    suffix < proposedLines.length - prefix &&
    originalLines[originalLines.length - 1 - suffix] ===
      proposedLines[proposedLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const changedLines = proposedLines.slice(prefix, proposedLines.length - suffix)
  return {
    filePath,
    snapshot,
    proposedText,
    startLine: prefix + 1,
    removedLines: originalLines.length - prefix - suffix,
    addedLines: changedLines.length,
    excerpt: changedLines.slice(0, DOCUMENT_EDIT_EXCERPT_LINES).join('\n') || '(lines removed)',
    excerptTruncated: changedLines.length > DOCUMENT_EDIT_EXCERPT_LINES
  }
}
