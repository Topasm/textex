import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useUiStore } from '../store/useUiStore'
import type { LspStatus } from '../store/useUiStore'
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
      useUiStore.getState().setLspStatus('stopped')
      return
    }

    let cancelled = false
    loader.init().then((monacoInstance) => {
      if (cancelled) return
      startLspClient(
        projectRoot,
        monacoInstance,
        () => useEditorStore.getState().filePath,
        () => useEditorStore.getState().content
      ).catch(() => {})
    })

    return () => {
      cancelled = true
      stopLspClient()
    }
  }, [projectRoot, lspEnabled])

  // LSP status listener
  useEffect(() => {
    window.api.onLspStatus((status: string, error?: string) => {
      useUiStore.getState().setLspStatus(status as LspStatus)
      useUiStore.getState().setLspError(error || null)
    })
    return () => {
      window.api.removeLspStatusListener()
    }
  }, [])

  // Notify LSP of document changes (debounced via store subscription)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useEditorStore.subscribe(
      (state) => state.content,
      (newContent) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const editorState = useEditorStore.getState()
          if (editorState.filePath && useSettingsStore.getState().settings.lspEnabled) {
            lspNotifyDidChange(editorState.filePath, newContent)
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
      lspNotifyDidOpen(filePath, useEditorStore.getState().content)
      const lspRunning = useSettingsStore.getState().settings.lspEnabled && useUiStore.getState().lspStatus === 'running'
      if (lspRunning) {
        const switchedFile = filePath
        const timer = setTimeout(() => {
          if (useEditorStore.getState().filePath === switchedFile) {
            lspRequestDocumentSymbols(switchedFile).then((symbols) => {
              if (useEditorStore.getState().filePath === switchedFile) {
                useUiStore.getState().setDocumentSymbols(symbols)
              }
            })
          }
        }, 200)
        return () => clearTimeout(timer)
      }
    } else {
      useUiStore.getState().setDocumentSymbols([])
    }
  }, [filePath])
}
