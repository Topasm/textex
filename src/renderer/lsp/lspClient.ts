import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

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

function sendRequest(method: string, params: unknown): Promise<unknown> {
  const id = nextRequestId++
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
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
        pending.reject(new Error(JSON.stringify(message.error)))
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
    let severity: monacoEditor.MarkerSeverity
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
        publishDiagnostics: { relatedInformation: false }
      },
      workspace: {
        workspaceFolders: false
      }
    }
  })) as Record<string, unknown>

  serverCapabilities = (result?.capabilities || {}) as Record<string, unknown>
  sendNotification('initialized', {})
  initialized = true
}

function notifyDidOpen(filePath: string, content: string, languageId?: string): void {
  if (!initialized) return
  const lang = languageId || (filePath.endsWith('.bib') ? 'bibtex' : 'latex')
  sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: filePathToUri(filePath),
      languageId: lang,
      version: 1,
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

function currentDocUri(): string {
  const filePath = options?.getDocumentUri()
  return filePath ? filePathToUri(filePath) : ''
}

function registerProviders(monaco: MonacoInstance): void {
  // Completion provider
  if (serverCapabilities.completionProvider) {
    const d = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['\\', '{', ',', ' '],
      provideCompletionItems: async (model, position) => {
        if (!initialized) return { suggestions: [] }
        try {
          const result = (await sendRequest('textDocument/completion', {
            textDocument: { uri: currentDocUri() },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          })) as { items?: unknown[] } | unknown[] | null

          const items = Array.isArray(result) ? result : result?.items || []
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          }

          const suggestions = (items as Array<Record<string, unknown>>).map((item) => {
            const kind = lspCompletionKindToMonaco(monaco, item.kind as number)
            const insertText = (item.textEdit as Record<string, unknown>)?.newText ||
              (item.insertText as string) || (item.label as string)
            const isSnippet = item.insertTextFormat === 2
            return {
              label: item.label as string,
              kind,
              insertText: insertText as string,
              insertTextRules: isSnippet
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
              detail: (item.detail as string) || '',
              documentation: item.documentation as string | undefined,
              range,
              sortText: (item.sortText as string) || undefined,
              filterText: (item.filterText as string) || undefined
            }
          })
          return { suggestions }
        } catch {
          return { suggestions: [] }
        }
      }
    })
    disposables.push(d)
  }

  // Hover provider
  if (serverCapabilities.hoverProvider) {
    const d = monaco.languages.registerHoverProvider('latex', {
      provideHover: async (model, position) => {
        if (!initialized) return null
        try {
          const result = (await sendRequest('textDocument/hover', {
            textDocument: { uri: currentDocUri() },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          })) as { contents: unknown; range?: { start: { line: number; character: number }; end: { line: number; character: number } } } | null

          if (!result || !result.contents) return null
          const contents = formatHoverContents(result.contents)
          const range = result.range
            ? {
                startLineNumber: result.range.start.line + 1,
                startColumn: result.range.start.character + 1,
                endLineNumber: result.range.end.line + 1,
                endColumn: result.range.end.character + 1
              }
            : undefined
          return { contents, range }
        } catch {
          return null
        }
      }
    })
    disposables.push(d)
  }

  // Definition provider
  if (serverCapabilities.definitionProvider) {
    const d = monaco.languages.registerDefinitionProvider('latex', {
      provideDefinition: async (model, position) => {
        if (!initialized) return null
        try {
          const result = (await sendRequest('textDocument/definition', {
            textDocument: { uri: currentDocUri() },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          })) as Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> | { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } | null

          if (!result) return null
          const locations = Array.isArray(result) ? result : [result]
          return locations.map((loc) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: {
              startLineNumber: loc.range.start.line + 1,
              startColumn: loc.range.start.character + 1,
              endLineNumber: loc.range.end.line + 1,
              endColumn: loc.range.end.character + 1
            }
          }))
        } catch {
          return null
        }
      }
    })
    disposables.push(d)
  }

  // Document symbol provider
  if (serverCapabilities.documentSymbolProvider) {
    const d = monaco.languages.registerDocumentSymbolProvider('latex', {
      provideDocumentSymbols: async (model) => {
        if (!initialized) return []
        try {
          const result = (await sendRequest('textDocument/documentSymbol', {
            textDocument: { uri: currentDocUri() }
          })) as Array<Record<string, unknown>> | null

          if (!result) return []
          return result.map((sym) => {
            const range = sym.range as { start: { line: number; character: number }; end: { line: number; character: number } }
            const selRange = (sym.selectionRange || range) as typeof range
            return {
              name: sym.name as string,
              detail: (sym.detail as string) || '',
              kind: lspSymbolKindToMonaco(monaco, sym.kind as number),
              range: {
                startLineNumber: range.start.line + 1,
                startColumn: range.start.character + 1,
                endLineNumber: range.end.line + 1,
                endColumn: range.end.character + 1
              },
              selectionRange: {
                startLineNumber: selRange.start.line + 1,
                startColumn: selRange.start.character + 1,
                endLineNumber: selRange.end.line + 1,
                endColumn: selRange.end.character + 1
              },
              tags: []
            }
          })
        } catch {
          return []
        }
      }
    })
    disposables.push(d)
  }

  // Rename provider
  if (serverCapabilities.renameProvider) {
    const d = monaco.languages.registerRenameProvider('latex', {
      provideRenameEdits: async (model, position, newName) => {
        if (!initialized) return null
        try {
          const result = (await sendRequest('textDocument/rename', {
            textDocument: { uri: currentDocUri() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
            newName
          })) as { changes?: Record<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>> } | null

          if (!result?.changes) return null
          const edits: monacoEditor.IWorkspaceTextEdit[] = []
          for (const [uri, changes] of Object.entries(result.changes)) {
            for (const change of changes) {
              edits.push({
                resource: monaco.Uri.parse(uri),
                textEdit: {
                  range: {
                    startLineNumber: change.range.start.line + 1,
                    startColumn: change.range.start.character + 1,
                    endLineNumber: change.range.end.line + 1,
                    endColumn: change.range.end.character + 1
                  },
                  text: change.newText
                },
                versionId: undefined as unknown as number
              })
            }
          }
          return { edits }
        } catch {
          return null
        }
      },
      resolveRenameLocation: async (model, position) => {
        if (!initialized) return { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: '' }
        try {
          const result = (await sendRequest('textDocument/prepareRename', {
            textDocument: { uri: currentDocUri() },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          })) as { range: { start: { line: number; character: number }; end: { line: number; character: number } }; placeholder?: string } | null

          if (!result) return { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: '', rejectReason: 'Cannot rename this element' }
          return {
            range: {
              startLineNumber: result.range.start.line + 1,
              startColumn: result.range.start.character + 1,
              endLineNumber: result.range.end.line + 1,
              endColumn: result.range.end.character + 1
            },
            text: result.placeholder || model.getValueInRange({
              startLineNumber: result.range.start.line + 1,
              startColumn: result.range.start.character + 1,
              endLineNumber: result.range.end.line + 1,
              endColumn: result.range.end.character + 1
            })
          }
        } catch {
          return { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: '', rejectReason: 'Rename not available' }
        }
      }
    })
    disposables.push(d)
  }

  // Formatting provider
  if (serverCapabilities.documentFormattingProvider) {
    const d = monaco.languages.registerDocumentFormattingEditProvider('latex', {
      provideDocumentFormattingEdits: async (model) => {
        if (!initialized) return []
        try {
          const result = (await sendRequest('textDocument/formatting', {
            textDocument: { uri: currentDocUri() },
            options: { tabSize: 2, insertSpaces: true }
          })) as Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> | null

          if (!result) return []
          return result.map((edit) => ({
            range: {
              startLineNumber: edit.range.start.line + 1,
              startColumn: edit.range.start.character + 1,
              endLineNumber: edit.range.end.line + 1,
              endColumn: edit.range.end.character + 1
            },
            text: edit.newText
          }))
        } catch {
          return []
        }
      }
    })
    disposables.push(d)
  }

  // Also register for bibtex if capabilities exist
  if (serverCapabilities.completionProvider) {
    const d = monaco.languages.registerCompletionItemProvider('bibtex', {
      triggerCharacters: ['@', '{'],
      provideCompletionItems: async (model, position) => {
        if (!initialized) return { suggestions: [] }
        try {
          const result = (await sendRequest('textDocument/completion', {
            textDocument: { uri: currentDocUri() },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          })) as { items?: unknown[] } | unknown[] | null

          const items = Array.isArray(result) ? result : result?.items || []
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          }
          const suggestions = (items as Array<Record<string, unknown>>).map((item) => ({
            label: item.label as string,
            kind: lspCompletionKindToMonaco(monaco, item.kind as number),
            insertText: ((item.textEdit as Record<string, unknown>)?.newText || item.insertText || item.label) as string,
            detail: (item.detail as string) || '',
            range
          }))
          return { suggestions }
        } catch {
          return { suggestions: [] }
        }
      }
    })
    disposables.push(d)
  }
}

