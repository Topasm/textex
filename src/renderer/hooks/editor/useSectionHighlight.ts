import { useEffect, useRef, type MutableRefObject } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { DocumentSymbolNode } from '../../../shared/types'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

interface UseSectionHighlightArgs {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

/**
 * Applies subtle alternating background bands to top-level sections in the editor.
 * Each \section heading line also gets a colored left-border accent.
 */
export function useSectionHighlight({ editorRef, monacoRef }: UseSectionHighlightArgs): void {
  const enabled = useAppStore((s) => s.settings.sectionHighlightEnabled)
  const documentSymbols = useAppStore((s) => s.documentSymbols)
  const collectionRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    // Create collection on first use
    if (!collectionRef.current) {
      collectionRef.current = editor.createDecorationsCollection([])
    }

    if (!enabled || documentSymbols.length === 0) {
      collectionRef.current.set([])
      return
    }

    // Collect top-level section symbols (kind 2 = Module, kind 3 = Namespace)
    const sections = flattenTopLevelSections(documentSymbols)

    if (sections.length === 0) {
      collectionRef.current.set([])
      return
    }

    const decorations: monacoEditor.IModelDeltaDecoration[] = []

    sections.forEach((section, index) => {
      const bandClass = index % 2 === 0 ? 'section-band-even' : 'section-band-odd'
      const startLine = section.range.startLine
      const endLine = section.range.endLine

      // Heading line: left-border accent
      decorations.push({
        range: new monaco.Range(startLine, 1, startLine, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'section-heading-marker'
        }
      })

      // Body band: alternating subtle background from heading to end
      decorations.push({
        range: new monaco.Range(startLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: bandClass
        }
      })
    })

    collectionRef.current.set(decorations)
  }, [enabled, documentSymbols, editorRef, monacoRef])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      collectionRef.current?.clear()
    }
  }, [])
}

/**
 * Extract top-level section symbols (kind 2 = Module or kind 3 = Namespace).
 * These correspond to \section, \chapter, \part in the LaTeX outline.
 */
function flattenTopLevelSections(symbols: DocumentSymbolNode[]): DocumentSymbolNode[] {
  const result: DocumentSymbolNode[] = []
  for (const sym of symbols) {
    if (sym.kind === 2 || sym.kind === 3) {
      result.push(sym)
    }
  }
  return result
}
