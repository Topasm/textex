import { useCallback } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useAppStore } from '../../store/useAppStore'

function findCommandArgAtPosition(
  lineContent: string,
  column: number,
  cmdRegex: RegExp
): string | null {
  const col = column - 1
  let match: RegExpExecArray | null
  cmdRegex.lastIndex = 0
  while ((match = cmdRegex.exec(lineContent)) !== null) {
    const fullStart = match.index
    const fullEnd = fullStart + match[0].length
    if (col >= fullStart && col <= fullEnd) {
      const argsStr = match[1]
      const argsStart = match[0].indexOf(argsStr) + fullStart
      const keys = argsStr.split(',')
      let offset = argsStart
      for (const key of keys) {
        const trimmed = key.trim()
        const keyStart = offset + key.indexOf(trimmed)
        const keyEnd = keyStart + trimmed.length
        if (col >= keyStart && col <= keyEnd) {
          return trimmed
        }
        offset += key.length + 1
      }
      return keys[0]?.trim() || null
    }
  }
  return null
}

export function useClickNavigation(): (editor: monacoEditor.IStandaloneCodeEditor) => { dispose(): void } {
  return useCallback((editor: monacoEditor.IStandaloneCodeEditor) => {
    return editor.onMouseDown((e) => {
      if (!(e.event.ctrlKey || e.event.metaKey)) return
      if (!e.target.position) return
      e.event.preventDefault()
      e.event.stopPropagation()

      const state = useAppStore.getState()
      const currentFilePath = state.filePath
      if (!currentFilePath) return

      const model = editor.getModel()
      if (!model) return
      const lineContent = model.getLineContent(e.target.position.lineNumber)
      const col = e.target.position.column

      const refKey = findCommandArgAtPosition(
        lineContent,
        col,
        /\\(?:ref|eqref|autoref|pageref|cref|Cref|nameref)\{([^}]+)\}/g
      )
      if (refKey) {
        const label = state.labels.find((l) => l.label === refKey)
        if (label) {
          window.api.readFile(label.file).then((result) => {
            useAppStore.getState().openFileInTab(result.filePath, result.content)
            setTimeout(() => useAppStore.getState().requestJumpToLine(label.line, 1), 50)
          }).catch((err) => { console.warn('Failed to navigate to label:', err) })
          return
        }
      }

      const citeKey = findCommandArgAtPosition(lineContent, col, /\\cite[tp]?\*?\{([^}]+)\}/g)
      if (citeKey) {
        const entry = state.bibEntries.find((b) => b.key === citeKey)
        if (entry?.file) {
          window.api.readFile(entry.file).then((result) => {
            useAppStore.getState().openFileInTab(result.filePath, result.content)
            if (entry.line) {
              const line = entry.line
              setTimeout(() => useAppStore.getState().requestJumpToLine(line, 1), 50)
            }
          }).catch((err) => { console.warn('Failed to navigate to citation:', err) })
          return
        }
      }

      const inputFile = findCommandArgAtPosition(lineContent, col, /\\(?:input|include)\{([^}]+)\}/g)
      if (inputFile && state.projectRoot) {
        let resolvedPath = inputFile
        if (!resolvedPath.endsWith('.tex')) resolvedPath += '.tex'
        const fullPath = resolvedPath.startsWith('/')
          ? resolvedPath
          : `${state.projectRoot}/${resolvedPath}`
        window.api.readFile(fullPath).then((result) => {
          useAppStore.getState().openFileInTab(result.filePath, result.content)
        }).catch(() => { })
        return
      }

      const line = e.target.position.lineNumber
      window.api.synctexForward(currentFilePath, line).then((result) => {
        if (result) {
          useAppStore.getState().setSynctexHighlight(result)
        }
      })
    })
  }, [])
}
