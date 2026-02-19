import { ipcMain } from 'electron'
import path from 'path'
import {
  initTextexFolder,
  loadProjectDb,
  saveProjectDb,
  loadCompileDb,
  saveCompileRecord,
  clearCompileDb,
  saveCompileLog,
  loadCompileLog,
  loadSnippets,
  addSnippet,
  removeSnippet,
  loadBookmarks,
  addBookmark,
  removeBookmark,
  hasTextexFolder,
  touchProject
} from '../projectData'

function validateDirPath(dirPath: unknown): string {
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    throw new Error('Invalid directory path')
  }
  if (!path.isAbsolute(dirPath)) {
    throw new Error('Directory path must be absolute')
  }
  return dirPath
}

export function registerProjectDataHandlers(): void {
  // Initialize .textex folder
  ipcMain.handle('project:init', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return initTextexFolder(validPath)
  })

  // Check if .textex folder exists
  ipcMain.handle('project:exists', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return hasTextexFolder(validPath)
  })

  // Load project database
  ipcMain.handle('project:load', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return loadProjectDb(validPath)
  })

  // Save project database (partial update)
  ipcMain.handle(
    'project:save',
    async (_event, projectRoot: string, partial: Record<string, unknown>) => {
      const validPath = validateDirPath(projectRoot)
      return saveProjectDb(validPath, partial)
    }
  )

  // Touch lastOpened timestamp
  ipcMain.handle('project:touch', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    await touchProject(validPath)
    return { success: true }
  })

  // Load compile database
  ipcMain.handle('project:compile-load', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return loadCompileDb(validPath)
  })

  // Save a compile record
  ipcMain.handle('project:compile-save', async (_event, projectRoot: string, record: unknown) => {
    const validPath = validateDirPath(projectRoot)
    return saveCompileRecord(validPath, record as Parameters<typeof saveCompileRecord>[1])
  })

  // Clear compile database
  ipcMain.handle('project:compile-clear', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return clearCompileDb(validPath)
  })

  // Save compile log
  ipcMain.handle(
    'project:compile-log-save',
    async (_event, projectRoot: string, filePath: string, log: string) => {
      const validPath = validateDirPath(projectRoot)
      return saveCompileLog(validPath, filePath, log)
    }
  )

  // Load compile log
  ipcMain.handle(
    'project:compile-log-load',
    async (_event, projectRoot: string, filePath: string) => {
      const validPath = validateDirPath(projectRoot)
      return loadCompileLog(validPath, filePath)
    }
  )

  // Load snippets
  ipcMain.handle('project:snippets-load', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return loadSnippets(validPath)
  })

  // Add snippet
  ipcMain.handle('project:snippets-add', async (_event, projectRoot: string, snippet: unknown) => {
    const validPath = validateDirPath(projectRoot)
    return addSnippet(validPath, snippet as Parameters<typeof addSnippet>[1])
  })

  // Remove snippet
  ipcMain.handle('project:snippets-remove', async (_event, projectRoot: string, id: string) => {
    const validPath = validateDirPath(projectRoot)
    await removeSnippet(validPath, id)
    return { success: true }
  })

  // Load bookmarks
  ipcMain.handle('project:bookmarks-load', async (_event, projectRoot: string) => {
    const validPath = validateDirPath(projectRoot)
    return loadBookmarks(validPath)
  })

  // Add bookmark
  ipcMain.handle(
    'project:bookmarks-add',
    async (_event, projectRoot: string, bookmark: unknown) => {
      const validPath = validateDirPath(projectRoot)
      return addBookmark(validPath, bookmark as Parameters<typeof addBookmark>[1])
    }
  )

  // Remove bookmark
  ipcMain.handle('project:bookmarks-remove', async (_event, projectRoot: string, id: string) => {
    const validPath = validateDirPath(projectRoot)
    await removeBookmark(validPath, id)
    return { success: true }
  })
}
