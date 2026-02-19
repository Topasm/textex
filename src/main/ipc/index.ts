import { BrowserWindow } from 'electron'
import { DisposableStore } from '../../shared/lifecycle'
import { registerFileSystemHandlers } from './fileSystem'
import { registerCompilerHandlers } from './compiler'
import { registerSynctexHandlers } from './synctex'
import { registerSettingsHandlers } from './settings'
import { registerBibliographyHandlers } from './bibliography'
import { registerSpellcheckHandlers } from './spellcheck'
import { registerGitHandlers } from './git'
import { registerLspHandlers } from './lsp'
import { registerAiHandlers } from './ai'
import { registerHistoryHandlers } from './history'
import { registerMiscHandlers } from './misc'
import { registerTemplateHandlers } from './templates'
import { registerProjectDataHandlers } from './projectData'

let currentWindow: BrowserWindow | null = null
let handlersRegistered = false
const ipcDisposables = new DisposableStore()

function getWindow(): BrowserWindow | null {
  return currentWindow
}

export function registerIpcHandlers(win: BrowserWindow): void {
  currentWindow = win

  if (handlersRegistered) {
    return
  }
  handlersRegistered = true

  registerFileSystemHandlers(getWindow)
  registerCompilerHandlers(getWindow)
  registerSynctexHandlers()
  registerSettingsHandlers()
  registerBibliographyHandlers()
  registerSpellcheckHandlers()
  registerGitHandlers()
  registerLspHandlers(getWindow)
  registerAiHandlers()
  registerHistoryHandlers()
  registerMiscHandlers(getWindow)
  registerTemplateHandlers(getWindow)
  registerProjectDataHandlers()
}

/**
 * Dispose all IPC handlers and listeners. Called on app quit or window close
 * to ensure deterministic cleanup (no dangling listeners between reload cycles).
 */
export function disposeIpcHandlers(): void {
  ipcDisposables.dispose()
  currentWindow = null
  handlersRegistered = false
}
