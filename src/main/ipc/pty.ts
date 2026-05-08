import { ipcMain, BrowserWindow } from 'electron'
import {
  createPty,
  writePty,
  resizePty,
  disposePty,
  disposeAllPtys,
  type PtyCreateOptions
} from '../services/ptyService'

export function registerPtyHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('pty:create', (_event, options: PtyCreateOptions) => {
    const win = getWindow()
    if (!win) throw new Error('No active window')
    if (!options || typeof options !== 'object') throw new Error('Options are required')
    if (!options.cwd || typeof options.cwd !== 'string') {
      throw new Error('Working directory is required')
    }
    const id = createPty(win, options)
    return { id }
  })

  ipcMain.handle('pty:write', (_event, id: string, data: string) => {
    if (typeof id !== 'string' || typeof data !== 'string') {
      throw new Error('id and data are required')
    }
    writePty(id, data)
    return { success: true }
  })

  ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
    if (typeof id !== 'string') throw new Error('id is required')
    resizePty(id, Math.floor(cols), Math.floor(rows))
    return { success: true }
  })

  ipcMain.handle('pty:dispose', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('id is required')
    disposePty(id)
    return { success: true }
  })
}

export function disposeAllPtyHandlers(window?: BrowserWindow): void {
  disposeAllPtys(window)
}
