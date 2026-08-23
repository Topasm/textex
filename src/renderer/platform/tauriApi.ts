import { Channel, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DesktopApi, OpenFileResult, SaveAsResult, SaveResult } from '../types/api'
import type {
  DirectoryChangeEvent,
  DirectoryEntry,
  ProjectIndexSnapshot,
  SyncTeXForwardResult,
  SyncTeXInverseResult,
  SyncTeXLineMapEntry
} from '../../shared/types'
import { TAURI_COMMANDS } from '../../shared/tauriCommands'
import type {
  CompileDiagnosticsEvent,
  CompileLogEvent,
  CompileRequest,
  CompileResponse
} from '../../shared/compileProtocol'
import { parseContentOutline } from '../../shared/contentOutline'
import { builtInTemplates } from '../../shared/templates'
import type { Template } from '../../shared/templates'
import { APP_COMMAND_MANIFEST, type AppCommandId } from '../../shared/appCommandManifest'

const aiGenerate: DesktopApi['aiGenerate'] = (input, provider, model) =>
  invoke(TAURI_COMMANDS.aiGenerate, { input, provider, model })
const aiProcess: DesktopApi['aiProcess'] = (request) =>
  invoke(TAURI_COMMANDS.aiProcess, { request })
const aiProcessCustom: DesktopApi['aiProcessCustom'] = (request) =>
  invoke(TAURI_COMMANDS.aiProcessCustom, { request })
const aiUpdateContext: DesktopApi['aiUpdateContext'] = (filePath, content) =>
  invoke(TAURI_COMMANDS.aiUpdateContext, { filePath, content })
const aiSaveApiKey: DesktopApi['aiSaveApiKey'] = (provider, apiKey) =>
  invoke(TAURI_COMMANDS.aiSaveApiKey, { provider, apiKey })
const aiHasApiKey: DesktopApi['aiHasApiKey'] = (provider) =>
  invoke(TAURI_COMMANDS.aiHasApiKey, { provider })
const aiCheckCli: DesktopApi['aiCheckCli'] = () => invoke(TAURI_COMMANDS.aiCheckCli)
const aiCheckCodexCli: DesktopApi['aiCheckCodexCli'] = () => invoke(TAURI_COMMANDS.aiCheckCodexCli)
const aiOpenClaudeTerminal: DesktopApi['aiOpenClaudeTerminal'] = (request) =>
  invoke(TAURI_COMMANDS.aiOpenClaudeTerminal, { request })
const aiOpenCodexTerminal: DesktopApi['aiOpenCodexTerminal'] = (request) =>
  invoke(TAURI_COMMANDS.aiOpenCodexTerminal, { request })

type TauriCompileEvent =
  | (CompileLogEvent & { event: 'log' })
  | (CompileDiagnosticsEvent & { event: 'diagnostics' })
  | {
      event: 'progress'
      requestId: number
      documentId: string
      documentRevision: number
      stage: 'compiling' | 'done' | 'cancelled' | 'timedout' | 'failed'
      filePath: string
    }

interface TauriUpdateMetadata {
  currentVersion: string
  version: string
  date?: string
  body?: string
}

type TauriUpdateDownloadEvent =
  | { event: 'started'; contentLength: number | null }
  | {
      event: 'progress'
      chunkLength: number
      downloaded: number
      contentLength: number | null
    }
  | { event: 'finished' }

type TauriPtyEvent =
  | { event: 'data'; id: string; data: string }
  | { event: 'exit'; id: string; exitCode: number; signal: number | null }
  | { event: 'overflow'; id: string; droppedBytes: number }

type TauriLspEvent =
  { event: 'message'; message: object } | { event: 'status'; status: string; error?: string }

