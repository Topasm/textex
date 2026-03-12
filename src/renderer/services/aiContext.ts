import type { editor as monacoEditor } from 'monaco-editor'
import type {
  AiAction,
  AiContextEntry,
  AiCustomProcessRequest,
  AiLightContext,
  AiProcessRequest,
  DocumentSymbolNode,
  SectionNode
} from '../../shared/types'
import { hashTextContent } from '../../shared/hash'
import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { useAiContextStore } from '../store/useAiContextStore'

const OUTLINE_LIMIT = 8
const CONTEXT_CHARS = 600

export type AiContextStatus = 'missing' | 'stale' | 'fresh'

function clampText(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars).trim()}...`
}

function offsetFromLineColumn(content: string, lineNumber: number, column: number): number {
  const lines = content.split('\n')
  let offset = 0

  for (let i = 0; i < Math.max(0, lineNumber - 1) && i < lines.length; i++) {
    offset += lines[i].length + 1
  }

  return offset + Math.max(0, column - 1)
}

function isBandSymbol(node: DocumentSymbolNode): boolean {
  return node.semanticKind === 'section' || node.semanticKind === 'frontmatter'
}

function flattenBandSymbols(
  nodes: DocumentSymbolNode[],
  depth = 0,
  result: string[] = []
): string[] {
  for (const node of nodes) {
    if (isBandSymbol(node)) {
      result.push(`${'  '.repeat(depth)}${node.name}`)
    }
    if (result.length >= OUTLINE_LIMIT) break
    flattenBandSymbols(node.children, depth + 1, result)
    if (result.length >= OUTLINE_LIMIT) break
  }

  return result
}

function findPathInSymbols(
  nodes: DocumentSymbolNode[],
  lineNumber: number,
  trail: string[] = []
): string[] {
  for (const node of nodes) {
    if (!isBandSymbol(node)) {
      const nestedPath = findPathInSymbols(node.children, lineNumber, trail)
      if (nestedPath.length > 0) return nestedPath
      continue
    }

    const inRange = lineNumber >= node.range.startLine && lineNumber <= node.range.endLine
    if (!inRange) continue

    const nextTrail = [...trail, node.name]
    const nestedPath = findPathInSymbols(node.children, lineNumber, nextTrail)
    return nestedPath.length > 0 ? nestedPath : nextTrail
  }

  return []
}

function flattenSectionNodes(nodes: SectionNode[], depth = 0, result: string[] = []): string[] {
  for (const node of nodes) {
    result.push(`${'  '.repeat(depth)}${node.title || '(untitled)'}`)
    if (result.length >= OUTLINE_LIMIT) break
    flattenSectionNodes(node.children, depth + 1, result)
    if (result.length >= OUTLINE_LIMIT) break
  }

  return result
}

function findPathInSectionNodes(
  nodes: SectionNode[],
  lineNumber: number,
  trail: string[] = []
): string[] {
  for (const node of nodes) {
    const inRange = lineNumber >= node.startLine && lineNumber <= node.endLine
    if (!inRange) continue

    const nextTrail = [...trail, node.title || '(untitled)']
    const nestedPath = findPathInSectionNodes(node.children, lineNumber, nextTrail)
    return nestedPath.length > 0 ? nestedPath : nextTrail
  }

  return []
}

function buildNeighborContext(content: string, selection: monacoEditor.ISelection) {
  const start = offsetFromLineColumn(content, selection.startLineNumber, selection.startColumn)
  const end = offsetFromLineColumn(content, selection.endLineNumber, selection.endColumn)

  return {
    beforeSelection: clampText(
      content.slice(Math.max(0, start - CONTEXT_CHARS), start),
      CONTEXT_CHARS
    ),
    afterSelection: clampText(
      content.slice(end, Math.min(content.length, end + CONTEXT_CHARS)),
      CONTEXT_CHARS
    )
  }
}

async function resolveOutlineContext(
  filePath: string,
  content: string,
  selection: monacoEditor.ISelection
): Promise<Pick<AiLightContext, 'sectionPath' | 'outline'>> {
  const symbols = useUiStore.getState().documentSymbols
  if (symbols.length > 0) {
    return {
      sectionPath: findPathInSymbols(symbols, selection.startLineNumber),
      outline: flattenBandSymbols(symbols)
    }
  }

  const sectionNodes = await window.api.getDocumentOutline(filePath, content).catch(() => [])
  return {
    sectionPath: findPathInSectionNodes(sectionNodes, selection.startLineNumber),
    outline: flattenSectionNodes(sectionNodes)
  }
}

export function getAiContextStatus(filePath: string | null, content: string): AiContextStatus {
  if (!filePath) return 'missing'

  const entry = useAiContextStore.getState().entries[filePath]
  if (!entry) return 'missing'

  return entry.contentHash === hashTextContent(content) ? 'fresh' : 'stale'
}

export function getFreshAiContextEntry(
  filePath: string | null,
  content: string
): AiContextEntry | null {
  if (!filePath) return null

  const entry = useAiContextStore.getState().entries[filePath]
  if (!entry) return null

  return entry.contentHash === hashTextContent(content) ? entry : null
}

export async function buildAiLightContext(selection: monacoEditor.ISelection): Promise<{
  filePath: string
  lightContext: AiLightContext
  summaryContext: AiContextEntry | null
}> {
  const { filePath: currentFilePath, content } = useEditorStore.getState()
  const filePath = currentFilePath || 'untitled.tex'
  const { sectionPath, outline } = await resolveOutlineContext(filePath, content, selection)
  const { beforeSelection, afterSelection } = buildNeighborContext(content, selection)

  return {
    filePath,
    lightContext: {
      filePath,
      sectionPath,
      outline,
      beforeSelection,
      afterSelection
    },
    summaryContext: getFreshAiContextEntry(currentFilePath, content)
  }
}

export async function buildAiProcessRequest(
  action: AiAction,
  selection: monacoEditor.ISelection,
  selectedText: string
): Promise<AiProcessRequest> {
  const { filePath, lightContext, summaryContext } = await buildAiLightContext(selection)
  return {
    action,
    selectedText,
    filePath,
    lightContext,
    summaryContext
  }
}

export async function buildAiCustomProcessRequest(
  command: string,
  selection: monacoEditor.ISelection,
  selectedText: string
): Promise<AiCustomProcessRequest> {
  const { filePath, lightContext, summaryContext } = await buildAiLightContext(selection)
  return {
    command,
    selectedText,
    filePath,
    lightContext,
    summaryContext
  }
}

export async function updateCurrentDocumentAiContext(): Promise<AiContextEntry> {
  const { filePath, content } = useEditorStore.getState()
  if (!filePath) throw new Error('No active file to summarize')
  if (!content.trim()) throw new Error('Document is empty')

  const entry = await window.api.aiUpdateContext(filePath, content)
  useAiContextStore.getState().upsertEntry(entry)
  return entry
}
