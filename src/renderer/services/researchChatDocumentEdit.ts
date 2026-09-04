import type { AiCustomProcessRequest } from '../../shared/types'
import type { EditorPosition, EditorTextEdit } from '../editor/EditorAdapter'
import type { DocumentSnapshot } from '../models/documentModel'

export const RESEARCH_CHAT_DOCUMENT_EDIT_MAX_BYTES = 2 * 1024 * 1024

const DOCUMENT_EDIT_EXCERPT_LINES = 24
const MAX_DOCUMENT_REPLACEMENTS = 64

interface ResearchChatDocumentReplacement {
  oldText: string
  newText: string
}

export interface PendingResearchChatDocumentEdit {
  filePath: string
  snapshot: DocumentSnapshot
  proposedText: string
  edits: readonly EditorTextEdit[]
  startLine: number
  removedLines: number
  addedLines: number
  excerpt: string
  excerptTruncated: boolean
}

interface ResolvedReplacement extends ResearchChatDocumentReplacement {
  start: number
  end: number
}

export function isResearchChatDocumentWithinEditLimit(text: string): boolean {
  return new TextEncoder().encode(text).byteLength <= RESEARCH_CHAT_DOCUMENT_EDIT_MAX_BYTES
}

function unwrapJsonFence(value: string): string {
  const trimmed = value.trim()
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/iu.exec(trimmed)
  return fenced?.[1] ?? trimmed
}

function parseReplacements(value: string): ResearchChatDocumentReplacement[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(unwrapJsonFence(value))
  } catch {
    throw new Error('The AI returned an invalid document edit. Try the request again.')
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(Reflect.get(parsed, 'edits'))) {
    throw new Error('The AI returned an invalid document edit. Try the request again.')
  }
  const edits = Reflect.get(parsed, 'edits') as unknown[]
  if (edits.length === 0 || edits.length > MAX_DOCUMENT_REPLACEMENTS) {
    throw new Error('The AI returned an invalid number of document edits.')
  }

  return edits.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('The AI returned an invalid document edit. Try the request again.')
    }
    const oldText = Reflect.get(candidate, 'oldText')
    const newText = Reflect.get(candidate, 'newText')
    if (
      typeof oldText !== 'string' ||
      oldText.length === 0 ||
      typeof newText !== 'string' ||
      oldText === newText
    ) {
      throw new Error('The AI returned an invalid document edit. Try the request again.')
    }
    return { oldText, newText }
  })
}

function resolveReplacements(
  source: string,
  replacements: readonly ResearchChatDocumentReplacement[]
): ResolvedReplacement[] {
  const resolved = replacements.map((replacement) => {
    const start = source.indexOf(replacement.oldText)
    const duplicate = start >= 0 ? source.indexOf(replacement.oldText, start + 1) : -1
    if (start < 0 || duplicate >= 0) {
      throw new Error('The AI edit did not identify a unique passage in the current document.')
    }
    return { ...replacement, start, end: start + replacement.oldText.length }
  })

  const ascending = [...resolved].sort((left, right) => left.start - right.start)
  for (let index = 1; index < ascending.length; index += 1) {
    if (ascending[index].start < ascending[index - 1].end) {
      throw new Error('The AI returned overlapping document edits.')
    }
  }
  return ascending
}

function positionAtOffset(source: string, offset: number): EditorPosition {
  const before = source.slice(0, offset)
  const lastNewline = before.lastIndexOf('\n')
  return {
    line: before.split('\n').length,
    column: offset - lastNewline
  }
}

function applyResolvedReplacements(
  source: string,
  replacements: readonly ResolvedReplacement[]
): string {
  let result = source
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, replacement.start)}${replacement.newText}${result.slice(replacement.end)}`
  }
  return result
}

export function buildResearchChatDocumentEditRequest(
  recommendation: string,
  filePath: string,
  snapshot: DocumentSnapshot
): AiCustomProcessRequest {
  return {
    command: [
      'Apply the Research Chat recommendation below to the supplied LaTeX source.',
      'Return only one JSON object with this exact shape:',
      '{"edits":[{"oldText":"exact existing source passage","newText":"replacement passage"}]}',
      'Each oldText must be copied verbatim from the source and occur exactly once.',
      'Use the smallest non-overlapping passages needed. Preserve all unrelated content and conference-template requirements.',
      'Do not return the complete document, Markdown fences, or explanation.',
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
  response: string
): PendingResearchChatDocumentEdit {
  const resolved = resolveReplacements(snapshot.text, parseReplacements(response))
  const proposedText = applyResolvedReplacements(snapshot.text, resolved)
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
    edits: resolved.map((replacement) => ({
      range: {
        start: positionAtOffset(snapshot.text, replacement.start),
        end: positionAtOffset(snapshot.text, replacement.end)
      },
      text: replacement.newText,
      forceMoveMarkers: true
    })),
    startLine: prefix + 1,
    removedLines: originalLines.length - prefix - suffix,
    addedLines: changedLines.length,
    excerpt: changedLines.slice(0, DOCUMENT_EDIT_EXCERPT_LINES).join('\n') || '(lines removed)',
    excerptTruncated: changedLines.length > DOCUMENT_EDIT_EXCERPT_LINES
  }
}
