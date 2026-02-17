import { useEffect } from 'react'
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

export function useDocumentSymbols(content: string): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useAppStore.getState()
      if (!state.filePath) return

      const currentFile = state.filePath
      const lspAvailable =
        state.settings.lspEnabled && state.lspStatus === 'running'

      if (lspAvailable) {
        // Primary path: use LSP
        lspRequestDocumentSymbols(currentFile)
          .then((symbols) => {
            if (useAppStore.getState().filePath === currentFile) {
              useAppStore.getState().setDocumentSymbols(symbols)
            }
          })
          .catch(() => {
            // LSP request failed — try fallback
            fetchFallbackOutline(currentFile, content)
          })
      } else {
        // Fallback: use regex-based parser via IPC with live editor content
        fetchFallbackOutline(currentFile, content)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [content])
}

function fetchFallbackOutline(currentFile: string, content: string): void {
  window.api
    .getDocumentOutline(currentFile, content)
    .then((sectionNodes) => {
      if (useAppStore.getState().filePath === currentFile) {
        useAppStore.getState().setDocumentSymbols(sectionNodesToSymbols(sectionNodes))
      }
    })
    .catch(() => { })
}
