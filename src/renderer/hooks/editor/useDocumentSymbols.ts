import { useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { useUiStore } from '../../store/useUiStore'
import type { DocumentSymbolNode, SectionNode } from '../../../shared/types'
import { documentRegistry } from '../../models/documentRegistry'
import type { DocumentSnapshot } from '../../models/documentModel'

/** Convert the native LaTeX outline into the shape consumed by OutlinePanel. */
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

let outlineGeneration = 0
let pendingFetchKey: string | null = null

function fetchOutline(currentFile: string, snapshot: DocumentSnapshot): void {
  const requestKey = `${snapshot.documentId}:${snapshot.revision}`
  if (pendingFetchKey === requestKey) return
  pendingFetchKey = requestKey
  const generation = ++outlineGeneration

  window.api
    .getDocumentOutline(currentFile, snapshot.text)
    .then((nodes) => {
      if (outlineGeneration !== generation) return
      if (
        useEditorStore.getState().filePath === currentFile &&
        documentRegistry.getModel(currentFile)?.isCurrent(snapshot)
      ) {
        useUiStore.getState().setDocumentSymbols(sectionNodesToSymbols(nodes))
      }
    })
    .catch(() => undefined)
    .finally(() => {
      if (pendingFetchKey === requestKey) pendingFetchKey = null
    })
}

export function useDocumentSymbols(): { refreshOutline: () => void } {
  const filePath = useEditorStore((state) => state.filePath)
  const previousFilePath = useRef<string | null>(null)

  const refreshOutline = useCallback(() => {
    const currentFile = useEditorStore.getState().filePath
    if (!currentFile) return
    const snapshot = documentRegistry.snapshot(currentFile)
    if (snapshot) fetchOutline(currentFile, snapshot)
  }, [])

  useEffect(() => {
    if (!filePath || filePath === previousFilePath.current) return
    previousFilePath.current = filePath
    const snapshot = documentRegistry.snapshot(filePath)
    if (snapshot?.text) fetchOutline(filePath, snapshot)
  }, [filePath])

  useEffect(
    () => () => {
      outlineGeneration += 1
      pendingFetchKey = null
    },
    []
  )

  return { refreshOutline }
}
