import * as path from 'path'
import type { Diagnostic, DiagnosticSeverity } from '../shared/types'

// --- Regex patterns (from LaTeX-Workshop latexlog.ts) ---

const latexError = /^(?:(.*):(\d+):|!)(?:\s?(.+) [Ee]rror:)? (.+?)$/
const latexOverfullBox = /^(Overfull \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/
const latexOverfullBoxAlt = /^(Overfull \\[vh]box \([^)]*\)) detected at line (\d+)$/
const latexOverfullBoxOutput =
  /^(Overfull \\[vh]box \([^)]*\)) has occurred while \\output is active(?: \[(\d+)\])?/
const latexUnderfullBox = /^(Underfull \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/
const latexUnderfullBoxAlt = /^(Underfull \\[vh]box \([^)]*\)) detected at line (\d+)$/
const latexUnderfullBoxOutput =
  /^(Underfull \\[vh]box \([^)]*\)) has occurred while \\output is active(?: \[(\d+)\])?/
const latexWarn =
  /^((?:(?:Class|Package|Module) \S*)|LaTeX(?: \S*)?|LaTeX3) (Warning|Info):\s+(.*?)(?: on(?: input)? line (\d+))?(\.|\?|)$/
const latexPackageWarningExtraLines = /^\((.*)\)\s+(.*?)(?: +on input line (\d+))?(\.)?$/
const latexMissChar = /^\s*(Missing character:.*?!)/
const latexNoPageOutput = /^No pages of output\.$/
const bibEmpty = /^Empty `thebibliography' environment/
const biberWarn = /^Biber warning:.*WARN - I didn't find a database entry for '([^']+)'/
const UNDEFINED_REFERENCE =
  /^LaTeX Warning: (Reference|Citation) `(.*?)' on page (?:\d+) undefined on input line (\d+).$/
const messageLine = /^l\.\d+\s(\.\.\.)?(.*)$/

// --- Types ---

interface LogEntry {
  type: string
  file: string
  text: string
  line: number
  errorPosText?: string
}

type ParserState = {
  searchEmptyLine: boolean
  insideBoxWarn: boolean
  insideError: boolean
  currentResult: LogEntry
  nested: number
  rootFile: string
  fileStack: string[]
}

function initParserState(rootFile: string): ParserState {
  return {
    searchEmptyLine: false,
    insideBoxWarn: false,
    insideError: false,
    currentResult: { type: '', file: '', text: '', line: 1 },
    nested: 0,
    rootFile,
    fileStack: [rootFile]
  }
}

// --- Core parser ---

export function parseLatexLog(log: string, rootFile: string): Diagnostic[] {
  const lines = log.split('\n')
  const buildLog: LogEntry[] = []
  const state = initParserState(rootFile)

  for (const line of lines) {
    // parseLine may return a remainder string to continue processing iteratively
    let remaining: string | undefined = line
    while (remaining !== undefined) {
      remaining = parseLine(remaining, state, buildLog)
    }
  }

  // Push the final result
  if (state.currentResult.type !== '' && !state.currentResult.text.match(bibEmpty)) {
    buildLog.push(state.currentResult)
  }

  return buildLog.map((entry) => ({
    file: entry.file,
    line: entry.line,
    severity: mapSeverity(entry.type),
    message: entry.text.trim()
  }))
}

