import { ipcMain, dialog, BrowserWindow } from 'electron'
import {
  listAllTemplates,
  addCustomTemplate,
  removeCustomTemplate,
  importTemplateFromZip
} from '../templateStore'

export function registerTemplateHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('templates:list', async () => {
    return listAllTemplates()
  })

  ipcMain.handle(
    'templates:add',
    async (_event, name: string, description: string, content: string) => {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('Template name is required')
      }
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Template content is required')
      }
      return addCustomTemplate(name.trim(), (description || '').trim(), content)
    }
  )

  ipcMain.handle('templates:remove', async (_event, id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Template id is required')
    }
    return removeCustomTemplate(id)
  })

  ipcMain.handle('templates:import-zip', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Import Template from ZIP',
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return importTemplateFromZip(result.filePaths[0])
  })
}
