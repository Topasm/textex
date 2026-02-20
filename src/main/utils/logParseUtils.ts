// Pure string parsing helpers extracted from logparser.ts.
// Regex patterns, line classification, and severity mapping.
// No Electron or Node dependencies.

import type { DiagnosticSeverity } from '../../shared/types'

// ---- Regex patterns (from LaTeX-Workshop latexlog.ts) ----

export const latexError = /^(?:(.*):(\d+):|!)(?:\s?(.+) [Ee]rror:)? (.+?)$/
export const latexOverfullBox = /^(Overfull \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/
export const latexOverfullBoxAlt = /^(Overfull \\[vh]box \([^)]*\)) detected at line (\d+)$/
export const latexOverfullBoxOutput =
  /^(Overfull \\[vh]box \([^)]*\)) has occurred while \\output is active(?: \[(\d+)\])?/
export const latexUnderfullBox = /^(Underfull \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/
export const latexUnderfullBoxAlt = /^(Underfull \\[vh]box \([^)]*\)) detected at line (\d+)$/
export const latexUnderfullBoxOutput =
  /^(Underfull \\[vh]box \([^)]*\)) has occurred while \\output is active(?: \[(\d+)\])?/
export const latexWarn =
  /^((?:(?:Class|Package|Module) \S*)|LaTeX(?: \S*)?|LaTeX3) (Warning|Info):\s+(.*?)(?: on(?: input)? line (\d+))?(\.|\?|)$/
export const latexPackageWarningExtraLines = /^\((.*)\)\s+(.*?)(?: +on input line (\d+))?(\.)?$/
export const latexMissChar = /^\s*(Missing character:.*?!)/
export const latexNoPageOutput = /^No pages of output\.$/
export const bibEmpty = /^Empty `thebibliography' environment/
export const biberWarn = /^Biber warning:.*WARN - I didn't find a database entry for '([^']+)'/
export const UNDEFINED_REFERENCE =
  /^LaTeX Warning: (Reference|Citation) `(.*?)' on page (?:\d+) undefined on input line (\d+).$/
export const messageLine = /^l\.\d+\s(\.\.\.)?(.*)$/

// ---- Pure helpers ----

export function mapSeverity(type: string): DiagnosticSeverity {
  switch (type) {
    case 'error':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

/**
 * Parse the LaTeX file stack from a log line, tracking which file is
 * currently being processed. Modifies the fileStack array in place and
 * returns the updated nesting counter.
 */
export function parseLaTeXFileStack(line: string, fileStack: string[], nested: number): number {
  let remaining = line
  while (true) {
    const result = remaining.match(/(\(|\))/)
    if (!result || result.index === undefined || result.index <= -1) break

    remaining = remaining.substring(result.index + 1)
    if (result[1] === '(') {
      const pathResult = remaining.match(/^"?((?:(?:[a-zA-Z]:|\.|\/)?(?:\/|\\\\?))[^"()[\]]*)/)
      const mikTeXPathResult = remaining.match(/^"?([^"()[\]]*\.[a-z]{3,})/)
      if (pathResult) {
        fileStack.push(pathResult[1].trim())
      } else if (mikTeXPathResult) {
        fileStack.push(`./${mikTeXPathResult[1].trim()}`)
      } else {
        nested += 1
      }
    } else {
      if (nested > 0) {
        nested -= 1
      } else {
        fileStack.pop()
      }
    }
  }
  return nested
}
