import { CONTEXT_MENU_EVENT, CONTEXT_MENU_ID_PREFIX } from '../../shared/contextMenu'
import { Menu } from '@tauri-apps/api/menu'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import {
  Channel,
  invoke as invokeNative,
  type InvokeArgs,
  type InvokeOptions
} from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { DesktopApi, OpenFileResult, SaveAsResult, SaveResult } from '../types/api'
import type {
  DirectoryChangeEvent,
  DirectoryEntry,
  AppUpdateDownloadProgress,
  AppUpdateMetadata,
  ProjectIndexSnapshot,
  SyncTeXForwardResult,
  SyncTeXInverseResult,
  SyncTeXLineMapEntry
} from '../../shared/types'
import { TAURI_COMMANDS } from '../../shared/tauriCommands'
import { normalizeNativeError } from '../../shared/appError'
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

/**
 * The single native call site for the renderer.
 *
 * Tauri rejects with the serialized `AppError` payload, which is a plain
 * object. Normalizing here means every feature keeps catching an `Error` —
 * `errorMessage(err)` still yields the English sentence — while code that
 * needs to branch or localize can read `nativeErrorCode(err)`.
 */
function invoke<T>(
  cmd: string,
  // Forwarded as a rest tuple so a no-argument command still reaches Tauri as a
  // one-argument call rather than gaining trailing `undefined`s.
  ...rest: [args?: InvokeArgs, options?: InvokeOptions]
): Promise<T> {
  return invokeNative<T>(cmd, ...rest).catch((error: unknown) => {
    throw normalizeNativeError(error)
  })
}

// Menu activation and popup dismissal arrive independently. Keep one bounded
// dispatcher, with unique IDs so delayed events cannot target a newer menu.
let contextMenuSequence = 0
let contextMenuQueue: Promise<void> = Promise.resolve()
let contextMenuListener: Promise<UnlistenFn> | null = null
let contextMenuSelection: ((id: string) => void) | null = null
const showContextMenu: DesktopApi['showContextMenu'] = (request, onSelect, signal) => {
  if (!Number.isFinite(request.x) || !Number.isFinite(request.y) || request.items.length > 64) {
    return Promise.reject(new Error('Invalid context menu'))
  }
  const sequence = ++contextMenuSequence
  const items = request.items.map((item, index) => ({
    nativeId: `${CONTEXT_MENU_ID_PREFIX}${sequence}.${index}`,
    ...item
  }))
  const show = async () => {
    if (sequence !== contextMenuSequence || signal?.aborted) return
    if (!contextMenuListener) {
      contextMenuListener = listen<string>(CONTEXT_MENU_EVENT, ({ payload }) => {
        contextMenuSelection?.(payload)
      }).catch((error: unknown) => {
        contextMenuListener = null
        throw error
      })
    }
    await contextMenuListener
    if (sequence !== contextMenuSequence || signal?.aborted) return
    let selected = false
    contextMenuSelection = (id) => {
      const item = items.find((item) => item.nativeId === id)
      if (sequence !== contextMenuSequence || signal?.aborted || selected || !item || item.disabled)
        return
      selected = true
      onSelect(item.id)
    }
    const menu = await Menu.new({
      items: items.map((item) => ({
        id: item.nativeId,
        text: item.label.replaceAll('&', '&&'),
        enabled: !item.disabled
      }))
    })
    try {
      if (sequence === contextMenuSequence && !signal?.aborted) {
        await menu.popup(new LogicalPosition(request.x, request.y), getCurrentWindow())
      }
    } finally {
      await menu.close()
    }
  }
  const pending = contextMenuQueue.then(show)
  contextMenuQueue = pending.catch(() => {})
  return pending
}

const aiGenerate: DesktopApi['aiGenerate'] = (input, provider, model) =>
  invoke(TAURI_COMMANDS.aiGenerate, { input, provider, model })
const aiProcess: DesktopApi['aiProcess'] = (request) =>
  invoke(TAURI_COMMANDS.aiProcess, { request })
const aiProcessCustom: DesktopApi['aiProcessCustom'] = (request) =>
  invoke(TAURI_COMMANDS.aiProcessCustom, { request })
const aiResearchChat: DesktopApi['aiResearchChat'] = (request) =>
  invoke(TAURI_COMMANDS.aiResearchChat, { request })
