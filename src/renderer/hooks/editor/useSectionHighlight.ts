import { useEffect, useRef, type MutableRefObject } from 'react'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useUiStore } from '../../store/useUiStore'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

interface UseSectionHighlightArgs {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

const DEFAULT_COLORS = ['#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2', '#d19a66']

/**
 * Inject a <style> element with dynamic CSS classes generated from the
 * user-chosen color palette. Each color gets heading, bar and band classes.
 */
function injectPaletteStyles(colors: string[]): HTMLStyleElement {
  const id = 'sh-palette-styles'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }

  const hexToRgb = (hex: string): string => {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return `${r}, ${g}, ${b}`
  }

  const rules = colors.map((color, i) => {
    const rgb = hexToRgb(color)
    return `
.sh-heading-c${i} { border-top-color: rgba(${rgb}, 0.6) !important; }
.sh-bar-c${i}     { background: ${color} !important; }
.sh-band-c${i}    { background: rgba(${rgb}, 0.10); }`
  })

  el.textContent = rules.join('\n')
  return el
}

/**
 * Highlights top-level \\section ranges with rainbow-colored bands.
 * Colors are user-configurable in settings and cycle through the palette.
 */
export function useSectionHighlight({ editorRef, monacoRef }: UseSectionHighlightArgs): void {
  const enabled = useSettingsStore((s) => s.settings.sectionHighlightEnabled)
  const colors = useSettingsStore((s) => s.settings.sectionHighlightColors) ?? DEFAULT_COLORS
  const documentSymbols = useUiStore((s) => s.documentSymbols)
  const collectionRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null)

  // Keep palette CSS in sync with colors
  useEffect(() => {
    if (enabled && colors.length > 0) {
      injectPaletteStyles(colors)
    }
  }, [enabled, colors])

  // Apply decorations using requestIdleCallback to batch non-urgent updates
  const pendingDecorationRef = useRef<number | ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    if (!collectionRef.current) {
      collectionRef.current = editor.createDecorationsCollection([])
    }

    if (!enabled || documentSymbols.length === 0 || colors.length === 0) {
      collectionRef.current.set([])
      return
    }

    // Cancel any pending idle callback
    if (pendingDecorationRef.current !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(pendingDecorationRef.current as number)
      } else {
        clearTimeout(pendingDecorationRef.current as ReturnType<typeof setTimeout>)
      }
    }

    const applyDecorations = (): void => {
      pendingDecorationRef.current = null
      if (!collectionRef.current) return

      const sections = documentSymbols.filter((s) => s.kind === 2 || s.kind === 3)

      if (sections.length === 0) {
        collectionRef.current.set([])
        return
      }

      const paletteSize = colors.length
      const decorations: monacoEditor.IModelDeltaDecoration[] = []

      sections.forEach((section, index) => {
        const c = index % paletteSize
        const startLine = section.range.startLine
        const endLine = section.range.endLine

        // Heading: top border divider
        decorations.push({
          range: new monaco.Range(startLine, 1, startLine, 1),
          options: {
            isWholeLine: true,
            className: `sh-heading sh-heading-c${c}`
          }
        })

        // Left accent bar spanning full section
        decorations.push({
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: `sh-bar sh-bar-c${c}`
          }
        })

        // Background band spanning full section
        decorations.push({
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            className: `sh-band-c${c}`
          }
        })
      })

      collectionRef.current.set(decorations)
    }

    // Defer decoration updates to idle time since they are non-critical visual updates
    if (typeof requestIdleCallback !== 'undefined') {
      pendingDecorationRef.current = requestIdleCallback(applyDecorations)
    } else {
      pendingDecorationRef.current = setTimeout(applyDecorations, 100)
    }

    return () => {
      if (pendingDecorationRef.current !== null) {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(pendingDecorationRef.current as number)
        } else {
          clearTimeout(pendingDecorationRef.current as ReturnType<typeof setTimeout>)
        }
        pendingDecorationRef.current = null
      }
    }
  }, [enabled, documentSymbols, colors, editorRef, monacoRef])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      collectionRef.current?.clear()
      const el = document.getElementById('sh-palette-styles')
      if (el) el.remove()
    }
  }, [])
}
