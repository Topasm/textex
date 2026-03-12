import { ipcMain } from 'electron'
import {
  loadSettings,
  saveSettings,
  addRecentProject,
  removeRecentProject,
  updateRecentProject
} from '../settings'
import type { RecentProjectUpdates } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', async () => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', async (_event, partial: Record<string, unknown>) => {
    return saveSettings(partial)
  })

  ipcMain.handle('settings:add-recent-project', async (_event, projectPath: string) => {
    if (typeof projectPath !== 'string' || projectPath.length === 0) {
      throw new Error('Invalid project path')
    }
    return addRecentProject(projectPath)
  })

  ipcMain.handle('settings:remove-recent-project', async (_event, projectPath: string) => {
    if (typeof projectPath !== 'string' || projectPath.length === 0) {
      throw new Error('Invalid project path')
    }
    return removeRecentProject(projectPath)
  })

  ipcMain.handle(
    'settings:update-recent-project',
    async (_event, projectPath: string, updates: RecentProjectUpdates) => {
      if (typeof projectPath !== 'string' || projectPath.length === 0) {
        throw new Error('Invalid project path')
      }
      return updateRecentProject(projectPath, updates)
    }
  )
}
