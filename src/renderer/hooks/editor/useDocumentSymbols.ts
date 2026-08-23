import { useCallback, useEffect, useRef } from 'react'
import { lspRequestDocumentSymbols } from '../../lsp/lspClient'
import { useEditorStore } from '../../store/useEditorStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { isFeatureEnabled } from '../../utils/featureFlags'
import { useUiStore } from '../../store/useUiStore'
import type { DocumentSymbolNode, SectionNode } from '../../../shared/types'
import { documentRegistry } from '../../models/documentRegistry'
import type { DocumentSnapshot } from '../../models/documentModel'

/**
 * Convert SectionNode[] (from regex parser) to DocumentSymbolNode[] (used by OutlinePanel).
 */
export function sectionNodesToSymbols(nodes: SectionNode[]): DocumentSymbolNode[] {
  return nodes.map((node) => ({
    name: node.title || '(untitled)',
    detail: '',
    kind: node.semanticKind === 'frontmatter' ? 1 : 2,
    range: {
      startLine: node.startLine,
      startColumn: 0,
      endLine: node.endLine,
      endColumn: 0
    },
    selectionRange: {
      startLine: node.startLine,
      startColumn: 0,
      endLine: node.startLine,
      endColumn: 0
    },
    semanticKind: node.semanticKind ?? 'section',
    children: sectionNodesToSymbols(node.children)
  }))
}

function annotateSemanticKinds(nodes: DocumentSymbolNode[]): DocumentSymbolNode[] {
  return nodes.map((node) => ({
    ...node,
    semanticKind: node.semanticKind ?? (node.kind === 2 || node.kind === 3 ? 'section' : 'other'),
    children: annotateSemanticKinds(node.children)
  }))
}

function isSameNode(a: DocumentSymbolNode, b: DocumentSymbolNode): boolean {
  return (
    a.name === b.name &&
    a.range.startLine === b.range.startLine &&
    a.range.endLine === b.range.endLine &&
    a.semanticKind === b.semanticKind
  )
}

function isBandSymbol(node: DocumentSymbolNode): boolean {
  return node.semanticKind === 'section' || node.semanticKind === 'frontmatter'
}

export function mergeBandSymbols(
  symbols: DocumentSymbolNode[],
  bandSymbols: DocumentSymbolNode[]
): DocumentSymbolNode[] {
  if (bandSymbols.length === 0) return annotateSemanticKinds(symbols)

  const annotatedSymbols = annotateSemanticKinds(symbols)
  const merged = [...annotatedSymbols]

  for (const bandSymbol of bandSymbols.filter(isBandSymbol)) {
    const existingIndex = merged.findIndex(
      (existing) =>
        existing.range.startLine === bandSymbol.range.startLine || isSameNode(existing, bandSymbol)
    )

    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        semanticKind: bandSymbol.semanticKind ?? merged[existingIndex].semanticKind
      }
    } else {
      merged.push(bandSymbol)
    }
  }

  return merged.sort((a, b) => a.range.startLine - b.range.startLine)
}

export function extractBandSymbols(sectionNodes: SectionNode[]): DocumentSymbolNode[] {
  return sectionNodesToSymbols(sectionNodes).filter(isBandSymbol)
}

// Generation counter to prevent stale LSP responses from overwriting newer data
let outlineGeneration = 0

// Track in-flight LSP request file to deduplicate concurrent fetches
let pendingFetchKey: string | null = null

function fetchOutline(currentFile: string, snapshot: DocumentSnapshot): void {
  const lspAvailable =
    isFeatureEnabled(useSettingsStore.getState().settings, 'lsp') &&
    useUiStore.getState().lspStatus === 'running'

  // Deduplicate: skip if a request for the same file is already in flight
  const requestKey = `${snapshot.documentId}:${snapshot.revision}`
  if (pendingFetchKey === requestKey) return
  pendingFetchKey = requestKey

  const generation = ++outlineGeneration

  const onComplete = (): void => {
    if (pendingFetchKey === requestKey) pendingFetchKey = null
  }

  const isCurrent = (): boolean =>
    useEditorStore.getState().filePath === currentFile &&
    (documentRegistry.getModel(currentFile)?.isCurrent(snapshot) ?? false)

  if (lspAvailable) {
    Promise.all([
      lspRequestDocumentSymbols(currentFile),
      window.api.getDocumentOutline(currentFile, snapshot.text).catch(() => [])
    ])
      .then(([symbols, fallbackOutline]) => {
        onComplete()
        // Stale check: only apply if this is still the latest request
        if (outlineGeneration !== generation) return
        if (isCurrent()) {
          useUiStore
            .getState()
            .setDocumentSymbols(mergeBandSymbols(symbols, extractBandSymbols(fallbackOutline)))
        }
      })
      .catch(() => {
        onComplete()
        if (outlineGeneration !== generation) return
        fetchFallbackOutline(currentFile, snapshot, generation)
      })
  } else {
    fetchFallbackOutline(currentFile, snapshot, generation).finally(onComplete)
  }
}

export function useDocumentSymbols(): { refreshOutline: () => void } {
  const filePath = useEditorStore((s) => s.filePath)
  const lspStatus = useUiStore((s) => s.lspStatus)
  const prevFilePathRef = useRef<string | null>(null)

  /** Refresh the document outline using the latest editor content from the store. */
  const refreshOutline = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    const snapshot = documentRegistry.snapshot(editorState.filePath)
    if (snapshot) fetchOutline(editorState.filePath, snapshot)
  }, [])

  // Immediate outline fetch when file changes (open / tab switch / startup)
  useEffect(() => {
    if (!filePath) return
    // Only trigger on actual file path changes, not content edits
    if (filePath === prevFilePathRef.current) return
    prevFilePathRef.current = filePath

    const snapshot = documentRegistry.snapshot(filePath)
    if (snapshot?.text) fetchOutline(filePath, snapshot)
  }, [filePath])

  // Refresh outline when LSP status changes
  useEffect(() => {
    refreshOutline()
  }, [lspStatus, refreshOutline])

  // Cancel pending generation on unmount to prevent stale updates
  useEffect(() => {
    return () => {
      outlineGeneration++
      pendingFetchKey = null
    }
  }, [])

  return { refreshOutline }
}

function fetchFallbackOutline(
  currentFile: string,
  snapshot: DocumentSnapshot,
  generation: number
): Promise<void> {
  return window.api
    .getDocumentOutline(currentFile, snapshot.text)
    .then((sectionNodes) => {
      if (outlineGeneration !== generation) return
      if (
        useEditorStore.getState().filePath === currentFile &&
        documentRegistry.getModel(currentFile)?.isCurrent(snapshot)
      ) {
        useUiStore.getState().setDocumentSymbols(sectionNodesToSymbols(sectionNodes))
      }
    })
    .catch(() => {})
}
