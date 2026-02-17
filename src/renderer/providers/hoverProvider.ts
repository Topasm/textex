import type { editor as monacoEditor } from 'monaco-editor'
import katex from 'katex'

type MonacoInstance = typeof import('monaco-editor')

interface HoverDeps {
  getLabels: () => LabelInfo[]
  getBibEntries: () => BibEntry[]
}

function extractMathAtPosition(lineContent: string, column: number): string | null {
  const col = column - 1 // 0-based

  // Check inline math $...$
  const inlineRegex = /\$([^$]+)\$/g
  let match: RegExpExecArray | null
  while ((match = inlineRegex.exec(lineContent)) !== null) {
    if (col >= match.index && col <= match.index + match[0].length) {
      return match[1]
    }
  }

  // Check display math $$...$$
  const displayRegex = /\$\$([^$]+)\$\$/g
  while ((match = displayRegex.exec(lineContent)) !== null) {
    if (col >= match.index && col <= match.index + match[0].length) {
      return match[1]
    }
  }

  // Check \(...\)
  const parenRegex = /\\\((.+?)\\\)/g
  while ((match = parenRegex.exec(lineContent)) !== null) {
    if (col >= match.index && col <= match.index + match[0].length) {
      return match[1]
    }
  }

  // Check \[...\]
  const bracketRegex = /\\\[(.+?)\\\]/g
  while ((match = bracketRegex.exec(lineContent)) !== null) {
    if (col >= match.index && col <= match.index + match[0].length) {
      return match[1]
    }
  }

  return null
}

function extractCiteKeyAtPosition(lineContent: string, column: number): string | null {
  const col = column - 1
  const citeRegex = /\\cite[tp]?\*?\{([^}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = citeRegex.exec(lineContent)) !== null) {
    if (col >= match.index && col <= match.index + match[0].length) {
      // Find which specific key the cursor is on
      const keysStr = match[1]
      const keysStart = match.index + match[0].indexOf(keysStr)
      const keys = keysStr.split(',')
      let offset = keysStart
      for (const key of keys) {
        const trimmed = key.trim()
        const keyStart = offset + key.indexOf(trimmed)
        const keyEnd = keyStart + trimmed.length
        if (col >= keyStart && col <= keyEnd) {
          return trimmed
        }
        offset += key.length + 1 // +1 for comma
      }
      return keys[0].trim()
    }
  }
  return null
}

export function registerHoverProvider(
  monaco: MonacoInstance,
  deps: HoverDeps
): { dispose(): void } {
  const disposable = monaco.languages.registerHoverProvider('latex', {
    provideHover(model: monacoEditor.ITextModel, position: { lineNumber: number; column: number }) {
      const lineContent = model.getLineContent(position.lineNumber)

      // Math hover
      const math = extractMathAtPosition(lineContent, position.column)
      if (math) {
        try {
          const html = katex.renderToString(math, {
            throwOnError: false,
            displayMode: false,
            output: 'html'
          })
          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: lineContent.length + 1
            },
            contents: [{ supportHtml: true, value: `<div style="padding:4px">${html}</div>` }]
          }
        } catch {
          // KaTeX render failed, skip
        }
      }

      // Citation hover
      const citeKey = extractCiteKeyAtPosition(lineContent, position.column)
      if (citeKey) {
        const entries = deps.getBibEntries()
        const entry = entries.find((e) => e.key === citeKey)
        if (entry) {
          const parts: string[] = []
          parts.push(`**${entry.key}** (${entry.type})`)
          if (entry.title) parts.push(`*${entry.title}*`)
          if (entry.author) parts.push(`Author: ${entry.author}`)
          if (entry.year) parts.push(`Year: ${entry.year}`)
          if (entry.journal) parts.push(`Journal: ${entry.journal}`)
          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: lineContent.length + 1
            },
            contents: [{ value: parts.join('\n\n') }]
          }
        }
      }

      return null
    }
  })

  return disposable
}
