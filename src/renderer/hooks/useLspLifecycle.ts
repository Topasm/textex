import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { LspStatus } from '../store/useAppStore'
import {
  startLspClient,
  stopLspClient,
  lspNotifyDidOpen,
  lspNotifyDidClose,
  lspNotifyDidChange,
  lspRequestDocumentSymbols
} from '../lsp/lspClient'
import { loader } from '@monaco-editor/react'

/**
 * Manages the LSP client lifecycle:
 * - Start/stop based on projectRoot and lspEnabled
 * - Listen for LSP status changes
 * - Notify LSP of document open/change/close
 * - Request document symbols on file switch
 */
export function useLspLifecycle(
  projectRoot: string | null,
  lspEnabled: boolean,
  filePath: string | null
): void {
  const prevFilePathRef = useRef<string | null>(null)

  // LSP start/stop
  useEffect(() => {
    if (!projectRoot || !lspEnabled) {
      stopLspClient()
      useAppStore.getState().setLspStatus('stopped')
      return
    }

    let cancelled = false
    loader.init().then((monacoInstance) => {
      if (cancelled) return
      startLspClient(
        projectRoot,
        monacoInstance,
        () => useAppStore.getState().filePath,
        () => useAppStore.getState().content
      ).catch(() => { })
    })

    return () => {
      cancelled = true
      stopLspClient()
    }
  }, [projectRoot, lspEnabled])

  // LSP status listener
  useEffect(() => {
    window.api.onLspStatus((status: string, error?: string) => {
      useAppStore.getState().setLspStatus(status as LspStatus)
      useAppStore.getState().setLspError(error || null)
    })
    return () => {
      window.api.removeLspStatusListener()
    }
  }, [])

  // Notify LSP of document changes (debounced via store subscription)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useAppStore.subscribe(
      (state) => state.content,
      (newContent) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const state = useAppStore.getState()
          if (state.filePath && state.settings.lspEnabled) {
            lspNotifyDidChange(state.filePath, newContent)
          }
        }, 300)
      }
    )
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  // Notify LSP when switching files
  useEffect(() => {
    const prevFile = prevFilePathRef.current
    prevFilePathRef.current = filePath

    if (prevFile && prevFile !== filePath) {
      lspNotifyDidClose(prevFile)
    }

    if (filePath) {
      lspNotifyDidOpen(filePath, useAppStore.getState().content)
      const state = useAppStore.getState()
      if (state.settings.lspEnabled && state.lspStatus === 'running') {
        const switchedFile = filePath
        const timer = setTimeout(() => {
          if (useAppStore.getState().filePath === switchedFile) {
            lspRequestDocumentSymbols(switchedFile).then((symbols) => {
              if (useAppStore.getState().filePath === switchedFile) {
                useAppStore.getState().setDocumentSymbols(symbols)
              }
            })
          }
        }, 200)
        return () => clearTimeout(timer)
      }
    } else {
      useAppStore.getState().setDocumentSymbols([])
    }
  }, [filePath])
}
