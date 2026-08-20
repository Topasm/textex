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
import { extractBandSymbols, mergeBandSymbols } from './editor/useDocumentSymbols'
import { documentRegistry } from '../models/documentRegistry'

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
  const lspStatus = useUiStore((s) => s.lspStatus)

  // LSP start/stop
  useEffect(() => {
    if (!projectRoot || !lspEnabled) {
      stopLspClient()
      useUiStore.getState().setLspStatus('stopped')
      return
    }

    let cancelled = false
    import('../data/monacoSetup')
      .then(() => loader.init())
      .then((monacoInstance) => {
        if (cancelled) return
        startLspClient(
          projectRoot,
          monacoInstance,
          () => useEditorStore.getState().filePath,
          () => {
            const activeFile = useEditorStore.getState().filePath
            return activeFile ? (documentRegistry.snapshot(activeFile)?.text ?? '') : ''
          }
        ).catch(() => {})
      })
      .catch(() => {})

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

  // Notify LSP of document changes without publishing text through React state.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useEditorStore.subscribe(
      (state) => state.revision,
      () => {
        clearTimeout(timer)
        const editorState = useEditorStore.getState()
        const filePath = editorState.filePath
        const snapshot = filePath ? documentRegistry.snapshot(filePath) : null
        if (!filePath || !snapshot) return
        timer = setTimeout(() => {
          const model = documentRegistry.getModel(filePath)
          if (
            model?.isCurrent(snapshot) &&
            useEditorStore.getState().filePath === filePath &&
            useSettingsStore.getState().settings.lspEnabled
          ) {
            lspNotifyDidChange(filePath, snapshot.text)
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

    if (!filePath) {
      useUiStore.getState().setDocumentSymbols([])
    }
  }, [filePath])

  useEffect(() => {
    const lspRunning = lspEnabled && lspStatus === 'running'

    if (!filePath || !lspRunning) return

    const activeFile = filePath
    const snapshot = documentRegistry.snapshot(activeFile)
    if (!snapshot) return
    lspNotifyDidOpen(activeFile, snapshot.text)

    const timer = setTimeout(() => {
      if (useEditorStore.getState().filePath !== activeFile) return
      Promise.all([
        lspRequestDocumentSymbols(activeFile),
        window.api.getDocumentOutline(activeFile, snapshot.text).catch(() => [])
      ]).then(([symbols, fallbackOutline]) => {
        if (
          useEditorStore.getState().filePath === activeFile &&
          documentRegistry.getModel(activeFile)?.isCurrent(snapshot)
        ) {
          useUiStore
            .getState()
            .setDocumentSymbols(mergeBandSymbols(symbols, extractBandSymbols(fallbackOutline)))
        }
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [filePath, lspEnabled, lspStatus])
}