function mapSeverity(type: string): DiagnosticSeverity {
  switch (type) {
    case 'error':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

function parseLine(line: string, state: ParserState, buildLog: LogEntry[]): string | undefined {
  // Compose the current file — guard empty fileStack
  const currentFile = state.fileStack.length > 0
    ? state.fileStack[state.fileStack.length - 1]
    : state.rootFile
  const filename = path.resolve(
    path.dirname(state.rootFile),
    currentFile
  )

  // Skip the first line after a box warning, this is just garbage
  if (state.insideBoxWarn) {
    state.insideBoxWarn = false
    return
  }

  // Append the read line, since we have a corresponding result in the matching
  if (state.searchEmptyLine) {
    if (line.trim() === '' || (state.insideError && line.match(/^\s/))) {
      state.currentResult.text = state.currentResult.text + '\n'
      state.searchEmptyLine = false
      state.insideError = false
    } else {
      const packageExtraLineResult = line.match(latexPackageWarningExtraLines)
      if (packageExtraLineResult) {
        state.currentResult.text +=
          '\n(' +
          packageExtraLineResult[1] +
          ')\t' +
          packageExtraLineResult[2] +
          (packageExtraLineResult[4] ? '.' : '')
        state.currentResult.line = packageExtraLineResult[3]
          ? parseInt(packageExtraLineResult[3], 10)
          : 1
      } else if (state.insideError) {
        const match = messageLine.exec(line)
        if (match && match.length >= 2) {
          const subLine = match[2]
          state.currentResult.errorPosText = subLine
          state.searchEmptyLine = false
          state.insideError = false
        } else {
          state.currentResult.text = state.currentResult.text + '\n' + line
        }
      } else {
        state.currentResult.text = state.currentResult.text + '\n' + line
      }
    }
    return
  }

  if (parseUndefinedReference(line, filename, state, buildLog)) {
    return undefined
  }
  const badBoxResult = parseBadBox(line, filename, state, buildLog)
  if (badBoxResult !== false) {
    // If parseBadBox returned a string, it's a remainder to continue parsing
    return typeof badBoxResult === 'string' ? badBoxResult : undefined
  }

  let result = line.match(latexNoPageOutput)
  if (result) {
    if (state.currentResult.type !== '') {
      buildLog.push(state.currentResult)
    }
    state.currentResult = {
      type: 'error',
      file: filename,
      line: 1,
      text: result[0]
    }
    state.searchEmptyLine = true
    state.insideError = true
    return
  }

  result = line.match(latexMissChar)
  if (result) {
    if (state.currentResult.type !== '') {
      buildLog.push(state.currentResult)
    }
    state.currentResult = {
      type: 'warning',
      file: filename,
      line: 1,
      text: result[1]
    }
    state.searchEmptyLine = false
    return
  }

  result = line.match(latexWarn)
  if (result) {
    if (state.currentResult.type !== '') {
      buildLog.push(state.currentResult)
    }
    state.currentResult = {
      type: 'warning',
      file: filename,
      line: result[4] ? parseInt(result[4], 10) : 1,
      text: result[1] + ': ' + result[3] + result[5]
    }
    state.searchEmptyLine = true
    return
  }

  result = line.match(biberWarn)
  if (result) {
    if (state.currentResult.type !== '') {
      buildLog.push(state.currentResult)
    }
    state.currentResult = {
      type: 'warning',
      file: '',
      line: 1,
      text: `No bib entry found for '${result[1]}'`
    }
    state.searchEmptyLine = false
    return line.substring(result[0].length)
  }

  result = line.match(latexError)
  if (result) {
    if (state.currentResult.type !== '') {
      buildLog.push(state.currentResult)
    }
    state.currentResult = {
      type: 'error',
      text: result[3] && result[3] !== 'LaTeX' ? `${result[3]}: ${result[4]}` : result[4],
      file: result[1] ? path.resolve(path.dirname(state.rootFile), result[1]) : filename,
      line: result[2] ? parseInt(result[2], 10) : 1
    }
    state.searchEmptyLine = true
    state.insideError = true
    return
  }

  state.nested = parseLaTeXFileStack(line, state.fileStack, state.nested)
  if (state.fileStack.length === 0) {
    state.fileStack.push(state.rootFile)
  }
}

function parseUndefinedReference(
  line: string,
  filename: string,
  state: ParserState,
  buildLog: LogEntry[]
): boolean {
  if (line === 'LaTeX Warning: There were undefined references.') {
    return true
  }
  const match = line.match(UNDEFINED_REFERENCE)
  if (match === null) {
    return false
  }

  if (state.currentResult.type !== '') {
    buildLog.push(state.currentResult)
  }
  state.currentResult = {
    type: 'warning',
    file: filename,
    line: match[3] ? parseInt(match[3], 10) : 1,
    text: `Cannot find ${match[1].toLowerCase()} \`${match[2]}\`.`,
    errorPosText: match[2]
  }
  state.searchEmptyLine = false

  return true
}

function parseBadBox(
  line: string,
  filename: string,
  state: ParserState,
  buildLog: LogEntry[]
): string | boolean {
  // Hardcoded to 'both' — show all badboxes
  const regexs = [
    latexOverfullBox,
    latexOverfullBoxAlt,
    latexOverfullBoxOutput,
    latexUnderfullBox,
    latexUnderfullBoxAlt,
    latexUnderfullBoxOutput
  ]

  for (const regex of regexs) {
    const result = line.match(regex)
    if (result === null) {
      continue
    }
    if (state.currentResult.type !== '') {
      buildLog.push(state.currentResult)
    }
    if ([latexOverfullBoxOutput, latexUnderfullBoxOutput].includes(regex)) {
      state.currentResult = {
        type: 'typesetting',
        file: filename,
        line: 1,
        text: result[2] ? `${result[1]} in page ${result[2]}` : result[1]
      }
      return line.substring(result[0].length)
    } else {
      state.currentResult = {
        type: 'typesetting',
        file: filename,
        line: parseInt(result[2], 10),
        text: result[1]
      }
      state.insideBoxWarn = true
      state.searchEmptyLine = false
    }
    return true
  }
  return false
}

function parseLaTeXFileStack(line: string, fileStack: string[], nested: number): number {
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
