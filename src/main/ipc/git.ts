import { ipcMain } from 'electron'
import {
  initGit,
  getGitStatus,
  stageFile,
  unstageFile,
  gitCommit,
  getDiff,
  getLog,
  getFileLog,
  isGitRepo
} from '../git'

export function registerGitHandlers(): void {
  ipcMain.handle('git:is-repo', async (_event, workDir: string) => {
    return isGitRepo(workDir)
  })

  ipcMain.handle('git:init', async (_event, workDir: string) => {
    return initGit(workDir)
  })

  ipcMain.handle('git:status', async (_event, workDir: string) => {
    return getGitStatus(workDir)
  })

  ipcMain.handle('git:stage', async (_event, workDir: string, filePath: string) => {
    return stageFile(workDir, filePath)
  })

  ipcMain.handle('git:unstage', async (_event, workDir: string, filePath: string) => {
    return unstageFile(workDir, filePath)
  })

  ipcMain.handle('git:commit', async (_event, workDir: string, message: string) => {
    return gitCommit(workDir, message)
  })

  ipcMain.handle('git:diff', async (_event, workDir: string) => {
    return getDiff(workDir)
  })

  ipcMain.handle('git:log', async (_event, workDir: string) => {
    return getLog(workDir)
  })

  ipcMain.handle('git:file-log', async (_event, workDir: string, filePath: string) => {
    return getFileLog(workDir, filePath)
  })
}
