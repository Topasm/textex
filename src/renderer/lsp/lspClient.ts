import type {
  editor as monacoEditor,
  MarkerSeverity
} from 'monaco-editor'
import { MonacoInstance } from './types'
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

let nextRequestId = 1
const pendingRequests = new Map<RequestId, PendingRequest>()
let initialized = false
let serverCapabilities: Record<string, unknown> = {}
let options: LspClientOptions | null = null
let disposables: { dispose(): void }[] = []
const LSP_MARKER_OWNER = 'texlab'

const DEFAULT_REQUEST_TIMEOUT = 5000

export function sendRequest(method: string, params: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT): Promise<unknown> {
  const id = nextRequestId++
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`LSP request "${method}" timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout)
        resolve(result)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    })
    window.api.lspSend({ jsonrpc: '2.0', id, method, params })
  })
}

function sendNotification(method: string, params: unknown): void {
  window.api.lspSend({ jsonrpc: '2.0', method, params })
}

function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')

  if (normalized.startsWith('//')) {
    return `file:${encodeURI(normalized)}`
  }

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }

  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`
  }

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

function handleMessage(message: Record<string, unknown>): void {
  // Response to a request
  if ('id' in message && ('result' in message || 'error' in message)) {
    const id = message.id as number
    const pending = pendingRequests.get(id)
    if (pending) {
      pendingRequests.delete(id)
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
    handleNotification(message.method as string, message.params as Record<string, unknown>)
    return
  }

  // Server request (e.g. window/showMessage) — respond with null
  if ('method' in message && 'id' in message) {
    window.api.lspSend({
      jsonrpc: '2.0',
      id: message.id,
      result: null
    })
  }
}

function handleNotification(method: string, params: Record<string, unknown>): void {
  if (method === 'textDocument/publishDiagnostics') {
    applyDiagnostics(params)
  }
}

function applyDiagnostics(params: Record<string, unknown>): void {
  if (!options) return
  const monaco = options.monaco
  const uri = params.uri as string
  const diagnostics = (params.diagnostics || []) as Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } }
    severity?: number
    message: string
    source?: string
  }>

  // Find model matching this URI
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
      case 1:
        severity = monaco.MarkerSeverity.Error
        break
      case 2:
        severity = monaco.MarkerSeverity.Warning
        break
      case 3:
        severity = monaco.MarkerSeverity.Info
        break
      default:
        severity = monaco.MarkerSeverity.Hint
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

async function doInitialize(workspaceRoot: string): Promise<void> {
  const rootUri = filePathToUri(workspaceRoot)
  const result = (await sendRequest('initialize', {
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
        hover: {
          contentFormat: ['plaintext', 'markdown']
        },
        definition: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
        formatting: { dynamicRegistration: false },
        rename: { dynamicRegistration: false },
        publishDiagnostics: { relatedInformation: false },
        foldingRange: {
          dynamicRegistration: false,
          lineFoldingOnly: true
        },
        semanticTokens: {
          dynamicRegistration: false,
          requests: {
            range: false,
            full: { delta: false }
          },
          tokenTypes: ['type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'],
          tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'],
          formats: ['relative']
        }
      },
      workspace: {
        workspaceFolders: false
      }
    }
  }, 15000)) as Record<string, unknown> // longer timeout for initialize

  serverCapabilities = (result?.capabilities || {}) as Record<string, unknown>
  sendNotification('initialized', {})
  initialized = true
}

function notifyDidOpen(filePath: string, content: string, version: number, languageId?: string): void {
  if (!initialized) return
  const lang = languageId || (filePath.endsWith('.bib') ? 'bibtex' : 'latex')
  sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: filePathToUri(filePath),
      languageId: lang,
      version,
      text: content
    }
  })
}

function notifyDidChange(filePath: string, content: string, version: number): void {
  if (!initialized) return
  sendNotification('textDocument/didChange', {
    textDocument: { uri: filePathToUri(filePath), version },
    contentChanges: [{ text: content }]
  })
}

function notifyDidSave(filePath: string): void {
  if (!initialized) return
  sendNotification('textDocument/didSave', {
    textDocument: { uri: filePathToUri(filePath) }
  })
}

function notifyDidClose(filePath: string): void {
  if (!initialized) return
  sendNotification('textDocument/didClose', {
    textDocument: { uri: filePathToUri(filePath) }
  })
}

export function currentDocUri(): string {
  const filePath = options?.getDocumentUri()
  return filePath ? filePathToUri(filePath) : ''
}

export function isInitialized(): boolean {
  return initialized
}

