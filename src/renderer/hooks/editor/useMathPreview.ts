import { useCallback, useEffect, useRef, useState } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'

export interface MathPreviewData {
  /** The LaTeX math content (without delimiters) */
  latex: string
  /** Whether this is display math ($$, \[, environments) vs inline ($, \() */
  isDisplay: boolean
  /** The full range in the editor, including delimiters */
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  /** The range of just the math content (without delimiters) */
  contentRange: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
}

interface UseMathPreviewOptions {
  editorRef: React.RefObject<monacoEditor.IStandaloneCodeEditor | null>
  enabled: boolean
}

/**
 * Detects if the cursor is currently inside a LaTeX math expression.
 * Supports: $...$, $$...$$, \(...\), \[...\], \begin{equation}...\end{equation},
 * \begin{align}...\end{align}, \begin{align*}...\end{align*}
 */
export function useMathPreview({ editorRef, enabled }: UseMathPreviewOptions) {
  const [mathData, setMathData] = useState<MathPreviewData | null>(null)
  const disposablesRef = useRef<{ dispose(): void }[]>([])

  const detectMath = useCallback(() => {
    if (!enabled) {
      setMathData(null)
      return
    }
    const editor = editorRef.current
    if (!editor) return

    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position) return

    const fullText = model.getValue()
    const offset = model.getOffsetAt(position)

    // Try each pattern
    const result =
      findDelimitedMath(fullText, offset, '$$', '$$', true) ||
      findDelimitedMath(fullText, offset, '\\[', '\\]', true) ||
      findDelimitedMath(fullText, offset, '$', '$', false) ||
      findDelimitedMath(fullText, offset, '\\(', '\\)', false) ||
      findEnvironmentMath(fullText, offset, 'equation') ||
      findEnvironmentMath(fullText, offset, 'equation*') ||
      findEnvironmentMath(fullText, offset, 'align') ||
      findEnvironmentMath(fullText, offset, 'align*') ||
      findEnvironmentMath(fullText, offset, 'gather') ||
      findEnvironmentMath(fullText, offset, 'gather*') ||
      null

    if (result) {
      const startPos = model.getPositionAt(result.fullStart)
      const endPos = model.getPositionAt(result.fullEnd)
      const contentStartPos = model.getPositionAt(result.contentStart)
      const contentEndPos = model.getPositionAt(result.contentEnd)

      setMathData({
        latex: result.content,
        isDisplay: result.isDisplay,
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column
        },
        contentRange: {
          startLineNumber: contentStartPos.lineNumber,
          startColumn: contentStartPos.column,
          endLineNumber: contentEndPos.lineNumber,
          endColumn: contentEndPos.column
        }
      })
    } else {
      setMathData(null)
    }
  }, [editorRef, enabled])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !enabled) {
      setMathData(null)
      return
    }

    const cursorDisposable = editor.onDidChangeCursorPosition(() => {
      detectMath()
    })
    disposablesRef.current.push(cursorDisposable)

    // Also detect on content change
    const contentDisposable = editor.onDidChangeModelContent(() => {
      detectMath()
    })
    disposablesRef.current.push(contentDisposable)

    // Initial detection
    detectMath()

    return () => {
      for (const d of disposablesRef.current) d.dispose()
      disposablesRef.current = []
    }
  }, [editorRef, enabled, detectMath])

  return mathData
}

interface MatchResult {
  content: string
  fullStart: number
  fullEnd: number
  contentStart: number
  contentEnd: number
  isDisplay: boolean
}

function findDelimitedMath(
  text: string,
  offset: number,
  open: string,
  close: string,
  isDisplay: boolean
): MatchResult | null {
  // For $...$ we need to be careful not to confuse with $$...$$
  const isSimpleDollar = open === '$' && close === '$'

  let searchStart = 0
  while (searchStart < text.length) {
    let openIdx: number

    if (isSimpleDollar) {
      // Find a single $ that is NOT part of $$
      openIdx = findSingleDollar(text, searchStart)
    } else {
      openIdx = text.indexOf(open, searchStart)
    }

    if (openIdx === -1) break

    const contentStart = openIdx + open.length

    let closeIdx: number
    if (isSimpleDollar) {
      closeIdx = findSingleDollar(text, contentStart)
    } else {
      closeIdx = text.indexOf(close, contentStart)
    }

    if (closeIdx === -1) break

    const fullEnd = closeIdx + close.length

    // Check if cursor is within this range
    if (offset >= openIdx && offset <= fullEnd) {
      const content = text.slice(contentStart, closeIdx)
      return {
        content,
        fullStart: openIdx,
        fullEnd,
        contentStart,
        contentEnd: closeIdx,
        isDisplay
      }
    }

    searchStart = fullEnd
  }

  return null
}

function findSingleDollar(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '$') {
      // Check it's not $$
      if (i + 1 < text.length && text[i + 1] === '$') {
        i++ // Skip the double dollar
        continue
      }
      if (i > 0 && text[i - 1] === '$') {
        continue
      }
      // Check it's not escaped
      if (i > 0 && text[i - 1] === '\\') {
        continue
      }
      return i
    }
  }
  return -1
}

function findEnvironmentMath(text: string, offset: number, envName: string): MatchResult | null {
  const openTag = `\\begin{${envName}}`
  const closeTag = `\\end{${envName}}`

  let searchStart = 0
  while (searchStart < text.length) {
    const openIdx = text.indexOf(openTag, searchStart)
    if (openIdx === -1) break

    const contentStart = openIdx + openTag.length
    const closeIdx = text.indexOf(closeTag, contentStart)
    if (closeIdx === -1) break

    const fullEnd = closeIdx + closeTag.length

    if (offset >= openIdx && offset <= fullEnd) {
      const content = text.slice(contentStart, closeIdx)
      return {
        content,
        fullStart: openIdx,
        fullEnd,
        contentStart,
        contentEnd: closeIdx,
        isDisplay: true
      }
    }

    searchStart = fullEnd
  }

  return null
}