const aiCancelResearchChat: DesktopApi['aiCancelResearchChat'] = (requestId) =>
  invoke(TAURI_COMMANDS.aiCancelResearchChat, { requestId })
const aiPlanZotero: DesktopApi['aiPlanZotero'] = (request, port) =>
  invoke(TAURI_COMMANDS.aiPlanZotero, { request, port })
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

type TauriUpdateDownloadEvent =
  | { event: 'started'; contentLength: number | null }
  | {
      event: 'progress'
      chunkLength: number
      downloaded: number
      contentLength: number | null
    }
  | { event: 'finished' }

let compileLogCallback: ((event: CompileLogEvent) => void) | null = null
let diagnosticsCallback: ((event: CompileDiagnosticsEvent) => void) | null = null
let directoryChangeCallback: ((change: DirectoryChangeEvent) => void) | null = null
let directoryWatcherGeneration = 0
const APP_COMMAND_EVENT = 'app-command'
const appCommandIds = new Set<string>(APP_COMMAND_MANIFEST.map(({ id }) => id))
let appCommandCallback: ((command: AppCommandId) => void) | null = null
let appCommandListener: Promise<UnlistenFn> | null = null
let appCommandListenerGeneration = 0
let windowCloseRequestCallback: (() => boolean | Promise<boolean>) | null = null
let windowCloseRequestListener: Promise<UnlistenFn> | null = null
let windowCloseRequestListenerGeneration = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