function registerProviders(monaco: MonacoInstance): void {
  // Completion provider
  if (serverCapabilities.completionProvider) {
    const d = monaco.languages.registerCompletionItemProvider('latex', createCompletionProvider(monaco))
    disposables.push(d)
  }

  // Hover provider
  if (serverCapabilities.hoverProvider) {
    const d = monaco.languages.registerHoverProvider('latex', createHoverProvider(monaco))
    disposables.push(d)
  }

  // Definition provider
  if (serverCapabilities.definitionProvider) {
    const d = monaco.languages.registerDefinitionProvider('latex', createDefinitionProvider(monaco))
    disposables.push(d)
  }

  // Document symbol provider
  if (serverCapabilities.documentSymbolProvider) {
    const d = monaco.languages.registerDocumentSymbolProvider('latex', createDocumentSymbolProvider(monaco))
    disposables.push(d)
  }

  // Rename provider
  if (serverCapabilities.renameProvider) {
    const d = monaco.languages.registerRenameProvider('latex', createRenameProvider(monaco))
    disposables.push(d)
  }

  // Formatting provider
  if (serverCapabilities.documentFormattingProvider) {
    const d = monaco.languages.registerDocumentFormattingEditProvider('latex', createFormattingProvider(monaco))
    disposables.push(d)
  }

  // Folding range provider
  if (serverCapabilities.foldingRangeProvider) {
    const d = monaco.languages.registerFoldingRangeProvider('latex', createFoldingProvider(monaco))
    disposables.push(d)
  }

  // Semantic tokens provider
  if (serverCapabilities.semanticTokensProvider) {
    const provider = serverCapabilities.semanticTokensProvider as { legend: { tokenTypes: string[]; tokenModifiers: string[] } }
    const legend = provider.legend || { tokenTypes: [], tokenModifiers: [] }

    const d = monaco.languages.registerDocumentSemanticTokensProvider('latex', createSemanticTokensProvider(monaco, legend))
    disposables.push(d)
  }

  // Also register for bibtex if capabilities exist
  if (serverCapabilities.completionProvider) {
    const d = monaco.languages.registerCompletionItemProvider('bibtex', createBibtexCompletionProvider(monaco))
    disposables.push(d)
  }
}

// ---- Public API ----

const documentVersions = new Map<string, number>()

export async function startLspClient(
  workspaceRoot: string,
  monacoInstance: MonacoInstance,
  getDocUri: () => string | null,
  getDocContent: () => string
): Promise<void> {
  options = {
    monaco: monacoInstance,
    getDocumentUri: getDocUri,
    getDocumentContent: getDocContent
  }

  // Listen for messages from the TexLab process
  window.api.onLspMessage((message: object) => {
    handleMessage(message as Record<string, unknown>)
  })

  // Start TexLab process
  await window.api.lspStart(workspaceRoot)

  // Perform LSP initialize handshake
  try {
    await doInitialize(workspaceRoot)
  } catch {
    return
  }

  // Register Monaco providers based on server capabilities
  registerProviders(monacoInstance)
}

export function stopLspClient(): void {
  if (initialized) {
    try {
      sendRequest('shutdown', null)
        .then(() => sendNotification('exit', null))
        .catch(() => sendNotification('exit', null))
    } catch {
      // ignore
    }
  }

  initialized = false
  serverCapabilities = {}
  pendingRequests.clear()
  nextRequestId = 1
  documentVersions.clear()
  options = null

  for (const d of disposables) d.dispose()
  disposables = []

  window.api.removeLspMessageListener()
  window.api.lspStop()
}

export function isLspRunning(): boolean {
  return initialized
}

export function lspNotifyDidOpen(filePath: string, content: string): void {
  const version = (documentVersions.get(filePath) || 0) + 1
  documentVersions.set(filePath, version)
  notifyDidOpen(filePath, content, version)
}

export function lspNotifyDidChange(filePath: string, content: string): void {
  const version = (documentVersions.get(filePath) || 0) + 1
  documentVersions.set(filePath, version)
  notifyDidChange(filePath, content, version)
}

export function lspNotifyDidSave(filePath: string): void {
  notifyDidSave(filePath)
}

export function lspNotifyDidClose(filePath: string): void {
  notifyDidClose(filePath)
}

// ---- Document Symbols ----

interface LspDocumentSymbol {
  name: string
  detail?: string
  kind: number
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } }
  children?: LspDocumentSymbol[]
}

function mapSymbols(symbols: LspDocumentSymbol[]): import('../../shared/types').DocumentSymbolNode[] {
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

export async function lspRequestDocumentSymbols(filePath: string): Promise<import('../../shared/types').DocumentSymbolNode[]> {
  if (!initialized) return []
  try {
    const result = await sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: filePathToUri(filePath) }
    })
    if (!result || !Array.isArray(result)) return []
    return mapSymbols(result as LspDocumentSymbol[])
  } catch {
    return []
  }
}