function lspCompletionKindToMonaco(monaco: MonacoInstance, kind: number | undefined): monacoEditor.languages.CompletionItemKind {
  const map: Record<number, monacoEditor.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    21: monaco.languages.CompletionItemKind.Constant
  }
  return map[kind || 1] || monaco.languages.CompletionItemKind.Text
}

function lspSymbolKindToMonaco(monaco: MonacoInstance, kind: number): monacoEditor.languages.SymbolKind {
  const map: Record<number, monacoEditor.languages.SymbolKind> = {
    1: monaco.languages.SymbolKind.File,
    2: monaco.languages.SymbolKind.Module,
    3: monaco.languages.SymbolKind.Namespace,
    5: monaco.languages.SymbolKind.Class,
    6: monaco.languages.SymbolKind.Method,
    8: monaco.languages.SymbolKind.Constructor,
    12: monaco.languages.SymbolKind.Function,
    13: monaco.languages.SymbolKind.Variable,
    14: monaco.languages.SymbolKind.Constant,
    15: monaco.languages.SymbolKind.String
  }
  return map[kind] || monaco.languages.SymbolKind.Variable
}

function formatHoverContents(contents: unknown): monacoEditor.IMarkdownString[] {
  if (typeof contents === 'string') {
    return [{ value: contents }]
  }
  if (Array.isArray(contents)) {
    return contents.map((c) =>
      typeof c === 'string' ? { value: c } : { value: (c as { value: string }).value || String(c) }
    )
  }
  if (contents && typeof contents === 'object') {
    const obj = contents as { kind?: string; value?: string; language?: string }
    if (obj.kind === 'markdown' || obj.value) {
      return [{ value: obj.value || '' }]
    }
    if (obj.language) {
      return [{ value: `\`\`\`${obj.language}\n${obj.value}\n\`\`\`` }]
    }
  }
  return []
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
  notifyDidOpen(filePath, content)
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