let compileLogCallback: ((event: CompileLogEvent) => void) | null = null
let diagnosticsCallback: ((event: CompileDiagnosticsEvent) => void) | null = null
let directoryChangeCallback: ((change: DirectoryChangeEvent) => void) | null = null
let directoryWatcherGeneration = 0
const updateCallbacks = new Map<string, (...args: unknown[]) => void>()
const ptyDataCallbacks = new Map<string, Set<(data: string) => void>>()
const ptyExitCallbacks = new Map<string, Set<(exitCode: number, signal: number | null) => void>>()
const pendingPtyData = new Map<string, string>()
const pendingPtyExit = new Map<string, { exitCode: number; signal: number | null }>()
const ptyEventChannels = new Map<string, Channel<TauriPtyEvent>>()
let lspMessageCallback: ((message: object) => void) | null = null
let lspStatusCallback: ((status: string, error?: string) => void) | null = null
let lspGeneration = 0
let lspTransition: Promise<void> = Promise.resolve()
const MAX_PENDING_PTY_DATA = 256 * 1024
const PTY_OVERFLOW_NOTICE = '\r\n[TextEx terminal output truncated]\r\n'
const APP_COMMAND_EVENT = 'app-command'
const appCommandIds = new Set<string>(APP_COMMAND_MANIFEST.map(({ id }) => id))
let appCommandCallback: ((command: AppCommandId) => void) | null = null
let appCommandListener: Promise<UnlistenFn> | null = null
let appCommandListenerGeneration = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emitUpdateEvent(event: string, ...args: unknown[]): void {
  updateCallbacks.get(event)?.(...args)
}

const onAppCommand: DesktopApi['onAppCommand'] = (callback) => {
  appCommandCallback = callback
  if (appCommandListener) return

  const generation = ++appCommandListenerGeneration
  const pending = listen<string>(APP_COMMAND_EVENT, ({ payload }) => {
    if (
      generation === appCommandListenerGeneration &&
      appCommandIds.has(payload) &&
      appCommandCallback
    ) {
      appCommandCallback(payload as AppCommandId)
    }
  })
  appCommandListener = pending
  void pending.catch(() => {
    if (appCommandListener === pending) appCommandListener = null
  })
}

const removeAppCommandListener: DesktopApi['removeAppCommandListener'] = () => {
  appCommandCallback = null
  appCommandListenerGeneration += 1
  const pending = appCommandListener
  appCommandListener = null
  void pending?.then((unlisten) => unlisten()).catch(() => undefined)
}

const openFile: DesktopApi['openFile'] = () =>
  invoke<OpenFileResult | null>(TAURI_COMMANDS.openFile)

const openDirectory: DesktopApi['openDirectory'] = () =>
  invoke<string | null>(TAURI_COMMANDS.openDirectory)

const activateProject: DesktopApi['activateProject'] = (projectPath) =>
  invoke<string>(TAURI_COMMANDS.activateProject, { projectPath })

const deactivateProject: DesktopApi['deactivateProject'] = () => {
  directoryWatcherGeneration += 1
  return invoke<{ success: boolean }>(TAURI_COMMANDS.deactivateProject)
}

const readDirectory: DesktopApi['readDirectory'] = (dirPath) =>
  invoke<DirectoryEntry[]>(TAURI_COMMANDS.readDirectory, { dirPath })

const readFile: DesktopApi['readFile'] = (filePath) =>
  invoke<OpenFileResult>(TAURI_COMMANDS.readFile, { filePath })

const saveFile: DesktopApi['saveFile'] = (content, filePath) =>
  invoke<SaveResult>(TAURI_COMMANDS.saveFile, { content, filePath })

const BINARY_FILE_PATH_HEADER = 'x-textex-file-path'

