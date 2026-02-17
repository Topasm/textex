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

export function useSpelling({ content, enabled, editorRef, monacoRef }: UseSpellingParams): {
  runSpellCheck: () => Promise<void>
} {
  const spellTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const runSpellCheck = useCallback(async (): Promise<void> => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return

    if (!useAppStore.getState().spellCheckEnabled) {
      const existing = monaco.editor.getModelMarkers({ owner: 'spellcheck' })
      if (existing.length > 0) {
        monaco.editor.setModelMarkers(model, 'spellcheck', [])
      }
      return
    }

    const text = model.getValue()
    const words: { word: string; line: number; col: number }[] = []
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      const commentIdx = line.indexOf('%')
      if (commentIdx >= 0) line = line.substring(0, commentIdx)
      line = line.replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{[^}]*\})?/g, (m) => ' '.repeat(m.length))
      line = line.replace(/\$[^$]*\$/g, (m) => ' '.repeat(m.length))

      const wordRegex = /[a-zA-Z']+/g
      let match: RegExpExecArray | null
      while ((match = wordRegex.exec(line)) !== null) {
        if (match[0].length >= 2) {
          words.push({ word: match[0], line: i + 1, col: match.index + 1 })
        }
      }
    }

    if (words.length === 0) return

    try {
      const misspelled = await window.api.spellCheck(words.map((w) => w.word))
      const misspelledSet = new Set(misspelled.map((w) => w.toLowerCase()))
      const markers: monacoEditor.IMarkerData[] = words
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
      monaco.editor.setModelMarkers(model, 'spellcheck', markers)
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
