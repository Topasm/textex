import type {
  editor as monacoEditor,
  MarkerSeverity
} from 'monaco-editor'
import type { MonacoInstance } from './types'
import type { DocumentSymbolNode } from '../../shared/types'
import { DisposableStore, toDisposable } from '../utils/disposable'
import { createCompletionProvider, createBibtexCompletionProvider } from './providers/completionProvider'
import { createHoverProvider } from './providers/hoverProvider'
import { createDefinitionProvider } from './providers/definitionProvider'
import { createDocumentSymbolProvider } from './providers/symbolProvider'
import { createRenameProvider } from './providers/renameProvider'
import { createFormattingProvider } from './providers/formattingProvider'
import { createFoldingProvider } from './providers/foldingProvider'
import { createSemanticTokensProvider } from './providers/semanticTokensProvider'

interface LspClientOptions {
  monaco: MonacoInstance
  getDocumentUri: () => string | null
  getDocumentContent: () => string
}

type RequestId = number
type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

interface LspDocumentSymbol {
  name: string
  detail?: string
  kind: number
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } }
  children?: LspDocumentSymbol[]
}

const DEFAULT_REQUEST_TIMEOUT = 5000
const LSP_MARKER_OWNER = 'texlab'

function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('//')) return `file:${encodeURI(normalized)}`
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`
  return `file:///${encodeURI(normalized)}`
}

