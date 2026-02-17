import { BrowserWindow } from 'electron'
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

let currentWindow: BrowserWindow | null = null
let handlersRegistered = false

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
}
