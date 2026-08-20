import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { AppUpdater } from 'electron-updater'

type WindowGetter = () => BrowserWindow | null

export interface UpdateActionResult {
  success: boolean
  error?: string
}

let updaterPromise: Promise<AppUpdater> | null = null
let getCurrentWindow: WindowGetter | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = getCurrentWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

async function getUpdater(getWindow: WindowGetter): Promise<AppUpdater> {
  getCurrentWindow = getWindow

  if (!app.isPackaged) {
    throw new Error('Application updates are only available in packaged builds.')
  }

  if (!updaterPromise) {
    updaterPromise = import('electron-updater').then(({ autoUpdater }) => {
      // Let the user choose when to download; apply a downloaded update on restart or normal quit.
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true

      autoUpdater.on('checking-for-update', () => {
        sendToRenderer('update:checking')
      })
      autoUpdater.on('update-available', (info) => {
        sendToRenderer('update:available', info.version)
      })
      autoUpdater.on('update-not-available', () => {
        sendToRenderer('update:not-available')
      })
      autoUpdater.on('download-progress', (progress) => {
        const percent = Math.max(0, Math.min(100, progress.percent))
        sendToRenderer('update:download-progress', percent)
      })
      autoUpdater.on('update-downloaded', (info) => {
        sendToRenderer('update:downloaded', info.version)
      })
      autoUpdater.on('error', (error) => {
        sendToRenderer('update:error', error.message)
      })

      return autoUpdater
    })
  }

  return updaterPromise
}

function toErrorResult(error: unknown): UpdateActionResult {
  return { success: false, error: error instanceof Error ? error.message : String(error) }
}

export async function checkForAppUpdates(getWindow: WindowGetter): Promise<UpdateActionResult> {
  try {
    const updater = await getUpdater(getWindow)
    await updater.checkForUpdates()
    return { success: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function downloadAppUpdate(getWindow: WindowGetter): Promise<UpdateActionResult> {
  try {
    const updater = await getUpdater(getWindow)
    await updater.downloadUpdate()
    return { success: true }
  } catch (error) {
    const result = toErrorResult(error)
    sendToRenderer('update:error', result.error)
    return result
  }
}

export async function installAppUpdate(getWindow: WindowGetter): Promise<UpdateActionResult> {
  try {
    const updater = await getUpdater(getWindow)
    updater.quitAndInstall()
    return { success: true }
  } catch (error) {
    const result = toErrorResult(error)
    sendToRenderer('update:error', result.error)
    return result
  }
}
