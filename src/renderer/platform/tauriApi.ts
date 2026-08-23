import { Channel, invoke } from '@tauri-apps/api/core'
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

type MigratedDesktopApi = Pick<
  DesktopApi,
  | 'openFile'
  | 'openDirectory'
  | 'activateProject'
  | 'readDirectory'
  | 'readFile'
  | 'saveFile'
  | 'saveFileAs'
  | 'saveFileBatch'
  | 'createFile'
  | 'createDirectory'
  | 'copyFile'
  | 'renamePath'
  | 'deletePath'
  | 'readFileBase64'
  | 'readFileBinary'
  | 'gitIsRepo'
  | 'gitInit'
  | 'gitStatus'
  | 'gitStage'
  | 'gitUnstage'
  | 'gitCommit'
  | 'gitDiff'
  | 'gitLog'
  | 'gitFileLog'
  | 'saveHistorySnapshot'
  | 'getHistoryList'
  | 'loadHistorySnapshot'
  | 'loadPackageData'
  | 'getDocumentOutline'
  | 'watchDirectory'
  | 'unwatchDirectory'
  | 'onDirectoryChanged'
  | 'removeDirectoryChangedListener'
  | 'getProjectIndex'
  | 'projectInit'
  | 'projectExists'
  | 'projectLoad'
  | 'projectSave'
  | 'projectTouch'
  | 'projectCompileLoad'
  | 'projectCompileSave'
  | 'projectCompileClear'
  | 'projectCompileLogSave'
  | 'projectCompileLogLoad'
  | 'projectSnippetsLoad'
  | 'projectSnippetsAdd'
  | 'projectSnippetsRemove'
  | 'projectBookmarksLoad'
  | 'projectBookmarksAdd'
  | 'projectBookmarksRemove'
  | 'parseBibFile'
  | 'findBibInProject'
  | 'scanLabels'
  | 'spellInit'
  | 'spellCheck'
  | 'spellSuggest'
  | 'spellAddWord'
  | 'spellSetLanguage'
  | 'zoteroProbe'
  | 'zoteroSearch'
  | 'zoteroCiteCAYW'
  | 'zoteroExportBibtex'
  | 'zoteroSyncCollection'
  | 'compile'
  | 'cancelCompile'
  | 'onCompileLog'
  | 'removeCompileLogListener'
  | 'onDiagnostics'
  | 'removeDiagnosticsListener'
  | 'synctexForward'
  | 'synctexInverse'
  | 'synctexBuildLineMap'
  | 'loadSettings'
  | 'saveSettings'
  | 'addRecentProject'
  | 'removeRecentProject'
  | 'updateRecentProject'
  | 'updateCheck'
  | 'updateDownload'
  | 'updateInstall'
  | 'onUpdateEvent'
  | 'removeUpdateListeners'
>

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

let compileLogCallback: ((event: CompileLogEvent) => void) | null = null
let diagnosticsCallback: ((event: CompileDiagnosticsEvent) => void) | null = null
let directoryChangeCallback: ((change: DirectoryChangeEvent) => void) | null = null
const updateCallbacks = new Map<string, (...args: unknown[]) => void>()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emitUpdateEvent(event: string, ...args: unknown[]): void {
  updateCallbacks.get(event)?.(...args)
}

const openFile: DesktopApi['openFile'] = () =>
  invoke<OpenFileResult | null>(TAURI_COMMANDS.openFile)

const openDirectory: DesktopApi['openDirectory'] = () =>
  invoke<string | null>(TAURI_COMMANDS.openDirectory)

const activateProject: DesktopApi['activateProject'] = (projectPath) =>
  invoke<string>(TAURI_COMMANDS.activateProject, { projectPath })

const readDirectory: DesktopApi['readDirectory'] = (dirPath) =>
  invoke<DirectoryEntry[]>(TAURI_COMMANDS.readDirectory, { dirPath })

const readFile: DesktopApi['readFile'] = (filePath) =>
  invoke<OpenFileResult>(TAURI_COMMANDS.readFile, { filePath })

const saveFile: DesktopApi['saveFile'] = (content, filePath) =>
  invoke<SaveResult>(TAURI_COMMANDS.saveFile, { content, filePath })

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
  const onEvent = new Channel<DirectoryChangeEvent>()
  onEvent.onmessage = (event) => directoryChangeCallback?.(event)
  return invoke<{ success: boolean }>(TAURI_COMMANDS.watchDirectory, { dirPath, onEvent })
}

const unwatchDirectory: DesktopApi['unwatchDirectory'] = () =>
  invoke<{ success: boolean }>(TAURI_COMMANDS.unwatchDirectory)

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

const migratedApi: MigratedDesktopApi = {
  openFile,
  openDirectory,
  activateProject,
  readDirectory,
  readFile,
  saveFile,
  saveFileAs,
  saveFileBatch,
  createFile,
  createDirectory,
  copyFile,
  renamePath,
  deletePath,
  readFileBase64,
  readFileBinary,
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
  parseBibFile,
  findBibInProject,
  scanLabels,
  spellInit,
  spellCheck,
  spellSuggest,
  spellAddWord,
  spellSetLanguage,
  zoteroProbe,
  zoteroSearch,
  zoteroCiteCAYW,
  zoteroExportBibtex,
  zoteroSyncCollection,
  compile,
  cancelCompile,
  onCompileLog,
  removeCompileLogListener,
  onDiagnostics,
  removeDiagnosticsListener,
  synctexForward,
  synctexInverse,
  synctexBuildLineMap,
  loadSettings,
  saveSettings,
  addRecentProject,
  removeRecentProject,
  updateRecentProject,
  updateCheck,
  updateDownload,
  updateInstall,
  onUpdateEvent,
  removeUpdateListeners
}

function unsupported(method: string): (...args: unknown[]) => Promise<never> {
  return () =>
    Promise.reject(
      new Error(`Desktop API method "${method}" has not been migrated to the Tauri backend yet`)
    )
}

const listenerFallbacks: Partial<DesktopApi> = {
  onAppCommand: () => {},
  removeAppCommandListener: () => {},
  onLspMessage: () => {},
  removeLspMessageListener: () => {},
  onLspStatus: () => {},
  removeLspStatusListener: () => {},
  // LSP startup still rejects explicitly while TexLab is pending, but stop is
  // called unconditionally by the shared lifecycle and must never create an
  // unhandled rejection during Tauri startup/cleanup.
  lspStop: async () => ({ success: false }),
  onPtyData: () => () => {},
  onPtyExit: () => () => {},
  setTheme: async () => {}
}

/**
 * Creates the transitional Tauri implementation of the existing DesktopApi.
 * Unsupported calls fail explicitly while event registration remains a safe
 * no-op, allowing the shared renderer to boot during incremental migration.
 */
export function createTauriApi(): DesktopApi {
  const implemented: Partial<DesktopApi> = {
    ...migratedApi,
    ...listenerFallbacks
  }

  return new Proxy(implemented, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver)
      }
      if (typeof property === 'string') {
        return unsupported(property)
      }
      return undefined
    }
  }) as DesktopApi
}
