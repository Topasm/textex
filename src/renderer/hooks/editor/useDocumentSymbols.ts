import { useEffect } from 'react'
import { lspRequestDocumentSymbols } from '../../lsp/lspClient'
import { useAppStore } from '../../store/useAppStore'

export function useDocumentSymbols(content: string): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useAppStore.getState()
      if (!state.filePath || !state.lspEnabled || state.lspStatus !== 'running') return

      const currentFile = state.filePath
      lspRequestDocumentSymbols(currentFile).then((symbols) => {
        if (useAppStore.getState().filePath === currentFile) {
          useAppStore.getState().setDocumentSymbols(symbols)
        }
      }).catch(() => {})
    }, 2000)

    return () => clearTimeout(timer)
  }, [content])
}
