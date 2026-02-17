import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useAppStore } from '../../store/useAppStore'

type MonacoInstance = typeof import('monaco-editor')

interface UseSpellingParams {
  content: string
  enabled: boolean
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

interface WordInfo {
  word: string
  line: number
  col: number
}

/**
 * Extract words from a single line of LaTeX text, stripping commands and math.
 */
function extractWordsFromLine(line: string, lineNumber: number): WordInfo[] {
  const words: WordInfo[] = []
  // Strip comments
  const commentIdx = line.indexOf('%')
  let cleaned = commentIdx >= 0 ? line.substring(0, commentIdx) : line
  // Strip LaTeX commands
  cleaned = cleaned.replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{[^}]*\})?/g, (m) => ' '.repeat(m.length))
  // Strip inline math
  cleaned = cleaned.replace(/\$[^$]*\$/g, (m) => ' '.repeat(m.length))

  const wordRegex = /[a-zA-Z']+/g
  let match: RegExpExecArray | null
  while ((match = wordRegex.exec(cleaned)) !== null) {
    if (match[0].length >= 2) {
      words.push({ word: match[0], line: lineNumber, col: match.index + 1 })
    }
  }
  return words
}

export function useSpelling({ content, enabled, editorRef, monacoRef }: UseSpellingParams): {
  runSpellCheck: () => Promise<void>
} {
  const spellTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Cache of previous spell check results per line for incremental checking
  const prevLinesRef = useRef<string[]>([])
  const prevMarkersRef = useRef<Map<number, monacoEditor.IMarkerData[]>>(new Map())

  const runSpellCheck = useCallback(async (): Promise<void> => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return

    if (!useAppStore.getState().settings.spellCheckEnabled) {
      const existing = monaco.editor.getModelMarkers({ owner: 'spellcheck' })
      if (existing.length > 0) {
        monaco.editor.setModelMarkers(model, 'spellcheck', [])
      }
      prevLinesRef.current = []
      prevMarkersRef.current.clear()
      return
    }

    const text = model.getValue()
    const lines = text.split('\n')
    const prevLines = prevLinesRef.current
    const prevMarkers = prevMarkersRef.current

    // Determine which lines changed (incremental diff)
    const changedLineIndices: number[] = []
    for (let i = 0; i < lines.length; i++) {
      if (i >= prevLines.length || lines[i] !== prevLines[i]) {
        changedLineIndices.push(i)
      }
    }
    // Lines removed (prevLines was longer)
    for (let i = lines.length; i < prevLines.length; i++) {
      prevMarkers.delete(i + 1) // clean up removed line markers
    }

    // If no lines changed and line count is same, nothing to do
    if (changedLineIndices.length === 0 && lines.length === prevLines.length) {
      return
    }

    // Extract words only from changed lines
    const wordsToCheck: WordInfo[] = []
    for (const i of changedLineIndices) {
      const lineWords = extractWordsFromLine(lines[i], i + 1) // 1-indexed line number
      wordsToCheck.push(...lineWords)
    }

    // Update stored lines
    prevLinesRef.current = lines

    if (wordsToCheck.length === 0) {
      // Clear markers for changed lines that now have no words
      for (const i of changedLineIndices) {
        prevMarkers.delete(i + 1)
      }
      // Rebuild all markers from cache
      const allMarkers = Array.from(prevMarkers.values()).flat()
      monaco.editor.setModelMarkers(model, 'spellcheck', allMarkers)
      return
    }

    try {
      // Deduplicate words before sending to the spell checker
      const uniqueWordTexts = [...new Set(wordsToCheck.map((w) => w.word))]
      const misspelled = await window.api.spellCheck(uniqueWordTexts)
      const misspelledSet = new Set(misspelled.map((w) => w.toLowerCase()))

      // Build markers for changed lines
      for (const i of changedLineIndices) {
        const lineNumber = i + 1
        const lineWords = wordsToCheck.filter((w) => w.line === lineNumber)
        const lineMarkers: monacoEditor.IMarkerData[] = lineWords
          .filter((w) => misspelledSet.has(w.word.toLowerCase()))
          .map((w) => ({
            severity: monaco.MarkerSeverity.Info,
            startLineNumber: w.line,
            startColumn: w.col,
            endLineNumber: w.line,
            endColumn: w.col + w.word.length,
            message: `"${w.word}" may be misspelled`,
            source: 'spellcheck'
          }))
        if (lineMarkers.length > 0) {
          prevMarkers.set(lineNumber, lineMarkers)
        } else {
          prevMarkers.delete(lineNumber)
        }
      }

      // Combine all markers from cache
      const allMarkers = Array.from(prevMarkers.values()).flat()
      monaco.editor.setModelMarkers(model, 'spellcheck', allMarkers)
    } catch {
      // ignore spell check errors
    }
  }, [editorRef, monacoRef])

  useEffect(() => {
    if (!enabled) {
      void runSpellCheck()
      return
    }

    clearTimeout(spellTimerRef.current)
    spellTimerRef.current = setTimeout(() => {
      void runSpellCheck()
    }, 500)

    return () => clearTimeout(spellTimerRef.current)
  }, [content, enabled, runSpellCheck])

  return { runSpellCheck }
}