const onWindowCloseRequested: DesktopApi['onWindowCloseRequested'] = (callback) => {
  windowCloseRequestCallback = callback
  if (windowCloseRequestListener) return

  const generation = ++windowCloseRequestListenerGeneration
  const pending = getCurrentWindow().onCloseRequested(async (event) => {
    if (generation !== windowCloseRequestListenerGeneration) {
      event.preventDefault()
      return
    }
    const activeCallback = windowCloseRequestCallback
    if (!activeCallback) {
      event.preventDefault()
      return
    }
    try {
      if (!(await activeCallback())) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  windowCloseRequestListener = pending
  void pending.catch(() => {
    if (windowCloseRequestListener === pending) windowCloseRequestListener = null
  })
}

const removeWindowCloseRequestedListener: DesktopApi['removeWindowCloseRequestedListener'] = () => {
  windowCloseRequestCallback = null
  windowCloseRequestListenerGeneration += 1
  const pending = windowCloseRequestListener
  windowCloseRequestListener = null
  void pending?.then((unlisten) => unlisten()).catch(() => undefined)
}

const minimizeWindow: DesktopApi['minimizeWindow'] = () => getCurrentWindow().minimize()

const toggleMaximizeWindow: DesktopApi['toggleMaximizeWindow'] = () =>
  getCurrentWindow().toggleMaximize()

const startWindowDragging: DesktopApi['startWindowDragging'] = () =>
  getCurrentWindow().startDragging()

const startWindowResize: DesktopApi['startWindowResize'] = (direction) =>
  getCurrentWindow().startResizeDragging(direction)

const hideWindow: DesktopApi['hideWindow'] = () => getCurrentWindow().hide()

const requestWindowClose: DesktopApi['requestWindowClose'] = () => getCurrentWindow().close()

const exitApp: DesktopApi['exitApp'] = () => invoke(TAURI_COMMANDS.exitApp)

const openFile: DesktopApi['openFile'] = () =>
  invoke<OpenFileResult | null>(TAURI_COMMANDS.openFile)

const openDirectory: DesktopApi['openDirectory'] = () =>
  invoke<string | null>(TAURI_COMMANDS.openDirectory)

const activateProject: DesktopApi['activateProject'] = (projectPath) =>
  invoke<string>(TAURI_COMMANDS.activateProject, { projectPath })

const getActiveProject: DesktopApi['getActiveProject'] = () =>
  invoke<string | null>(TAURI_COMMANDS.getActiveProject)

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

const readCompiledPdf: DesktopApi['readCompiledPdf'] = async (filePath) => {
  const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(TAURI_COMMANDS.readCompiledPdf, {
    filePath
  })
  return {
    mimeType: 'application/pdf',
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

const gitRemoteStatus: DesktopApi['gitRemoteStatus'] = (workDir) =>
  invoke(TAURI_COMMANDS.gitRemoteStatus, { workDir })

const gitFetch: DesktopApi['gitFetch'] = (workDir) => invoke(TAURI_COMMANDS.gitFetch, { workDir })

const gitPull: DesktopApi['gitPull'] = (workDir) => invoke(TAURI_COMMANDS.gitPull, { workDir })

const gitPush: DesktopApi['gitPush'] = (workDir) => invoke(TAURI_COMMANDS.gitPush, { workDir })

const gitStage: DesktopApi['gitStage'] = (workDir, filePath) =>
  invoke(TAURI_COMMANDS.gitStage, { workDir, filePath })

const gitUnstage: DesktopApi['gitUnstage'] = (workDir, filePath) =>
  invoke(TAURI_COMMANDS.gitUnstage, { workDir, filePath })

const gitCommit: DesktopApi['gitCommit'] = (workDir, message) =>
  invoke(TAURI_COMMANDS.gitCommit, { workDir, message })

const gitFileLog: DesktopApi['gitFileLog'] = (workDir, filePath) =>
  invoke(TAURI_COMMANDS.gitFileLog, { workDir, filePath })

const getHistoryList: DesktopApi['getHistoryList'] = (filePath) =>
  invoke(TAURI_COMMANDS.getHistoryList, { filePath })

const loadHistorySnapshot: DesktopApi['loadHistorySnapshot'] = (filePath, snapshotPath) =>
  invoke(TAURI_COMMANDS.loadHistorySnapshot, { filePath, snapshotPath })

const saveRecoverySnapshot: DesktopApi['saveRecoverySnapshot'] = (filePath, content) =>
  invoke(TAURI_COMMANDS.saveRecoverySnapshot, { filePath, content })

const listRecoverySnapshots: DesktopApi['listRecoverySnapshots'] = () =>
  invoke(TAURI_COMMANDS.listRecoverySnapshots)

const loadRecoverySnapshot: DesktopApi['loadRecoverySnapshot'] = (id) =>
  invoke(TAURI_COMMANDS.loadRecoverySnapshot, { id })

const discardRecoverySnapshot: DesktopApi['discardRecoverySnapshot'] = (id) =>
  invoke(TAURI_COMMANDS.discardRecoverySnapshot, { id })

const clearRecoverySnapshot: DesktopApi['clearRecoverySnapshot'] = (filePath) =>
  invoke(TAURI_COMMANDS.clearRecoverySnapshot, { filePath })

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

const scanCitations: DesktopApi['scanCitations'] = (projectRoot) =>
  invoke(TAURI_COMMANDS.scanCitations, { projectRoot })

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

const zoteroSyncCollection: DesktopApi['zoteroSyncCollection'] = (collection, targetFile, port) =>
  invoke(TAURI_COMMANDS.zoteroSyncCollection, { collection, targetFile, port })

const zoteroLibraryTree: DesktopApi['zoteroLibraryTree'] = (port) =>
  invoke(TAURI_COMMANDS.zoteroLibraryTree, { port })

const zoteroCollectionItems: DesktopApi['zoteroCollectionItems'] = (
  collection,
  offset,
  limit,
  port
) => invoke(TAURI_COMMANDS.zoteroCollectionItems, { collection, offset, limit, port })

const zoteroOpenItem: DesktopApi['zoteroOpenItem'] = (itemKey, port) =>
  invoke(TAURI_COMMANDS.zoteroOpenItem, { itemKey, port })

const zoteroItemDetail: DesktopApi['zoteroItemDetail'] = (itemKey, port) =>
  invoke(TAURI_COMMANDS.zoteroItemDetail, { itemKey, port })

const zoteroAddToProject: DesktopApi['zoteroAddToProject'] = (citekey, port) =>
  invoke(TAURI_COMMANDS.zoteroAddToProject, { citekey, port })

const zoteroSaveOnline: DesktopApi['zoteroSaveOnline'] = (reference, port) =>
  invoke(TAURI_COMMANDS.zoteroSaveOnline, { reference, port })

const zoteroApplyMutationPlan: DesktopApi['zoteroApplyMutationPlan'] = (plan) =>
  invoke(TAURI_COMMANDS.zoteroApplyMutationPlan, { plan })

const researchSearchOnline: DesktopApi['researchSearchOnline'] = (query) =>
  invoke(TAURI_COMMANDS.researchSearchOnline, { query })

const researchAddOnline: DesktopApi['researchAddOnline'] = (reference) =>
  invoke(TAURI_COMMANDS.researchAddOnline, { reference })

const researchLoadConfig: DesktopApi['researchLoadConfig'] = () =>
  invoke(TAURI_COMMANDS.researchLoadConfig)

const researchSaveConfig: DesktopApi['researchSaveConfig'] = (config) =>
  invoke(TAURI_COMMANDS.researchSaveConfig, { config })

const researchProfileLoad: DesktopApi['researchProfileLoad'] = () =>
  invoke(TAURI_COMMANDS.researchProfileLoad)

const researchProfileSave: DesktopApi['researchProfileSave'] = (profile) =>
  invoke(TAURI_COMMANDS.researchProfileSave, { profile })

const researchChatSessionLoad: DesktopApi['researchChatSessionLoad'] = () =>
  invoke(TAURI_COMMANDS.researchChatSessionLoad)

const researchChatSessionSave: DesktopApi['researchChatSessionSave'] = (scope, session) =>
  invoke(TAURI_COMMANDS.researchChatSessionSave, { scope, session })

const researchChatSessionClear: DesktopApi['researchChatSessionClear'] = (scope) =>
  invoke(TAURI_COMMANDS.researchChatSessionClear, { scope })

const researchSourceIndex: DesktopApi['researchSourceIndex'] = (resourceId, localPath) =>
  invoke(TAURI_COMMANDS.researchSourceIndex, { resourceId, localPath })

const researchSourceClone: DesktopApi['researchSourceClone'] = (resourceId) =>
  invoke(TAURI_COMMANDS.researchSourceClone, { resourceId })

const researchSourceFetch: DesktopApi['researchSourceFetch'] = (resourceId) =>
  invoke(TAURI_COMMANDS.researchSourceFetch, { resourceId })

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

const tectonicCacheStatus: DesktopApi['tectonicCacheStatus'] = () =>
  invoke(TAURI_COMMANDS.tectonicCacheStatus)

const tectonicCacheReset: DesktopApi['tectonicCacheReset'] = () =>
  invoke(TAURI_COMMANDS.tectonicCacheReset)

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

const exportOverleafZip: DesktopApi['exportOverleafZip'] = () =>
  invoke(TAURI_COMMANDS.exportOverleafZip)

const runSubmissionCheck: DesktopApi['runSubmissionCheck'] = (request) =>
  invoke(TAURI_COMMANDS.runSubmissionCheck, { request })

const openExternal: DesktopApi['openExternal'] = (url) =>
  invoke(TAURI_COMMANDS.openExternal, { url })

const openProjectTerminal: DesktopApi['openProjectTerminal'] = () =>
  invoke(TAURI_COMMANDS.openProjectTerminal)

const getPerformanceMemory: DesktopApi['getPerformanceMemory'] = () =>
  invoke(TAURI_COMMANDS.getPerformanceMemory)

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

const setTheme: DesktopApi['setTheme'] = (theme) => {
  const nativeTheme =
    theme === 'system' ? null : theme === 'light' || theme === 'glass' ? 'light' : 'dark'
  return getCurrentWindow().setTheme(nativeTheme)
}

const addRecentProject: DesktopApi['addRecentProject'] = (projectPath) =>
  invoke(TAURI_COMMANDS.addRecentProject, { projectPath })

const removeRecentProject: DesktopApi['removeRecentProject'] = (projectPath) =>
  invoke(TAURI_COMMANDS.removeRecentProject, { projectPath })

const updateRecentProject: DesktopApi['updateRecentProject'] = (projectPath, updates) =>
  invoke(TAURI_COMMANDS.updateRecentProject, { projectPath, updates })

const updateCheck: DesktopApi['updateCheck'] = async () => {
  try {
    const update = await invoke<AppUpdateMetadata | null>(TAURI_COMMANDS.checkAppUpdate)
    return { success: true, update }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

const updateDownload: DesktopApi['updateDownload'] = async (onProgress) => {
  let downloaded = 0
  let contentLength: number | null = null
  const publishProgress = (progress: AppUpdateDownloadProgress): void => {
    try {
      onProgress?.(progress)
    } catch {
      // A renderer callback must not interrupt the native updater channel.
    }
  }
  const onEvent = new Channel<TauriUpdateDownloadEvent>()
  onEvent.onmessage = (event) => {
    if (event.event === 'started') {
      downloaded = 0
      contentLength = event.contentLength
      publishProgress({
        downloaded,
        contentLength,
        percent: typeof contentLength === 'number' && contentLength > 0 ? 0 : null
      })
      return
    }
    if (event.event === 'progress') {
      downloaded = event.downloaded
      contentLength = event.contentLength ?? contentLength
      const percent =
        typeof contentLength === 'number' && contentLength > 0
          ? Math.max(0, Math.min(100, (downloaded / contentLength) * 100))
          : null
      publishProgress({ downloaded, contentLength, percent })
      return
    }
    publishProgress({ downloaded, contentLength, percent: contentLength ? 100 : null })
  }

  try {
    const result = await invoke<{ success: boolean }>(TAURI_COMMANDS.downloadAndInstallUpdate, {
      onEvent
    })
    return result.success
      ? { success: true }
      : { success: false, error: 'the updater did not complete the download' }
  } catch (error) {
    const message = errorMessage(error)
    return { success: false, error: message }
  }
}

const updateInstall: DesktopApi['updateInstall'] = async () => {
  try {
    const result = await invoke<{ success: boolean }>(TAURI_COMMANDS.restartApp)
    return result.success
      ? { success: true }
      : { success: false, error: 'the updater did not request an application restart' }
  } catch (error) {
    const message = errorMessage(error)
    return { success: false, error: message }
  }
}

const tauriDesktopApi = {
  aiGenerate,
  aiProcess,
  aiProcessCustom,
  aiResearchChat,
  aiCancelResearchChat,
  aiPlanZotero,
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
  getActiveProject,
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
  readCompiledPdf,
  createTemplateProject,
  gitIsRepo,
  gitInit,
  gitStatus,
  gitRemoteStatus,
  gitFetch,
  gitPull,
  gitPush,
  gitStage,
  gitUnstage,
  gitCommit,
  gitFileLog,
  getHistoryList,
  loadHistorySnapshot,
  saveRecoverySnapshot,
  listRecoverySnapshots,
  loadRecoverySnapshot,
  discardRecoverySnapshot,
  clearRecoverySnapshot,
  loadPackageData,
  getDocumentOutline,
  watchDirectory,
  unwatchDirectory,
  onDirectoryChanged,
  removeDirectoryChangedListener,
  getProjectIndex,
  loadCitationGroups,
  saveCitationGroups,
  parseBibFile,
  findBibInProject,
  scanLabels,
  scanCitations,
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
  zoteroSyncCollection,
  zoteroLibraryTree,
  zoteroCollectionItems,
  zoteroOpenItem,
  zoteroItemDetail,
  zoteroAddToProject,
  zoteroSaveOnline,
  zoteroApplyMutationPlan,
  researchSearchOnline,
  researchAddOnline,
  researchLoadConfig,
  researchSaveConfig,
  researchProfileLoad,
  researchProfileSave,
  researchChatSessionLoad,
  researchChatSessionSave,
  researchChatSessionClear,
  researchSourceIndex,
  researchSourceClone,
  researchSourceFetch,
  compile,
  tectonicCacheStatus,
  tectonicCacheReset,
  onCompileLog,
  removeCompileLogListener,
  onDiagnostics,
  removeDiagnosticsListener,
  synctexForward,
  synctexInverse,
  synctexBuildLineMap,
  exportDocument,
  exportOverleafZip,
  runSubmissionCheck,
  openExternal,
  openProjectTerminal,
  exitApp,
  getPerformanceMemory,
  loadSettings,
  saveSettings,
  setTheme,
  addRecentProject,
  removeRecentProject,
  updateRecentProject,
  updateCheck,
  updateDownload,
  updateInstall,
  onAppCommand,
  removeAppCommandListener,
  minimizeWindow,
  toggleMaximizeWindow,
  startWindowDragging,
  startWindowResize,
  hideWindow,
  requestWindowClose,
  onWindowCloseRequested,
  removeWindowCloseRequestedListener,
  showContextMenu
} satisfies DesktopApi

/**
 * Creates the Tauri implementation of the renderer's DesktopApi boundary.
 * The concrete object satisfies the complete boundary at compile time, so a
 * newly added DesktopApi method cannot silently fall through at runtime.
 */
export function createTauriApi(): DesktopApi {
  return tauriDesktopApi
}