function encodeBinaryFilePath(filePath: string): string {
  const bytes = new TextEncoder().encode(filePath)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

const writeFileBinary: DesktopApi['writeFileBinary'] = (filePath, data) =>
  invoke<SaveAsResult>(TAURI_COMMANDS.writeFileBinary, data, {
    headers: { [BINARY_FILE_PATH_HEADER]: encodeBinaryFilePath(filePath) }
  })

const saveFileAs: DesktopApi['saveFileAs'] = (content) =>
  invoke<SaveAsResult | null>(TAURI_COMMANDS.saveFileAs, { content })

const saveFileBatch: DesktopApi['saveFileBatch'] = (files) =>
  invoke<SaveResult>(TAURI_COMMANDS.saveFileBatch, { files })

const createFile: DesktopApi['createFile'] = (filePath) =>
  invoke<SaveResult>(TAURI_COMMANDS.createFile, { filePath })

const createDirectory: DesktopApi['createDirectory'] = (dirPath) =>
  invoke<SaveResult>(TAURI_COMMANDS.createDirectory, { dirPath })

const copyFile: DesktopApi['copyFile'] = (source, dest) =>
  invoke<SaveResult>(TAURI_COMMANDS.copyFile, { source, dest })

const renamePath: DesktopApi['renamePath'] = (source, destination) =>
  invoke<SaveResult>(TAURI_COMMANDS.renamePath, { source, destination })

const deletePath: DesktopApi['deletePath'] = (path) =>
  invoke<SaveResult>(TAURI_COMMANDS.deletePath, { path })

const readFileBase64: DesktopApi['readFileBase64'] = (filePath) =>
  invoke<{ data: string; mimeType: string }>(TAURI_COMMANDS.readFileBase64, { filePath })

function binaryMimeType(filePath: string): string {
  const extension = filePath.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase()
  switch (extension) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

const readFileBinary: DesktopApi['readFileBinary'] = async (filePath) => {
  const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(TAURI_COMMANDS.readFileBinary, {
    filePath
  })
  return {
    mimeType: binaryMimeType(filePath),
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  }
}

const createTemplateProject: DesktopApi['createTemplateProject'] = (templateName, content, files) =>
  invoke(TAURI_COMMANDS.createTemplateProject, { templateName, content, files })

const gitIsRepo: DesktopApi['gitIsRepo'] = (workDir) =>
  invoke<boolean>(TAURI_COMMANDS.gitIsRepo, { workDir })

const gitInit: DesktopApi['gitInit'] = (workDir) => invoke(TAURI_COMMANDS.gitInit, { workDir })

const gitStatus: DesktopApi['gitStatus'] = (workDir) =>
  invoke(TAURI_COMMANDS.gitStatus, { workDir })

const gitStage: DesktopApi['gitStage'] = (workDir, filePath) =>
  invoke(TAURI_COMMANDS.gitStage, { workDir, filePath })

const gitUnstage: DesktopApi['gitUnstage'] = (workDir, filePath) =>
  invoke(TAURI_COMMANDS.gitUnstage, { workDir, filePath })

const gitCommit: DesktopApi['gitCommit'] = (workDir, message) =>
  invoke(TAURI_COMMANDS.gitCommit, { workDir, message })

const gitDiff: DesktopApi['gitDiff'] = (workDir) => invoke(TAURI_COMMANDS.gitDiff, { workDir })

const gitLog: DesktopApi['gitLog'] = (workDir) => invoke(TAURI_COMMANDS.gitLog, { workDir })

const gitFileLog: DesktopApi['gitFileLog'] = (workDir, filePath) =>
  invoke(TAURI_COMMANDS.gitFileLog, { workDir, filePath })

const saveHistorySnapshot: DesktopApi['saveHistorySnapshot'] = (filePath, content) =>
  invoke(TAURI_COMMANDS.saveHistorySnapshot, { filePath, content })

const getHistoryList: DesktopApi['getHistoryList'] = (filePath) =>
  invoke(TAURI_COMMANDS.getHistoryList, { filePath })

const loadHistorySnapshot: DesktopApi['loadHistorySnapshot'] = (filePath, snapshotPath) =>
  invoke(TAURI_COMMANDS.loadHistorySnapshot, { filePath, snapshotPath })

const loadPackageData: DesktopApi['loadPackageData'] = (packageNames) =>
  invoke(TAURI_COMMANDS.loadPackageData, { packageNames })

const getDocumentOutline: DesktopApi['getDocumentOutline'] = async (filePath, content) =>
  parseContentOutline(content, filePath)

const watchDirectory: DesktopApi['watchDirectory'] = (dirPath) => {
  const generation = ++directoryWatcherGeneration
  const onEvent = new Channel<DirectoryChangeEvent>()
  onEvent.onmessage = (event) => {
    if (generation === directoryWatcherGeneration) directoryChangeCallback?.(event)
  }
  return invoke<{ success: boolean }>(TAURI_COMMANDS.watchDirectory, { dirPath, onEvent })
}

const unwatchDirectory: DesktopApi['unwatchDirectory'] = () => {
  directoryWatcherGeneration += 1
  return invoke<{ success: boolean }>(TAURI_COMMANDS.unwatchDirectory)
}

const onDirectoryChanged: DesktopApi['onDirectoryChanged'] = (callback) => {
  directoryChangeCallback = callback
}

const removeDirectoryChangedListener: DesktopApi['removeDirectoryChangedListener'] = () => {
  directoryChangeCallback = null
}

const getProjectIndex = (): Promise<ProjectIndexSnapshot> =>
  invoke<ProjectIndexSnapshot>(TAURI_COMMANDS.getProjectIndex)

const projectInit: DesktopApi['projectInit'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectInit, { projectRoot })

const projectExists: DesktopApi['projectExists'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectExists, { projectRoot })

const projectLoad: DesktopApi['projectLoad'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectLoad, { projectRoot })

const projectSave: DesktopApi['projectSave'] = (projectRoot, partial) =>
  invoke(TAURI_COMMANDS.projectSave, { projectRoot, partial })

const projectTouch: DesktopApi['projectTouch'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectTouch, { projectRoot })

const projectCompileLoad: DesktopApi['projectCompileLoad'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectCompileLoad, { projectRoot })

const projectCompileSave: DesktopApi['projectCompileSave'] = (projectRoot, record) =>
  invoke(TAURI_COMMANDS.projectCompileSave, { projectRoot, record })

const projectCompileClear: DesktopApi['projectCompileClear'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectCompileClear, { projectRoot })

const projectCompileLogSave: DesktopApi['projectCompileLogSave'] = (projectRoot, filePath, log) =>
  invoke(TAURI_COMMANDS.projectCompileLogSave, { projectRoot, filePath, log })

const projectCompileLogLoad: DesktopApi['projectCompileLogLoad'] = (projectRoot, filePath) =>
  invoke(TAURI_COMMANDS.projectCompileLogLoad, { projectRoot, filePath })

const projectSnippetsLoad: DesktopApi['projectSnippetsLoad'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectSnippetsLoad, { projectRoot })

const projectSnippetsAdd: DesktopApi['projectSnippetsAdd'] = (projectRoot, snippet) =>
  invoke(TAURI_COMMANDS.projectSnippetsAdd, { projectRoot, snippet })

const projectSnippetsRemove: DesktopApi['projectSnippetsRemove'] = (projectRoot, id) =>
  invoke(TAURI_COMMANDS.projectSnippetsRemove, { projectRoot, id })

const projectBookmarksLoad: DesktopApi['projectBookmarksLoad'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.projectBookmarksLoad, { projectRoot })

const projectBookmarksAdd: DesktopApi['projectBookmarksAdd'] = (projectRoot, bookmark) =>
  invoke(TAURI_COMMANDS.projectBookmarksAdd, { projectRoot, bookmark })

const projectBookmarksRemove: DesktopApi['projectBookmarksRemove'] = (projectRoot, id) =>
  invoke(TAURI_COMMANDS.projectBookmarksRemove, { projectRoot, id })

const loadCitationGroups: DesktopApi['loadCitationGroups'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.loadCitationGroups, { projectRoot })

const saveCitationGroups: DesktopApi['saveCitationGroups'] = (projectRoot, groups) =>
  invoke(TAURI_COMMANDS.saveCitationGroups, { projectRoot, groups })

const parseBibFile: DesktopApi['parseBibFile'] = (filePath) =>
  invoke(TAURI_COMMANDS.parseBibFile, { filePath })

const findBibInProject: DesktopApi['findBibInProject'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.findBibInProject, { projectRoot })

const scanLabels: DesktopApi['scanLabels'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.scanLabels, { projectRoot })

const spellInit: DesktopApi['spellInit'] = (language) =>
  invoke(TAURI_COMMANDS.spellInit, { language })

const spellCheck: DesktopApi['spellCheck'] = (words) => invoke(TAURI_COMMANDS.spellCheck, { words })

const spellSuggest: DesktopApi['spellSuggest'] = (word) =>
  invoke(TAURI_COMMANDS.spellSuggest, { word })

const spellAddWord: DesktopApi['spellAddWord'] = (word) =>
  invoke(TAURI_COMMANDS.spellAddWord, { word })

const spellSetLanguage: DesktopApi['spellSetLanguage'] = (language) =>
  invoke(TAURI_COMMANDS.spellSetLanguage, { language })

const listTemplates: DesktopApi['listTemplates'] = async () => [
  ...builtInTemplates,
  ...(await invoke<Template[]>(TAURI_COMMANDS.listCustomTemplates))
]

const addTemplate: DesktopApi['addTemplate'] = (name, description, content) =>
  invoke(TAURI_COMMANDS.addCustomTemplate, { name, description, content })

const removeTemplate: DesktopApi['removeTemplate'] = (id) =>
  invoke(TAURI_COMMANDS.removeCustomTemplate, { id })

const importTemplateZip: DesktopApi['importTemplateZip'] = () =>
  invoke(TAURI_COMMANDS.importTemplateZip)

const zoteroProbe: DesktopApi['zoteroProbe'] = (port) =>
  invoke<boolean>(TAURI_COMMANDS.zoteroProbe, { port })

const zoteroSearch: DesktopApi['zoteroSearch'] = (term, port) =>
  invoke(TAURI_COMMANDS.zoteroSearch, { term, port })

const zoteroCiteCAYW: DesktopApi['zoteroCiteCAYW'] = (port) =>
  invoke(TAURI_COMMANDS.zoteroCiteCayw, { port })

const zoteroExportBibtex: DesktopApi['zoteroExportBibtex'] = (citekeys, port) =>
  invoke(TAURI_COMMANDS.zoteroExportBibtex, { citekeys, port })

const zoteroSyncCollection: DesktopApi['zoteroSyncCollection'] = (collection, targetFile, port) =>
  invoke(TAURI_COMMANDS.zoteroSyncCollection, { collection, targetFile, port })

const zoteroCollections: DesktopApi['zoteroCollections'] = (port) =>
  invoke(TAURI_COMMANDS.zoteroCollections, { port })

const zoteroAddToProject: DesktopApi['zoteroAddToProject'] = (citekey, port) =>
  invoke(TAURI_COMMANDS.zoteroAddToProject, { citekey, port })

const zoteroSaveOnline: DesktopApi['zoteroSaveOnline'] = (reference, port) =>
  invoke(TAURI_COMMANDS.zoteroSaveOnline, { reference, port })

const researchSearchOnline: DesktopApi['researchSearchOnline'] = (query) =>
  invoke(TAURI_COMMANDS.researchSearchOnline, { query })

const researchAddOnline: DesktopApi['researchAddOnline'] = (reference) =>
  invoke(TAURI_COMMANDS.researchAddOnline, { reference })

const researchLoadConfig: DesktopApi['researchLoadConfig'] = () =>
  invoke(TAURI_COMMANDS.researchLoadConfig)

const researchSaveConfig: DesktopApi['researchSaveConfig'] = (config) =>
  invoke(TAURI_COMMANDS.researchSaveConfig, { config })

const compile: DesktopApi['compile'] = (request: CompileRequest) => {
  const onEvent = new Channel<TauriCompileEvent>()
  onEvent.onmessage = (event) => {
    if (event.event === 'log') {
      const { requestId, documentId, documentRevision, text } = event
      compileLogCallback?.({ requestId, documentId, documentRevision, text })
    } else if (event.event === 'diagnostics') {
      const { requestId, documentId, documentRevision, diagnostics } = event
      diagnosticsCallback?.({ requestId, documentId, documentRevision, diagnostics })
    }
  }
  return invoke<CompileResponse>(TAURI_COMMANDS.compile, { request, onEvent })
}

const cancelCompile: DesktopApi['cancelCompile'] = () =>
  invoke<boolean>(TAURI_COMMANDS.cancelCompile)

const synctexForward: DesktopApi['synctexForward'] = (texFile, line) =>
  invoke<SyncTeXForwardResult | null>(TAURI_COMMANDS.synctexForward, { texFile, line })

const synctexInverse: DesktopApi['synctexInverse'] = (texFile, page, x, y) =>
  invoke<SyncTeXInverseResult | null>(TAURI_COMMANDS.synctexInverse, {
    texFile,
    page,
    x,
    y
  })

const synctexBuildLineMap: DesktopApi['synctexBuildLineMap'] = (texFile) =>
  invoke<SyncTeXLineMapEntry[]>(TAURI_COMMANDS.synctexBuildLineMap, { texFile })

const exportDocument: DesktopApi['exportDocument'] = (inputPath, format) =>
  invoke(TAURI_COMMANDS.exportDocument, { inputPath, format })

const getExportFormats: DesktopApi['getExportFormats'] = () =>
  invoke(TAURI_COMMANDS.getExportFormats)

const openExternal: DesktopApi['openExternal'] = (url) =>
  invoke(TAURI_COMMANDS.openExternal, { url })

const getPerformanceMemory: DesktopApi['getPerformanceMemory'] = () =>
  invoke(TAURI_COMMANDS.getPerformanceMemory)

function emitPtyData(id: string, data: string): void {
  const callbacks = ptyDataCallbacks.get(id)
  if (callbacks?.size) {
    callbacks.forEach((callback) => callback(data))
    return
  }
  const buffered = `${pendingPtyData.get(id) ?? ''}${data}`
  pendingPtyData.set(id, buffered.slice(-MAX_PENDING_PTY_DATA))
}

function clearPtySession(id: string): void {
  ptyDataCallbacks.delete(id)
  ptyExitCallbacks.delete(id)
  pendingPtyData.delete(id)
  pendingPtyExit.delete(id)
}

const ptyCreate: DesktopApi['ptyCreate'] = async (options) => {
  const onEvent = new Channel<TauriPtyEvent>()
  onEvent.onmessage = (event) => {
    if (event.event === 'data') {
      emitPtyData(event.id, event.data)
      return
    }
    if (event.event === 'overflow') {
      emitPtyData(event.id, PTY_OVERFLOW_NOTICE)
      return
    }
    const callbacks = ptyExitCallbacks.get(event.id)
    if (callbacks?.size) {
      callbacks.forEach((callback) => callback(event.exitCode, event.signal))
    } else {
      pendingPtyExit.set(event.id, { exitCode: event.exitCode, signal: event.signal })
    }
  }
  const result = await invoke<{ id: string }>(TAURI_COMMANDS.ptyCreate, { options, onEvent })
  ptyEventChannels.set(result.id, onEvent)
  return result
}

const ptyWrite: DesktopApi['ptyWrite'] = (id, data) => invoke(TAURI_COMMANDS.ptyWrite, { id, data })

const ptyResize: DesktopApi['ptyResize'] = (id, cols, rows) =>
  invoke(TAURI_COMMANDS.ptyResize, { id, cols: Math.floor(cols), rows: Math.floor(rows) })

const ptyDispose: DesktopApi['ptyDispose'] = async (id) => {
  try {
    return await invoke<{ success: boolean }>(TAURI_COMMANDS.ptyDispose, { id })
  } finally {
    const channel = ptyEventChannels.get(id)
    if (channel) channel.onmessage = () => {}
    ptyEventChannels.delete(id)
    clearPtySession(id)
  }
}

const onPtyData: DesktopApi['onPtyData'] = (id, callback) => {
  const callbacks = ptyDataCallbacks.get(id) ?? new Set()
  callbacks.add(callback)
  ptyDataCallbacks.set(id, callbacks)
  const buffered = pendingPtyData.get(id)
  if (buffered) {
    pendingPtyData.delete(id)
    callback(buffered)
  }
  return () => {
    callbacks.delete(callback)
    if (!callbacks.size) ptyDataCallbacks.delete(id)
  }
}

const onPtyExit: DesktopApi['onPtyExit'] = (id, callback) => {
  const callbacks = ptyExitCallbacks.get(id) ?? new Set()
  callbacks.add(callback)
  ptyExitCallbacks.set(id, callbacks)
  const pending = pendingPtyExit.get(id)
  if (pending) {
    pendingPtyExit.delete(id)
    callback(pending.exitCode, pending.signal)
  }
  return () => {
    callbacks.delete(callback)
    if (!callbacks.size) ptyExitCallbacks.delete(id)
  }
}

const lspStart: DesktopApi['lspStart'] = (workspaceRoot) => {
  const generation = ++lspGeneration
  const onEvent = new Channel<TauriLspEvent>()
  onEvent.onmessage = (event) => {
    if (generation !== lspGeneration) return
    if (event.event === 'message') {
      lspMessageCallback?.(event.message)
    } else {
      lspStatusCallback?.(event.status, event.error)
    }
  }
  const transition = lspTransition
    .catch(() => {})
    .then(() => {
      if (generation !== lspGeneration) return { success: false }
      return invoke<{ success: boolean }>(TAURI_COMMANDS.lspStart, { workspaceRoot, onEvent })
    })
  lspTransition = transition.then(
    () => {},
    () => {}
  )
  return transition
}

const lspStop: DesktopApi['lspStop'] = () => {
  lspGeneration += 1
  const transition = lspTransition
    .catch(() => {})
    .then(() => invoke<{ success: boolean }>(TAURI_COMMANDS.lspStop))
  lspTransition = transition.then(
    () => {},
    () => {}
  )
  return transition
}
const lspSend: DesktopApi['lspSend'] = (message) =>
  lspTransition.then(() => invoke(TAURI_COMMANDS.lspSend, { message }))
const lspStatus: DesktopApi['lspStatus'] = () =>
  lspTransition.then(() => invoke(TAURI_COMMANDS.lspStatus))
const onLspMessage: DesktopApi['onLspMessage'] = (callback) => {
  lspMessageCallback = callback
}
const removeLspMessageListener: DesktopApi['removeLspMessageListener'] = () => {
  lspMessageCallback = null
}
const onLspStatus: DesktopApi['onLspStatus'] = (callback) => {
  lspStatusCallback = callback
}
const removeLspStatusListener: DesktopApi['removeLspStatusListener'] = () => {
  lspStatusCallback = null
}

const onCompileLog: DesktopApi['onCompileLog'] = (callback) => {
  compileLogCallback = callback
}

const removeCompileLogListener: DesktopApi['removeCompileLogListener'] = () => {
  compileLogCallback = null
}

const onDiagnostics: DesktopApi['onDiagnostics'] = (callback) => {
  diagnosticsCallback = callback
}

const removeDiagnosticsListener: DesktopApi['removeDiagnosticsListener'] = () => {
  diagnosticsCallback = null
}

const loadSettings: DesktopApi['loadSettings'] = () => invoke(TAURI_COMMANDS.loadSettings)

const saveSettings: DesktopApi['saveSettings'] = (partial) =>
  invoke(TAURI_COMMANDS.saveSettings, { partial })

const setTheme: DesktopApi['setTheme'] = async () => {}

const addRecentProject: DesktopApi['addRecentProject'] = (projectPath) =>
  invoke(TAURI_COMMANDS.addRecentProject, { projectPath })

const removeRecentProject: DesktopApi['removeRecentProject'] = (projectPath) =>
  invoke(TAURI_COMMANDS.removeRecentProject, { projectPath })

const updateRecentProject: DesktopApi['updateRecentProject'] = (projectPath, updates) =>
  invoke(TAURI_COMMANDS.updateRecentProject, { projectPath, updates })

const updateCheck: DesktopApi['updateCheck'] = async () => {
  try {
    const update = await invoke<TauriUpdateMetadata | null>(TAURI_COMMANDS.checkAppUpdate)
    if (update) emitUpdateEvent('available', update.version)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

const updateDownload: DesktopApi['updateDownload'] = async () => {
  const onEvent = new Channel<TauriUpdateDownloadEvent>()
  onEvent.onmessage = (event) => {
    if (event.event === 'started') {
      emitUpdateEvent('download-progress', 0)
      return
    }
    if (event.event === 'progress') {
      const total = event.contentLength
      if (typeof total === 'number' && total > 0) {
        const percent = Math.max(0, Math.min(100, (event.downloaded / total) * 100))
        emitUpdateEvent('download-progress', percent)
      }
      return
    }
    emitUpdateEvent('downloaded')
  }

  try {
    return await invoke<{ success: boolean }>(TAURI_COMMANDS.downloadAndInstallUpdate, { onEvent })
  } catch (error) {
    const message = errorMessage(error)
    emitUpdateEvent('error', message)
    return { success: false, error: message }
  }
}

const updateInstall: DesktopApi['updateInstall'] = async () => {
  try {
    return await invoke<{ success: boolean }>(TAURI_COMMANDS.restartApp)
  } catch (error) {
    const message = errorMessage(error)
    emitUpdateEvent('error', message)
    return { success: false, error: message }
  }
}

const onUpdateEvent: DesktopApi['onUpdateEvent'] = (event, callback) => {
  updateCallbacks.set(event, callback)
}

const removeUpdateListeners: DesktopApi['removeUpdateListeners'] = () => {
  updateCallbacks.clear()
}

const tauriDesktopApi = {
  aiGenerate,
  aiProcess,
  aiProcessCustom,
  aiUpdateContext,
  aiSaveApiKey,
  aiHasApiKey,
  aiCheckCli,
  aiCheckCodexCli,
  aiOpenClaudeTerminal,
  aiOpenCodexTerminal,
  openFile,
  openDirectory,
  activateProject,
  deactivateProject,
  readDirectory,
  readFile,
  saveFile,
  writeFileBinary,
  saveFileAs,
  saveFileBatch,
  createFile,
  createDirectory,
  copyFile,
  renamePath,
  deletePath,
  readFileBase64,
  readFileBinary,
  createTemplateProject,
  gitIsRepo,
  gitInit,
  gitStatus,
  gitStage,
  gitUnstage,
  gitCommit,
  gitDiff,
  gitLog,
  gitFileLog,
  saveHistorySnapshot,
  getHistoryList,
  loadHistorySnapshot,
  loadPackageData,
  getDocumentOutline,
  watchDirectory,
  unwatchDirectory,
  onDirectoryChanged,
  removeDirectoryChangedListener,
  getProjectIndex,
  projectInit,
  projectExists,
  projectLoad,
  projectSave,
  projectTouch,
  projectCompileLoad,
  projectCompileSave,
  projectCompileClear,
  projectCompileLogSave,
  projectCompileLogLoad,
  projectSnippetsLoad,
  projectSnippetsAdd,
  projectSnippetsRemove,
  projectBookmarksLoad,
  projectBookmarksAdd,
  projectBookmarksRemove,
  loadCitationGroups,
  saveCitationGroups,
  parseBibFile,
  findBibInProject,
  scanLabels,
  spellInit,
  spellCheck,
  spellSuggest,
  spellAddWord,
  spellSetLanguage,
  listTemplates,
  addTemplate,
  removeTemplate,
  importTemplateZip,
  zoteroProbe,
  zoteroSearch,
  zoteroCiteCAYW,
  zoteroExportBibtex,
  zoteroSyncCollection,
  zoteroCollections,
  zoteroAddToProject,
  zoteroSaveOnline,
  researchSearchOnline,
  researchAddOnline,
  researchLoadConfig,
  researchSaveConfig,
  compile,
  cancelCompile,
  onCompileLog,
  removeCompileLogListener,
  onDiagnostics,
  removeDiagnosticsListener,
  synctexForward,
  synctexInverse,
  synctexBuildLineMap,
  exportDocument,
  getExportFormats,
  openExternal,
  getPerformanceMemory,
  ptyCreate,
  ptyWrite,
  ptyResize,
  ptyDispose,
  onPtyData,
  onPtyExit,
  lspStart,
  lspStop,
  lspSend,
  lspStatus,
  onLspMessage,
  removeLspMessageListener,
  onLspStatus,
  removeLspStatusListener,
  loadSettings,
  saveSettings,
  setTheme,
  addRecentProject,
  removeRecentProject,
  updateRecentProject,
  updateCheck,
  updateDownload,
  updateInstall,
  onUpdateEvent,
  removeUpdateListeners,
  onAppCommand,
  removeAppCommandListener
} satisfies DesktopApi

/**
 * Creates the Tauri implementation of the renderer's DesktopApi boundary.
 * The concrete object satisfies the complete boundary at compile time, so a
 * newly added DesktopApi method cannot silently fall through at runtime.
 */
export function createTauriApi(): DesktopApi {
  return tauriDesktopApi
}
