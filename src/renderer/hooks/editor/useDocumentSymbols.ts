import { useCallback, useEffect, useRef } from 'react'
import { lspRequestDocumentSymbols } from '../../lsp/lspClient'
import { useEditorStore } from '../../store/useEditorStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useUiStore } from '../../store/useUiStore'
import type { DocumentSymbolNode, SectionNode } from '../../../shared/types'

/**
 * Convert SectionNode[] (from regex parser) to DocumentSymbolNode[] (used by OutlinePanel).
 */
function sectionNodesToSymbols(nodes: SectionNode[]): DocumentSymbolNode[] {
  return nodes.map((node) => ({
    name: node.title || '(untitled)',
    detail: '',
    kind: 2, // LSP SymbolKind.Module — rendered as section sign
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
    children: sectionNodesToSymbols(node.children)
  }))
}

// Generation counter to prevent stale LSP responses from overwriting newer data
let outlineGeneration = 0

// Track in-flight LSP request file to deduplicate concurrent fetches
let pendingFetchFile: string | null = null

function fetchOutline(currentFile: string, content: string): void {
  const lspAvailable = useSettingsStore.getState().settings.lspEnabled && useUiStore.getState().lspStatus === 'running'

  // Deduplicate: skip if a request for the same file is already in flight
  if (pendingFetchFile === currentFile) return
  pendingFetchFile = currentFile

  const generation = ++outlineGeneration

  const onComplete = (): void => {
    if (pendingFetchFile === currentFile) pendingFetchFile = null
  }

  if (lspAvailable) {
    lspRequestDocumentSymbols(currentFile)
      .then((symbols) => {
        onComplete()
        // Stale check: only apply if this is still the latest request
        if (outlineGeneration !== generation) return
        if (useEditorStore.getState().filePath === currentFile) {
          useUiStore.getState().setDocumentSymbols(symbols)
        }
      })
      .catch(() => {
        onComplete()
        if (outlineGeneration !== generation) return
        fetchFallbackOutline(currentFile, content, generation)
      })
  } else {
    fetchFallbackOutline(currentFile, content, generation).finally(onComplete)
  }
}

export function useDocumentSymbols(content: string): { refreshOutline: () => void } {
  const filePath = useEditorStore((s) => s.filePath)
  const lspStatus = useUiStore((s) => s.lspStatus)
  const prevFilePathRef = useRef<string | null>(null)

  /** Refresh the document outline using the latest editor content from the store. */
  const refreshOutline = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    fetchOutline(editorState.filePath, editorState.content)
  }, [])

  // Immediate outline fetch when file changes (open / tab switch / startup)
  useEffect(() => {
    if (!filePath || !content) return
    // Only trigger on actual file path changes, not content edits
    if (filePath === prevFilePathRef.current) return
    prevFilePathRef.current = filePath

    fetchOutline(filePath, content)
  }, [filePath, content])

  // Refresh outline when LSP status changes
  useEffect(() => {
    refreshOutline()
  }, [lspStatus, refreshOutline])

  // Cancel pending generation on unmount to prevent stale updates
  useEffect(() => {
    return () => {
      outlineGeneration++
      pendingFetchFile = null
    }
  }, [])

  return { refreshOutline }
}

function fetchFallbackOutline(
  currentFile: string,
  content: string,
  generation: number
): Promise<void> {
  return window.api
    .getDocumentOutline(currentFile, content)
    .then((sectionNodes) => {
      if (outlineGeneration !== generation) return
      if (useEditorStore.getState().filePath === currentFile) {
        useUiStore.getState().setDocumentSymbols(sectionNodesToSymbols(sectionNodes))
      }
    })
    .catch(() => {})
}