function uriToFilePath(uri: string): string {
  try {
    const parsed = new URL(uri)
    if (parsed.protocol !== 'file:') return uri
    const decodedPath = decodeURIComponent(parsed.pathname)
    if (parsed.host) {
      const unc = `//${parsed.host}${decodedPath}`
      return process.platform === 'win32' ? unc.replace(/\//g, '\\') : unc
    }
    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
      return decodedPath.slice(1).replace(/\//g, '\\')
    }
    return decodedPath
  } catch {
    return uri
  }
}

function mapSymbols(symbols: LspDocumentSymbol[]): DocumentSymbolNode[] {
  return symbols.map((sym) => ({
    name: sym.name,
    detail: sym.detail || '',
    kind: sym.kind,
    range: {
      startLine: sym.range.start.line + 1,
      startColumn: sym.range.start.character + 1,
      endLine: sym.range.end.line + 1,
      endColumn: sym.range.end.character + 1
    },
    selectionRange: {
      startLine: sym.selectionRange.start.line + 1,
      startColumn: sym.selectionRange.start.character + 1,
      endLine: sym.selectionRange.end.line + 1,
      endColumn: sym.selectionRange.end.character + 1
    },
    children: sym.children ? mapSymbols(sym.children) : []
  }))
}

/**
 * Class-based LSP client (VS Code pattern).
 * Encapsulates all state (pending requests, initialization, disposables)
 * into a single instance rather than module-level globals.
 */
export class LspClient {
  private nextRequestId = 1
  private pendingRequests = new Map<RequestId, PendingRequest>()
  private _initialized = false
  private serverCapabilities: Record<string, unknown> = {}
  private options: LspClientOptions | null = null
  private disposables = new DisposableStore()
  private documentVersions = new Map<string, number>()

  get initialized(): boolean {
    return this._initialized
  }

  sendRequest(method: string, params: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT): Promise<unknown> {
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`LSP request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: (result) => { clearTimeout(timeout); resolve(result) },
        reject: (error) => { clearTimeout(timeout); reject(error) }
      })
      window.api.lspSend({ jsonrpc: '2.0', id, method, params })
    })
  }

  private sendNotification(method: string, params: unknown): void {
    window.api.lspSend({ jsonrpc: '2.0', method, params })
  }

  private handleMessage(message: Record<string, unknown>): void {
    // Response to a request
    if ('id' in message && ('result' in message || 'error' in message)) {
      const id = message.id as number
      const pending = this.pendingRequests.get(id)
      if (pending) {
        this.pendingRequests.delete(id)
        if ('error' in message) {
          const err = message.error as { message?: string } | undefined
          pending.reject(new Error(err?.message || JSON.stringify(message.error)))
        } else {
          pending.resolve(message.result)
        }
      }
      return
    }

    // Notification from server
    if ('method' in message && !('id' in message)) {
      this.handleNotification(message.method as string, message.params as Record<string, unknown>)
      return
    }

    // Server request (e.g. window/showMessage) — respond with null
    if ('method' in message && 'id' in message) {
      window.api.lspSend({ jsonrpc: '2.0', id: message.id, result: null })
    }
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (method === 'textDocument/publishDiagnostics') {
      this.applyDiagnostics(params)
    }
  }

  private applyDiagnostics(params: Record<string, unknown>): void {
    if (!this.options) return
    const monaco = this.options.monaco
    const uri = params.uri as string
    const diagnostics = (params.diagnostics || []) as Array<{
      range: { start: { line: number; character: number }; end: { line: number; character: number } }
      severity?: number
      message: string
      source?: string
    }>

    const filePath = uriToFilePath(uri)
    const models = monaco.editor.getModels()
    const model = models.find((m) => {
      const mUri = m.uri.toString()
      return mUri === uri || mUri.endsWith(filePath) || filePath.endsWith(m.uri.path)
    })
    if (!model) return

    const markers: monacoEditor.IMarkerData[] = diagnostics.map((d) => {
      let severity: MarkerSeverity
      switch (d.severity) {
        case 1: severity = monaco.MarkerSeverity.Error; break
        case 2: severity = monaco.MarkerSeverity.Warning; break
        case 3: severity = monaco.MarkerSeverity.Info; break
        default: severity = monaco.MarkerSeverity.Hint
      }
      return {
        severity,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        message: d.message,
        source: d.source || 'texlab'
      }
    })

    monaco.editor.setModelMarkers(model, LSP_MARKER_OWNER, markers)
  }

  private async doInitialize(workspaceRoot: string): Promise<void> {
    const rootUri = filePathToUri(workspaceRoot)
    const result = (await this.sendRequest('initialize', {
      processId: null,
      rootUri,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true
          },
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['plaintext', 'markdown']
            }
          },
          hover: { contentFormat: ['plaintext', 'markdown'] },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
          formatting: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: false },
          foldingRange: { dynamicRegistration: false, lineFoldingOnly: true },
          semanticTokens: {
            dynamicRegistration: false,
            requests: { range: false, full: { delta: false } },
            tokenTypes: ['type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'],
            tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'],
            formats: ['relative']
          }
        },
        workspace: { workspaceFolders: false }
      }
    }, 15000)) as Record<string, unknown>

    this.serverCapabilities = (result?.capabilities || {}) as Record<string, unknown>
    this.sendNotification('initialized', {})
    this._initialized = true
  }

  private registerProviders(monaco: MonacoInstance): void {
    const caps = this.serverCapabilities

    if (caps.completionProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerCompletionItemProvider('latex', createCompletionProvider(monaco)).dispose
      ))
    }
    if (caps.hoverProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerHoverProvider('latex', createHoverProvider(monaco)).dispose
      ))
    }
    if (caps.definitionProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerDefinitionProvider('latex', createDefinitionProvider(monaco)).dispose
      ))
    }
    if (caps.documentSymbolProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerDocumentSymbolProvider('latex', createDocumentSymbolProvider(monaco)).dispose
      ))
    }
    if (caps.renameProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerRenameProvider('latex', createRenameProvider(monaco)).dispose
      ))
    }
    if (caps.documentFormattingProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerDocumentFormattingEditProvider('latex', createFormattingProvider(monaco)).dispose
      ))
    }
    if (caps.foldingRangeProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerFoldingRangeProvider('latex', createFoldingProvider(monaco)).dispose
      ))
    }
    if (caps.semanticTokensProvider) {
      const provider = caps.semanticTokensProvider as { legend: { tokenTypes: string[]; tokenModifiers: string[] } }
      const legend = provider.legend || { tokenTypes: [], tokenModifiers: [] }
      this.disposables.add(toDisposable(
        monaco.languages.registerDocumentSemanticTokensProvider('latex', createSemanticTokensProvider(monaco, legend)).dispose
      ))
    }
    if (caps.completionProvider) {
      this.disposables.add(toDisposable(
        monaco.languages.registerCompletionItemProvider('bibtex', createBibtexCompletionProvider(monaco)).dispose
      ))
    }
  }

  // ---- Public API ----

  async start(
    workspaceRoot: string,
    monacoInstance: MonacoInstance,
    getDocUri: () => string | null,
    getDocContent: () => string
  ): Promise<void> {
    this.options = {
      monaco: monacoInstance,
      getDocumentUri: getDocUri,
      getDocumentContent: getDocContent
    }

    window.api.onLspMessage((message: object) => {
      this.handleMessage(message as Record<string, unknown>)
    })

    await window.api.lspStart(workspaceRoot)

    try {
      await this.doInitialize(workspaceRoot)
    } catch {
      return
    }

    this.registerProviders(monacoInstance)
  }

  stop(): void {
    if (this._initialized) {
      try {
        this.sendRequest('shutdown', null)
          .then(() => this.sendNotification('exit', null))
          .catch(() => this.sendNotification('exit', null))
      } catch {
        // ignore
      }
    }

    this._initialized = false
    this.serverCapabilities = {}
    this.pendingRequests.clear()
    this.nextRequestId = 1
    this.documentVersions.clear()
    this.options = null
    this.disposables.dispose()
    this.disposables = new DisposableStore()

    window.api.removeLspMessageListener()
    window.api.lspStop()
  }

  currentDocUri(): string {
    const filePath = this.options?.getDocumentUri()
    return filePath ? filePathToUri(filePath) : ''
  }

  notifyDidOpen(filePath: string, content: string): void {
    if (!this._initialized) return
    const version = (this.documentVersions.get(filePath) || 0) + 1
    this.documentVersions.set(filePath, version)
    const lang = filePath.endsWith('.bib') ? 'bibtex' : 'latex'
    this.sendNotification('textDocument/didOpen', {
      textDocument: { uri: filePathToUri(filePath), languageId: lang, version, text: content }
    })
  }

  notifyDidChange(filePath: string, content: string): void {
    if (!this._initialized) return
    const version = (this.documentVersions.get(filePath) || 0) + 1
    this.documentVersions.set(filePath, version)
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri: filePathToUri(filePath), version },
      contentChanges: [{ text: content }]
    })
  }

  notifyDidSave(filePath: string): void {
    if (!this._initialized) return
    this.sendNotification('textDocument/didSave', {
      textDocument: { uri: filePathToUri(filePath) }
    })
  }

  notifyDidClose(filePath: string): void {
    if (!this._initialized) return
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri: filePathToUri(filePath) }
    })
  }

  async requestDocumentSymbols(filePath: string): Promise<DocumentSymbolNode[]> {
    if (!this._initialized) return []
    try {
      const result = await this.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri: filePathToUri(filePath) }
      })
      if (!result || !Array.isArray(result)) return []
      return mapSymbols(result as LspDocumentSymbol[])
    } catch {
      return []
    }
  }
}

/** Singleton instance used throughout the app. */
export const lspClient = new LspClient()
