import { Channel, invoke } from '@tauri-apps/api/core'
import type { DesktopApi, OpenFileResult, SaveAsResult, SaveResult } from '../types/api'
import type { DirectoryEntry } from '../../shared/types'
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
  | 'loadPackageData'
  | 'getDocumentOutline'
  | 'watchDirectory'
  | 'unwatchDirectory'
  | 'onDirectoryChanged'
  | 'removeDirectoryChangedListener'
  | 'compile'
  | 'cancelCompile'
  | 'onCompileLog'
  | 'removeCompileLogListener'
  | 'onDiagnostics'
  | 'removeDiagnosticsListener'
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
let directoryChangeCallback: ((change: { type: string; filename: string }) => void) | null = null
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

const loadPackageData: DesktopApi['loadPackageData'] = (packageNames) =>
  invoke(TAURI_COMMANDS.loadPackageData, { packageNames })

const getDocumentOutline: DesktopApi['getDocumentOutline'] = async (filePath, content) =>
  parseContentOutline(content, filePath)

const watchDirectory: DesktopApi['watchDirectory'] = (dirPath) => {
  const onEvent = new Channel<{ type: string; filename: string }>()
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
  loadPackageData,
  getDocumentOutline,
  watchDirectory,
  unwatchDirectory,
  onDirectoryChanged,
  removeDirectoryChangedListener,
  compile,
  cancelCompile,
  onCompileLog,
  removeCompileLogListener,
  onDiagnostics,
  removeDiagnosticsListener,
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
