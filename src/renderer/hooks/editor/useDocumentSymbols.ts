import { useEffect, useRef } from 'react'
import { lspRequestDocumentSymbols } from '../../lsp/lspClient'
import { useAppStore } from '../../store/useAppStore'
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

function fetchOutline(currentFile: string, content: string): void {
  const state = useAppStore.getState()
  const lspAvailable =
    state.settings.lspEnabled && state.lspStatus === 'running'

  const generation = ++outlineGeneration

  if (lspAvailable) {
    lspRequestDocumentSymbols(currentFile)
      .then((symbols) => {
        // Stale check: only apply if this is still the latest request
        if (outlineGeneration !== generation) return
        if (useAppStore.getState().filePath === currentFile) {
          useAppStore.getState().setDocumentSymbols(symbols)
        }
      })
      .catch(() => {
        if (outlineGeneration !== generation) return
        fetchFallbackOutline(currentFile, content, generation)
      })
  } else {
    fetchFallbackOutline(currentFile, content, generation)
  }
}

export function useDocumentSymbols(content: string): void {
  const filePath = useAppStore((s) => s.filePath)
  const lspStatus = useAppStore((s) => s.lspStatus)
  const prevFilePathRef = useRef<string | null>(null)

  // Immediate outline fetch when file changes (open / tab switch / startup)
  useEffect(() => {
    if (!filePath || !content) return
    // Only trigger on actual file path changes, not content edits
    if (filePath === prevFilePathRef.current) return
    prevFilePathRef.current = filePath

    fetchOutline(filePath, content)
  }, [filePath, content])

  // Debounced outline refresh on content edits (typing) and LSP status changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useAppStore.getState()
      if (!state.filePath) return
      fetchOutline(state.filePath, content)
    }, 2000)

    return () => clearTimeout(timer)
  }, [content, lspStatus])
}

function fetchFallbackOutline(currentFile: string, content: string, generation: number): void {
  window.api
    .getDocumentOutline(currentFile, content)
    .then((sectionNodes) => {
      if (outlineGeneration !== generation) return
      if (useAppStore.getState().filePath === currentFile) {
        useAppStore.getState().setDocumentSymbols(sectionNodesToSymbols(sectionNodes))
      }
    })
    .catch(() => { })
}
